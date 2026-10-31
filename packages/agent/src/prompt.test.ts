import { createVillage } from '@ai-village/sim';
import { describe, expect, it } from 'vitest';
import { facts } from './facts.js';
import {
  buildPromptMessages,
  CHARTER,
  playbooksFor,
  renderVillagerCard,
  VILLAGE_PLAYBOOK,
} from './prompt.js';

function sampleFacts() {
  return facts(createVillage(1), 'owner', 'chat');
}

describe('playbooksFor', () => {
  it('gives every role the village-wide playbook', () => {
    expect(playbooksFor('villager')).toEqual([VILLAGE_PLAYBOOK]);
  });

  it('gives the Mayor an extra playbook', () => {
    const playbooks = playbooksFor('mayor');
    expect(playbooks[0]).toBe(VILLAGE_PLAYBOOK);
    expect(playbooks).toHaveLength(2);
    expect(playbooks[1]).toContain('Being Mayor');
  });

  it('has no extra playbook yet for roles with no tools wired', () => {
    expect(playbooksFor('librarian')).toEqual([VILLAGE_PLAYBOOK]);
  });
});

describe('renderVillagerCard', () => {
  it('renders a plain villager by trade', () => {
    expect(renderVillagerCard({ id: 'ada', tradeId: 'farmer' })).toBe('You are ada, a farmer.');
  });

  it('defaults to villager when role is omitted', () => {
    expect(renderVillagerCard({ id: 'ada', tradeId: 'farmer', role: 'villager' })).toBe(
      renderVillagerCard({ id: 'ada', tradeId: 'farmer' }),
    );
  });

  it('names the Mayor by role', () => {
    expect(renderVillagerCard({ id: 'hesper', tradeId: 'farmer', role: 'mayor' })).toBe(
      'You are hesper, the Mayor (also a farmer).',
    );
  });
});

describe('buildPromptMessages', () => {
  it('orders the stable parts first, ending with the request', () => {
    const messages = buildPromptMessages({
      villager: { id: 'ada', tradeId: 'farmer' },
      facts: sampleFacts(),
      request: 'How is the farm?',
    });

    expect(messages[0]).toEqual({ role: 'system', content: CHARTER });
    expect(messages[1]).toEqual({ role: 'system', content: VILLAGE_PLAYBOOK });
    expect(messages.some((m) => m.content?.includes('You are ada, a farmer.'))).toBe(true);
    expect(messages.some((m) => m.content?.includes('THE VILLAGE TODAY'))).toBe(true);
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'How is the farm?' });
  });

  it('adds a role playbook for the Mayor, right after the village-wide one', () => {
    const messages = buildPromptMessages({
      villager: { id: 'hesper', tradeId: 'farmer', role: 'mayor' },
      facts: sampleFacts(),
      request: 'Any news?',
    });

    expect(messages[2]?.content).toContain('Being Mayor');
  });

  it('omits memories, people-here and the older-turns summary when not given', () => {
    const messages = buildPromptMessages({
      villager: { id: 'ada', tradeId: 'farmer' },
      facts: sampleFacts(),
      request: 'Hi',
    });

    expect(messages.some((m) => m.content?.includes('Earlier in this conversation'))).toBe(false);
    // Charter, village playbook, villager card, facts, request - nothing else.
    expect(messages).toHaveLength(5);
  });

  it('includes memories, people-here and an older-turns summary when given', () => {
    const messages = buildPromptMessages({
      villager: { id: 'ada', tradeId: 'farmer' },
      facts: sampleFacts(),
      request: 'Hi',
      memoriesText: 'Diary: planted wheat yesterday.',
      peopleHereText: 'Tobin: friend.',
      olderSummary: 'We talked about the harvest.',
    });

    expect(messages.some((m) => m.content === 'Diary: planted wheat yesterday.')).toBe(true);
    expect(messages.some((m) => m.content === 'Tobin: friend.')).toBe(true);
    expect(
      messages.some(
        (m) => m.content === 'Earlier in this conversation: We talked about the harvest.',
      ),
    ).toBe(true);
  });

  it('appends only the last 10 history messages, before the request', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: 'user' as const,
      content: `message ${i}`,
    }));

    const messages = buildPromptMessages({
      villager: { id: 'ada', tradeId: 'farmer' },
      facts: sampleFacts(),
      request: 'Hi',
      history,
    });

    const historyInPrompt = messages.slice(-11, -1);
    expect(historyInPrompt.map((m) => m.content)).toEqual(history.slice(-10).map((m) => m.content));
    expect(messages.at(-1)?.content).toBe('Hi');
  });
});
