import { describe, expect, it } from 'vitest';
import { createVillage } from '@ai-village/sim';
import { facts } from './facts.js';
import { runChat, type ModelClient } from './runner.js';

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
