import { describe, expect, it } from 'vitest';
import { seededRandom, weightedPick } from './random.js';

describe('seededRandom', () => {
  it('is deterministic for the same key', () => {
    const a = seededRandom({ villageSeed: 7, day: 3, system: 'weather', entity: 'village' });
    const b = seededRandom({ villageSeed: 7, day: 3, system: 'weather', entity: 'village' });
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it("changing one entity's id never changes another entity's sequence", () => {
    const before = seededRandom({ villageSeed: 7, day: 3, system: 'work', entity: 'villager-1' });
    const beforeSequence = Array.from({ length: 5 }, () => before());

    // Simulate "adding a villager": draw a stream for a brand new entity id
    // first, then re-derive villager-1's stream. It must reproduce exactly.
    const other = seededRandom({ villageSeed: 7, day: 3, system: 'work', entity: 'villager-2' });
    other();

    const after = seededRandom({ villageSeed: 7, day: 3, system: 'work', entity: 'villager-1' });
    const afterSequence = Array.from({ length: 5 }, () => after());

    expect(afterSequence).toEqual(beforeSequence);
  });

  it('produces values in [0, 1)', () => {
    const rng = seededRandom({ villageSeed: 1, day: 1, system: 'x', entity: 'y' });
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('weightedPick', () => {
  it('always picks the only item with all the weight', () => {
    const rng = seededRandom({ villageSeed: 1, day: 1, system: 'x', entity: 'y' });
    const pick = weightedPick(['a', 'b', 'c'], [0, 100, 0], rng);
    expect(pick).toBe('b');
  });
});
