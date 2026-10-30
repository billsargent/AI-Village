import { describe, expect, it } from 'vitest';
import { BUILDINGS, getBuilding } from './buildings.js';
import { TRADES } from './trades.js';

describe('buildings table', () => {
  it("has a building for every trade's work site", () => {
    for (const trade of TRADES) {
      expect(
        getBuilding(trade.worksAt),
        `trade "${trade.id}" works at "${trade.worksAt}"`,
      ).toBeDefined();
    }
  });

  it('gates the bakery, post office, shop, smithy, school and chapel by population', () => {
    expect(getBuilding('bakery')?.unlocksAtPopulation).toBe(4);
    expect(getBuilding('post-office')?.unlocksAtPopulation).toBe(5);
    expect(getBuilding('shop')?.unlocksAtPopulation).toBe(5);
    expect(getBuilding('smithy')?.unlocksAtPopulation).toBe(7);
    expect(getBuilding('school')?.unlocksAtPopulation).toBe(8);
    expect(getBuilding('chapel')?.unlocksAtPopulation).toBe(8);
  });

  it('has no duplicate building ids', () => {
    const ids = BUILDINGS.map((building) => building.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks only fields and cottage as multi-instance', () => {
    const multiInstance = BUILDINGS.filter((building) => building.multiInstance).map(
      (building) => building.id,
    );
    expect(new Set(multiInstance)).toEqual(new Set(['fields', 'cottage']));
  });
});
