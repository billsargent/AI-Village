import { describe, expect, it } from 'vitest';
import { HAPPENINGS } from './happenings.js';

describe('happenings table', () => {
  it('has all 11 spec section 5 cards', () => {
    expect(HAPPENINGS).toHaveLength(11);
  });

  it('has no duplicate ids', () => {
    const ids = HAPPENINGS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('flags chimney fire and illness as damage/illness, and nothing else', () => {
    const flagged = HAPPENINGS.filter((card) => card.isDamageOrIllness).map((card) => card.id);
    expect(new Set(flagged)).toEqual(new Set(['chimney-fire', 'illness']));
  });

  it('marks the two cards that still need unmodeled state as notYetModeled', () => {
    const notYetModeled = HAPPENINGS.filter((card) => card.condition.kind === 'notYetModeled').map(
      (card) => card.id,
    );
    expect(new Set(notYetModeled)).toEqual(new Set(['traveller-asks-for-work', 'bumper-harvest']));
  });

  it('gives quarrel and proposal real, relationship-based conditions', () => {
    const quarrel = HAPPENINGS.find((card) => card.id === 'quarrel');
    const proposal = HAPPENINGS.find((card) => card.id === 'proposal');
    expect(quarrel?.condition.kind).toBe('anyPairAffinityBelow');
    expect(proposal?.condition.kind).toBe('anySweetheartForDays');
  });
});
