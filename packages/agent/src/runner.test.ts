import type { ChatCompletionResult, ToolCall } from '@ai-village/integrations';
import { createVillage, getBalance } from '@ai-village/sim';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApprovalsInbox } from './approvals.js';
import { facts } from './facts.js';
import { runChat, runTurn, type ModelClient, type TurnContext } from './runner.js';
import { GIFT_TOOL } from './sim-tools.js';
import { defineTool } from './tools.js';

function scriptedClient(reply: string): { client: ModelClient; sentMessages: unknown[] } {
  const sentMessages: unknown[] = [];
  const client: ModelClient = {
    chatCompletion(messages) {
      sentMessages.push(messages);
      return Promise.resolve({
        text: reply,
        usage: { promptTokens: 42, completionTokens: 7, totalTokens: 49 },
      });
    },
  };
  return { client, sentMessages };
}

function sequentialClient(
  responses: readonly { text: string; toolCalls?: readonly ToolCall[] }[],
): { client: ModelClient; sentMessages: unknown[] } {
  let step = 0;
  const sentMessages: unknown[] = [];
  const client: ModelClient = {
    chatCompletion(messages) {
      sentMessages.push(messages);
      const response = responses[step] ?? responses[responses.length - 1];
      step++;
      const result: ChatCompletionResult = {
        text: response?.text ?? '',
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
        ...(response?.toolCalls ? { toolCalls: response.toolCalls } : {}),
      };
      return Promise.resolve(result);
    },
  };
  return { client, sentMessages };
}

describe('runChat', () => {
  it('sends the facts block and the request, and returns the reply', async () => {
    const { client, sentMessages } = scriptedClient('Yes, the bakery has flour.');
    const village = createVillage(1, { builtBuildingIds: ['bakery'] });
    const snapshot = facts(village, 'owner', 'chat');

    const result = await runChat(client, snapshot, { id: 'tobin', tradeId: 'baker' }, 'Any flour?');

    expect(result.reply).toBe('Yes, the bakery has flour.');

    const messages = sentMessages[0] as { role: string; content: string }[];
    expect(messages.some((m) => m.content.includes('THE VILLAGE TODAY'))).toBe(true);
    expect(messages.some((m) => m.content === 'Any flour?')).toBe(true);
  });

  it('threads promptExtras (memories, people here, older-turns summary) into the prompt', async () => {
    const { client, sentMessages } = scriptedClient('ok');
    const village = createVillage(1);
    const snapshot = facts(village, 'owner', 'chat');

    await runChat(client, snapshot, { id: 'ada', tradeId: 'farmer' }, 'Hi', [], {
      memoriesText: 'Diary: a quiet day.',
      peopleHereText: 'Tobin: friend.',
      olderSummary: 'We discussed the harvest.',
    });

    const messages = sentMessages[0] as { role: string; content: string }[];
    expect(messages.some((m) => m.content === 'Diary: a quiet day.')).toBe(true);
    expect(messages.some((m) => m.content === 'Tobin: friend.')).toBe(true);
    expect(
      messages.some((m) => m.content === 'Earlier in this conversation: We discussed the harvest.'),
    ).toBe(true);
  });

  it('appends a meter record with the villager, purpose and token usage', async () => {
    const { client } = scriptedClient('A short reply.');
    const village = createVillage(1);
    const snapshot = facts(village, 'owner', 'chat');

    const result = await runChat(
      client,
      snapshot,
      { id: 'ada', tradeId: 'farmer' },
      "How's the farm?",
    );

    expect(result.meter).toHaveLength(1);
    expect(result.meter[0]).toMatchObject({
      purpose: 'chat',
      villagerId: 'ada',
      model: 'deepseek-chat',
      tokensIn: 42,
      tokensOut: 7,
    });
  });

  it('appends to an existing meter rather than replacing it', async () => {
    const { client } = scriptedClient('ok');
    const village = createVillage(1);
    const snapshot = facts(village, 'owner', 'chat');
    const priorMeter = [
      {
        at: 0,
        purpose: 'chat',
        villagerId: 'wren',
        model: 'deepseek-chat',
        tokensIn: 1,
        tokensCached: 0,
        tokensOut: 1,
        tokensReasoning: 0,
        costUsd: 0,
        ms: 1,
      },
    ];

    const result = await runChat(
      client,
      snapshot,
      { id: 'ada', tradeId: 'farmer' },
      'hi',
      priorMeter,
    );

    expect(result.meter).toHaveLength(2);
  });
});

