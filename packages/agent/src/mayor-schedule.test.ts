import type { ChatCompletionResult, ToolCall } from '@ai-village/integrations';
import { createVillage } from '@ai-village/sim';
import { describe, expect, it } from 'vitest';
import { createApprovalsInbox } from './approvals.js';
import type { Meter } from './meter.js';
import { runMayorDay } from './mayor-schedule.js';
import type { ModelClient } from './runner.js';

function scriptedClient(reply: string): { client: ModelClient; sentMessages: unknown[] } {
  const sentMessages: unknown[] = [];
  const client: ModelClient = {
    chatCompletion(messages) {
      sentMessages.push(messages);
      return Promise.resolve({
        text: reply,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
    },
  };
  return { client, sentMessages };
}

function toolCallClient(
  toolCalls: readonly ToolCall[],
  finalReply: string,
): { client: ModelClient; sentMessages: unknown[] } {
  let step = 0;
  const sentMessages: unknown[] = [];
  const client: ModelClient = {
    chatCompletion(messages) {
      sentMessages.push(messages);
      step++;
      const result: ChatCompletionResult =
        step === 1
          ? {
              text: '',
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
              toolCalls,
            }
          : {
              text: finalReply,
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            };
      return Promise.resolve(result);
    },
  };
  return { client, sentMessages };
}

function villageWithMayor() {
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

describe('runMayorDay', () => {
  it('advances the village by one day even when there is no Mayor', async () => {
    const { client } = scriptedClient('unused');
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 100 }],
    });

    const result = await runMayorDay(client, village, createApprovalsInbox());

    expect(result.state.clock.minute).toBe(village.clock.minute + 1440);
    expect(result.reply).toBe('');
  });

  it("runs the Mayor's turn after the day advances, with their governance tools", async () => {
    const { client, sentMessages } = scriptedClient('All quiet today - nothing needs you.');
    const village = villageWithMayor();

    const result = await runMayorDay(client, village, createApprovalsInbox());

    expect(result.reply).toBe('All quiet today - nothing needs you.');
    expect(result.meter).toHaveLength(1);
    expect(result.meter[0]).toMatchObject({ purpose: 'mayor-duties', villagerId: 'hesper' });

    const [messages] = sentMessages as [{ role: string; content: string }[]];
    expect(messages.some((m) => m.content.includes('THE VILLAGE TODAY'))).toBe(true);
  });

  it('runs a real propose_hire call and lands a pending approval, carrying the inbox forward', async () => {
    const { client } = toolCallClient(
      [
        {
          id: 'call_1',
          name: 'propose_hire',
          arguments: JSON.stringify({ tradeId: 'fisher', reason: 'nobody fishes yet' }),
        },
      ],
      'unused - the turn stops at the approval request',
    );
    const village = villageWithMayor();

    const result = await runMayorDay(client, village, createApprovalsInbox());

    expect(result.inbox.requests).toHaveLength(1);
    expect(result.inbox.requests[0]).toMatchObject({
      toolId: 'propose_hire',
      requestedBy: 'hesper',
      status: 'pending',
    });
    // The day itself still ran, independent of whether the Mayor's turn settled.
    expect(result.state.clock.minute).toBe(village.clock.minute + 1440);
  });

  it('carries forward a prior meter rather than replacing it', async () => {
    const { client } = scriptedClient('ok');
    const village = villageWithMayor();
    const priorMeter: Meter = [
      {
        at: 0,
        purpose: 'chat',
        villagerId: 'ada',
        model: 'deepseek-chat',
        tokensIn: 1,
        tokensCached: 0,
        tokensOut: 1,
        tokensReasoning: 0,
        costUsd: 0,
        ms: 1,
      },
    ];

    const result = await runMayorDay(client, village, createApprovalsInbox(), priorMeter);

    expect(result.meter).toHaveLength(2);
  });
});
