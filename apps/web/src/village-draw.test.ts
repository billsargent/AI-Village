import { describe, expect, it } from 'vitest';
import { builtBuildingsNow, planCanvasDraw, whereaboutsNow } from './village-draw.js';
import type { VillageFacts } from './village-api.js';

const BASE_FACTS: VillageFacts = {
  weekday: 'Moonday',
  season: 'spring',
  seasonDay: 1,
  year: 0,
  hour: 9,
  minuteOfHour: 0,
  phase: 'work-first-stint',
  weather: 'clear',
  isMarketDay: false,
  festival: null,
  population: 2,
  villagers: [
    { id: 'hesper', tradeId: 'mayor', role: 'mayor' },
    { id: 'ada', tradeId: 'farmer', role: 'villager' },
  ],
  builtBuildingIds: ['town-hall', 'cottage'],
  stores: {},
  treasuryCoins: 0,
  treasuryDeltaYesterday: 0,
  recentChronicle: [],
};

describe('builtBuildingsNow', () => {
  it('places a built building with a sprite at its plot', () => {
    const placed = builtBuildingsNow(BASE_FACTS);
    const townHall = placed.find((b) => b.buildingId === 'town-hall');
    expect(townHall?.buildingId).toBe('town-hall');
    expect(townHall?.x).toBe(26);
    expect(townHall?.y).toBe(2);
    expect(townHall?.sprite).toBeDefined();
  });

  it('skips a built building with no sprite picked yet', () => {
    const facts: VillageFacts = { ...BASE_FACTS, builtBuildingIds: ['smithy'] };
    expect(builtBuildingsNow(facts)).toEqual([]);
  });
});

describe('whereaboutsNow', () => {
  it('places the mayor at the town hall during a work stint', () => {
    const placed = whereaboutsNow(BASE_FACTS);
    expect(placed).toEqual([
      { villager: { id: 'hesper', tradeId: 'mayor', role: 'mayor' }, x: 26, y: 2 },
    ]);
  });

  it("doesn't place the farmer - the fields aren't built", () => {
    const placed = whereaboutsNow(BASE_FACTS);
    expect(placed.some((p) => p.villager.id === 'ada')).toBe(false);
  });
});

describe('planCanvasDraw', () => {
  it('fits a fallback-sized empty canvas when nothing is built or staffed', () => {
    const facts: VillageFacts = { ...BASE_FACTS, villagers: [], builtBuildingIds: [] };
    const plan = planCanvasDraw(facts);
    expect(plan.buildings).toEqual([]);
    expect(plan.villagers).toEqual([]);
    expect(plan.width).toBeGreaterThan(0);
    expect(plan.height).toBeGreaterThan(0);
  });

  it('places every drawn sprite within the plan bounds, with margin', () => {
    const plan = planCanvasDraw(BASE_FACTS);
    expect(plan.buildings.length).toBeGreaterThan(0);
    expect(plan.villagers.length).toBeGreaterThan(0);
    for (const item of [...plan.buildings, ...plan.villagers]) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThan(plan.width);
      expect(item.y).toBeLessThan(plan.height);
    }
  });
});
