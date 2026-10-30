import { describe, expect, it } from 'vitest';
import { HAPPENINGS, type HappeningCard } from './happenings.js';

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

  it('gives every card a real condition - none are notYetModeled anymore', () => {
    const notYetModeled = (HAPPENINGS as readonly HappeningCard[]).filter(
      (card) => card.condition.kind === 'notYetModeled',
    );
    expect(notYetModeled).toEqual([]);
  });

  it('gives "a traveller asks for work" a free-bed condition', () => {
    const traveller = HAPPENINGS.find((card) => card.id === 'traveller-asks-for-work');
    expect(traveller?.condition).toEqual({ kind: 'freeBedAvailable' });
  });

  it('gives quarrel and proposal real, relationship-based conditions', () => {
    const quarrel = HAPPENINGS.find((card) => card.id === 'quarrel');
    const proposal = HAPPENINGS.find((card) => card.id === 'proposal');
    expect(quarrel?.condition.kind).toBe('anyPairAffinityBelow');
    expect(proposal?.condition.kind).toBe('anySweetheartForDays');
  });

  it('gives bumper harvest an autumn-plus-weather-streak condition', () => {
    const bumperHarvest = HAPPENINGS.find((card) => card.id === 'bumper-harvest');
    expect(bumperHarvest?.condition).toEqual({
      kind: 'all',
      of: [
        { kind: 'season', seasons: ['autumn'] },
        { kind: 'weatherStreak', weather: ['clear'], days: 5 },
      ],
    });
  });
});