function villageWithGiftableStock() {
  return createVillage(1, {
    villagers: [
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
    ],
    startingStock: [{ account: 'villager:ada', item: 'bread', qty: 10 }],
  });
}

describe('runTurn', () => {
  it('runs a tool call, feeds the result back, and returns the final reply', async () => {
    const village = villageWithGiftableStock();
    const { client } = sequentialClient([
      {
        text: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'gift',
            arguments: JSON.stringify({ from: 'ada', to: 'tobin', item: 'bread', qty: 1 }),
          },
        ],
      },
      { text: 'Done - Tobin got some bread.' },
    ]);
    const ctx: TurnContext = {
      state: village,
      tools: [GIFT_TOOL],
      turn: { tainted: false },
      sessionApprovedToolIds: new Set(),
      inbox: createApprovalsInbox(),
    };

    const result = await runTurn(
      client,
      facts(village, 'owner', 'chat'),
      { id: 'ada', tradeId: 'farmer' },
      'Give Tobin some bread',
      ctx,
    );

    expect(result.reply).toBe('Done - Tobin got some bread.');
    expect(getBalance(result.state.ledger, 'villager:tobin', 'bread')).toBe(1);
    expect(result.events).toEqual([
      { kind: 'GiftGiven', from: 'ada', to: 'tobin', item: 'bread', qty: 1 },
    ]);
    expect(result.meter).toHaveLength(2);
  });

  it('stops and reports a tool call that needs approval, without running it', async () => {
    const village = villageWithGiftableStock();
    const needsApprovalTool = defineTool({
      id: 'risky_thing',
      title: 'A risky thing',
      kind: 'game',
      risk: 'medium',
      approval: 'per-session',
      roles: ['villager'],
      purposes: ['chat'],
      costUsd: 0,
      args: z.object({}),
    });
    const { client } = sequentialClient([
      { text: '', toolCalls: [{ id: 'call_1', name: 'risky_thing', arguments: '{}' }] },
    ]);
    const ctx: TurnContext = {
      state: village,
      tools: [needsApprovalTool],
      turn: { tainted: false },
      sessionApprovedToolIds: new Set(),
      inbox: createApprovalsInbox(),
    };

    const result = await runTurn(
      client,
      facts(village, 'owner', 'chat'),
      { id: 'ada', tradeId: 'farmer' },
      'Do the risky thing',
      ctx,
    );

    expect(result.inbox.requests).toHaveLength(1);
    expect(result.inbox.requests[0]).toMatchObject({
      toolId: 'risky_thing',
      args: {},
      requestedBy: 'ada',
      status: 'pending',
    });
    expect(result.state).toBe(village);
    expect(result.events).toEqual([]);
  });

  it('reports an unknown tool and malformed arguments without crashing, then still returns a final reply', async () => {
    const village = villageWithGiftableStock();
    const { client } = sequentialClient([
      {
        text: '',
        toolCalls: [
          { id: 'call_1', name: 'nonexistent', arguments: '{}' },
          { id: 'call_2', name: 'gift', arguments: '{"from":"ada"}' },
        ],
      },
      { text: 'Sorry about that.' },
    ]);
    const ctx: TurnContext = {
      state: village,
      tools: [GIFT_TOOL],
      turn: { tainted: false },
      sessionApprovedToolIds: new Set(),
      inbox: createApprovalsInbox(),
    };

    const result = await runTurn(
      client,
      facts(village, 'owner', 'chat'),
      { id: 'ada', tradeId: 'farmer' },
      'Give Tobin some bread',
      ctx,
    );

    expect(result.reply).toBe('Sorry about that.');
    expect(result.events).toEqual([]);
    expect(result.state).toBe(village);
  });

  it("stops at the purpose's maxSteps without a final reply", async () => {
    const village = villageWithGiftableStock();
    const { client } = sequentialClient([
      {
        text: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'gift',
            arguments: JSON.stringify({ from: 'ada', to: 'tobin', item: 'bread', qty: 1 }),
          },
        ],
      },
    ]);
    const ctx: TurnContext = {
      state: village,
      tools: [GIFT_TOOL],
      turn: { tainted: false },
      sessionApprovedToolIds: new Set(),
      inbox: createApprovalsInbox(),
    };

    const result = await runTurn(
      client,
      facts(village, 'owner', 'chat'),
      { id: 'ada', tradeId: 'farmer' },
      'Keep gifting',
      ctx,
    );

    expect(result.ranOutOfSteps).toBe(true);
    expect(result.reply).toBe('');
    expect(result.meter).toHaveLength(4);
    expect(getBalance(result.state.ledger, 'villager:tobin', 'bread')).toBe(4);
  });
});
