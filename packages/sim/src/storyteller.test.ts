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
});
