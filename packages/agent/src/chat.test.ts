import type { ChatCompletionResult, ChatMessage, ToolCall } from '@ai-village/integrations';
import { createVillage } from '@ai-village/sim';
import { describe, expect, it } from 'vitest';
import { createApprovalsInbox } from './approvals.js';
import {
  CHAT_FALLBACKS,
  chatToolsFor,
  OWNER_HERE,
  runVillagerChat,
  type ChatLine,
} from './chat.js';
import type { ModelClient } from './runner.js';

const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };

/** Answers each call with the next scripted result, recording what it was sent. */
function scriptedClient(results: readonly ChatCompletionResult[]) {
  const sent: (readonly ChatMessage[])[] = [];
  const toolNames: string[][] = [];
  let step = 0;
  const client: ModelClient = {
    chatCompletion(messages, options) {
      sent.push([...messages]);
      toolNames.push((options.tools ?? []).map((tool) => tool.name));
      const result = results[Math.min(step, results.length - 1)];
      step++;
      if (!result) {
        throw new Error('No scripted result');
      }
      return Promise.resolve(result);
    },
  };
  return { client, sent, toolNames };
}

function village() {
  return createVillage(1, {
    villagers: [
      {
        villagerId: 'hesper',
        tradeId: 'mayor',
        skillLevel: 1,
        hasTool: false,
        moodFactor: 1,
        role: 'mayor',
      },
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
    ],
    startingStock: [{ account: 'treasury', item: 'coins', qty: 100 }],
  });
}

describe('chatToolsFor', () => {
  it("gives a villager the everyday chat tools, and the Mayor their governance tools too - but not the morning's hire", () => {
    const villagerTools = chatToolsFor('villager').map((tool) => tool.id);
    expect(villagerTools).toEqual(
      expect.arrayContaining(['gift', 'post_on_board', 'remember', 'promise', 'request_work']),
    );
    expect(villagerTools).not.toContain('accept_order');

    const mayorTools = chatToolsFor('mayor').map((tool) => tool.id);
    expect(mayorTools).toEqual(expect.arrayContaining(['remember', 'accept_order', 'call_vote']));
    expect(mayorTools).not.toContain('propose_hire');
  });
});

describe('runVillagerChat', () => {
  it('sends the conversation so far, then the owner message, and returns the reply', async () => {
    const { client, sent, toolNames } = scriptedClient([
      { text: 'Wheat is coming along.', usage: USAGE },
    ]);
    const history: ChatLine[] = [
      { from: 'owner', text: 'Morning, Ada.', at: 1 },
      { from: 'villager', text: 'Morning!', at: 2 },
    ];

    const result = await runVillagerChat(
      client,
      village(),
      createApprovalsInbox(),
      'ada',
      'How are the fields?',
      history,
    );

    expect(result.reply).toBe('Wheat is coming along.');
    expect(result.meter).toHaveLength(1);
    expect(result.meter[0]?.purpose).toBe('chat');
    const messages = sent[0] ?? [];
    expect(messages.slice(-3)).toEqual([
      { role: 'user', content: 'Morning, Ada.' },
      { role: 'assistant', content: 'Morning!' },
      { role: 'user', content: 'How are the fields?' },
    ]);
    expect(messages.some((m) => m.role === 'system' && m.content?.includes('You are ada'))).toBe(
      true,
    );
    expect(toolNames[0]).toContain('remember');
    expect(messages.some((m) => m.role === 'system' && m.content === OWNER_HERE)).toBe(true);
  });

  it("runs a game tool the villager calls, and the next chat's prompt carries what they remembered", async () => {
    const remember: ToolCall = {
      id: 'call_1',
      name: 'remember',
      arguments: JSON.stringify({
        villagerId: 'ada',
        text: 'The owner likes plum jam',
        importance: 6,
      }),
    };
    const first = scriptedClient([
      { text: '', usage: USAGE, toolCalls: [remember] },
      { text: "I'll remember that.", usage: USAGE },
    ]);
    const after = await runVillagerChat(
      first.client,
      village(),
      createApprovalsInbox(),
      'ada',
      'I love plum jam.',
      [],
    );
    expect(after.reply).toBe("I'll remember that.");
    expect(after.meter).toHaveLength(2);
    expect(after.state.memory.memories.map((m) => m.text)).toEqual(['The owner likes plum jam']);

    const second = scriptedClient([{ text: 'Plum jam, yes.', usage: USAGE }]);
    await runVillagerChat(second.client, after.state, after.inbox, 'ada', 'What do I like?', []);
    const system = (second.sent[0] ?? []).filter((m) => m.role === 'system');
    expect(system.some((m) => m.content?.includes('The owner likes plum jam'))).toBe(true);
  });

  it('says it lost its thread, rather than nothing, when the steps run out', async () => {
    const loop: ToolCall = { id: 'c', name: 'no_such_tool', arguments: '{}' };
    const { client } = scriptedClient([{ text: '', usage: USAGE, toolCalls: [loop] }]);
    const result = await runVillagerChat(
      client,
      village(),
      createApprovalsInbox(),
      'ada',
      'Hi',
      [],
    );
    expect(result.reply).toBe(CHAT_FALLBACKS.ranOutOfSteps);
    expect(result.meter).toHaveLength(4);
  });

  it("doesn't call the model when the budget is spent, and says so", async () => {
    const { client, sent } = scriptedClient([{ text: 'unused', usage: USAGE }]);
    const result = await runVillagerChat(
      client,
      village(),
      createApprovalsInbox(),
      'ada',
      'Hi',
      [],
      [
        {
          at: Date.now(),
          purpose: 'chat',
          villagerId: 'ada',
          model: 'deepseek-flash',
          tokensIn: 0,
          tokensCached: 0,
          tokensOut: 0,
          tokensReasoning: 0,
          costUsd: 5,
          ms: 1,
        },
      ],
      // The owner's own chat is never stopped by the monthly ceiling (spec
      // section 16) - only by the per-villager daily cap, when it's on.
      { monthlyCeilingUsd: 100, perVillagerPerDayUsd: 1, noLimits: false },
    );
    expect(sent).toHaveLength(0);
    expect(result.reply).toBe(CHAT_FALLBACKS.budget);
    expect(result.budgetExceeded).toBeDefined();
  });

  it('throws for a villager who does not live here', async () => {
    const { client } = scriptedClient([{ text: 'x', usage: USAGE }]);
    await expect(
      runVillagerChat(client, village(), createApprovalsInbox(), 'nobody', 'Hi', []),
    ).rejects.toThrow(/No villager/);
  });
});
