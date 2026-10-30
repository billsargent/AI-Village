import type { HappeningCard } from '@ai-village/content';
import { describe, expect, it } from 'vitest';
import { pickHappening, type StorytellerContext } from './storyteller.js';

const BASE_CONTEXT: StorytellerContext = {
  villageSeed: 1,
  day: 0,
  style: 'lively',
  season: 'spring',
  weather: 'clear',
  isMarketDay: false,
  builtBuildingIds: [],
  daysSinceLastHappening: 0,
  villagerIds: [],
  relationships: {},
};

function card(overrides: Partial<HappeningCard>): HappeningCard {
  return {
    id: 'test-card',
    title: 'Test card',
    condition: { kind: 'always' },
    weight: 1,
    effect: '',
    chronicleLine: 'something happened',
    isDamageOrIllness: false,
    decisionFor: null,
    ...overrides,
  };
}

describe('pickHappening', () => {
  it('never fires when there are no eligible cards', () => {
    const result = pickHappening([card({ condition: { kind: 'notYetModeled' } })], BASE_CONTEXT);
    expect(result).toBeNull();
  });

  it('excludes damage/illness cards under the Gentle style', () => {
    const damageCard = card({ id: 'ouch', isDamageOrIllness: true });
    const fires = new Set<string | null>();
    for (let day = 0; day < 200; day++) {
      const result = pickHappening([damageCard], { ...BASE_CONTEXT, style: 'gentle', day });
      fires.add(result?.id ?? null);
    }
    expect(fires).toEqual(new Set([null]));
  });

  it('is more likely to fire after a long calm streak than right after a happening', () => {
    const eligible = [card({})];
    let firedCalm = 0;
    let firedRightAfter = 0;
    const trials = 500;
    for (let day = 0; day < trials; day++) {
      if (pickHappening(eligible, { ...BASE_CONTEXT, day, daysSinceLastHappening: 10 })) {
        firedCalm++;
      }
      if (pickHappening(eligible, { ...BASE_CONTEXT, day, daysSinceLastHappening: 0 })) {
        firedRightAfter++;
      }
    }
    expect(firedCalm).toBeGreaterThan(firedRightAfter);
  });

  it('is deterministic for a given seed and day', () => {
    const eligible = [card({ id: 'a' }), card({ id: 'b' })];
    const a = pickHappening(eligible, BASE_CONTEXT);
    const b = pickHappening(eligible, BASE_CONTEXT);
    expect(a?.id).toBe(b?.id);
  });

  it('only picks cards whose condition holds', () => {
    const marketOnly = card({ id: 'market', condition: { kind: 'marketDay' } });
    for (let day = 0; day < 100; day++) {
      const result = pickHappening([marketOnly], { ...BASE_CONTEXT, day, isMarketDay: false });
      expect(result).toBeNull();
    }
  });

  it("fires the quarrel-style card only when a pair's affinity is low enough", () => {
    const quarrelCard = card({
      id: 'quarrel',
      condition: { kind: 'anyPairAffinityBelow', threshold: -40 },
    });
    const noQuarrel = { ...BASE_CONTEXT, villagerIds: ['a', 'b'], relationships: {} };
    const withQuarrel = {
      ...BASE_CONTEXT,
      villagerIds: ['a', 'b'],
      relationships: { 'a::b': { affinity: -50, familiarity: 10, sweetheartSinceDay: null } },
    };
    for (let day = 0; day < 50; day++) {
      expect(pickHappening([quarrelCard], { ...noQuarrel, day })).toBeNull();
    }
    const fires = Array.from({ length: 50 }, (_, day) =>
      pickHappening([quarrelCard], { ...withQuarrel, day }),
    );
    expect(fires.some((result) => result?.id === 'quarrel')).toBe(true);
  });

  it('fires the proposal-style card only once a pair has been sweethearts long enough', () => {
    const proposalCard = card({
      id: 'proposal',
      condition: { kind: 'anySweetheartForDays', days: 14 },
    });
    const tooRecent = {
      ...BASE_CONTEXT,
      villagerIds: ['a', 'b'],
      relationships: { 'a::b': { affinity: 80, familiarity: 80, sweetheartSinceDay: 5 } },
    };
    const longEnough = {
      ...BASE_CONTEXT,
      villagerIds: ['a', 'b'],
      relationships: { 'a::b': { affinity: 80, familiarity: 80, sweetheartSinceDay: 0 } },
    };
    expect(pickHappening([proposalCard], { ...tooRecent, day: 10 })).toBeNull();
    const fires = Array.from({ length: 50 }, (_, day) =>
      pickHappening([proposalCard], { ...longEnough, day: day + 14 }),
    );
    expect(fires.some((result) => result?.id === 'proposal')).toBe(true);
  });
});
