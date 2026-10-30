import { describe, expect, it } from 'vitest';
import { getGood, GOODS } from './goods.js';

const EXPECTED: ReadonlyArray<[string, number, number | null]> = [
  ['wheat', 1, null],
  ['flour', 2, 30],
  ['bread', 3, 3],
  ['vegetables', 2, 5],
  ['fish', 3, 2],
  ['smoked-fish', 5, 20],
  ['apples', 2, 10],
  ['honey', 6, null],
  ['ale', 4, 20],
  ['cider', 4, 20],
  ['logs', 1, null],
  ['planks', 3, null],
  ['stone', 2, null],
  ['iron', 8, null],
  ['tools', 15, null],
  ['flowers', 2, 2],
  ['crafts', 6, null],
  ['herbs', 2, 10],
  ['remedy', 8, 10],
  ['coins', 0, null],
];

describe('goods table', () => {
  it("has exactly the version 1 goods, with the spec's price and spoilage", () => {
    expect(GOODS).toHaveLength(EXPECTED.length);
    for (const [id, basePrice, spoilsAfterDays] of EXPECTED) {
      const good = getGood(id);
      expect(good, `missing good "${id}"`).toBeDefined();
      expect(good?.basePrice).toBe(basePrice);
      expect(good?.spoilsAfterDays).toBe(spoilsAfterDays);
    }
  });

  it('gives tools a wear count and no other good one', () => {
    expect(getGood('tools')?.wearsAfterUses).toBe(20);
    expect(getGood('bread')?.wearsAfterUses).toBeUndefined();
  });
});
