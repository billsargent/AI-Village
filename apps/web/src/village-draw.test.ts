import { MAPS, TILE_PX } from '@ai-village/content';
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
  festivals: [],
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
    const facts: VillageFacts = { ...BASE_FACTS, builtBuildingIds: ['clocktower'] };
    expect(builtBuildingsNow(facts)).toEqual([]);
  });

  it('skips a building on the Riverside or Forest map when asked for the main map', () => {
    const facts: VillageFacts = {
      ...BASE_FACTS,
      builtBuildingIds: ['riverside-jetty', 'smokehouse', 'forest-hut'],
    };
    expect(builtBuildingsNow(facts)).toEqual([]);
  });

  it('places a building on the Riverside map when asked for it', () => {
    const facts: VillageFacts = { ...BASE_FACTS, builtBuildingIds: ['riverside-jetty'] };
    const placed = builtBuildingsNow(facts, 'riverside');
    const jetty = placed.find((b) => b.buildingId === 'riverside-jetty');
    expect(jetty?.x).toBe(2);
    expect(jetty?.y).toBe(8);
  });

  it("doesn't place a Riverside building when asked for the Forest map", () => {
    const facts: VillageFacts = { ...BASE_FACTS, builtBuildingIds: ['riverside-jetty'] };
    expect(builtBuildingsNow(facts, 'forest')).toEqual([]);
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

  it("doesn't place a worker whose workplace is on the Riverside or Forest map when asked for the main map", () => {
    const facts: VillageFacts = {
      ...BASE_FACTS,
      villagers: [{ id: 'finn', tradeId: 'fisher', role: 'villager' }],
      builtBuildingIds: ['riverside-jetty'],
    };
    expect(whereaboutsNow(facts)).toEqual([]);
  });

  it('places a worker on the Riverside map when asked for it', () => {
    const facts: VillageFacts = {
      ...BASE_FACTS,
      villagers: [{ id: 'finn', tradeId: 'fisher', role: 'villager' }],
      builtBuildingIds: ['riverside-jetty'],
    };
    const placed = whereaboutsNow(facts, 'riverside');
    expect(placed.some((p) => p.villager.id === 'finn')).toBe(true);
  });
});

describe('planCanvasDraw', () => {
  it('always lays out the whole map, even with nothing built', () => {
    const facts: VillageFacts = { ...BASE_FACTS, villagers: [], builtBuildingIds: [] };
    const plan = planCanvasDraw(facts);
    expect(plan.buildings).toEqual([]);
    expect(plan.villagers).toEqual([]);
    expect(plan.width).toBe(MAPS.main.widthTiles * TILE_PX);
    expect(plan.height).toBe(MAPS.main.heightTiles * TILE_PX);
    expect(plan.ground.length).toBeGreaterThan(0);
    expect(plan.standing.length).toBeGreaterThan(0);
  });

  it("lays out the Riverside map at its own real dimensions, not the main map's", () => {
    const facts: VillageFacts = { ...BASE_FACTS, villagers: [], builtBuildingIds: [] };
    const plan = planCanvasDraw(facts, 'riverside');
    expect(plan.width).toBe(MAPS.riverside.widthTiles * TILE_PX);
    expect(plan.height).toBe(MAPS.riverside.heightTiles * TILE_PX);
  });

  it('sits a building at the bottom-centre of its plot, facing the road', () => {
    const plan = planCanvasDraw(BASE_FACTS);
    const townHall = plan.buildings.find((b) => b.buildingId === 'town-hall');
    expect(townHall).toBeDefined();
    if (!townHall) return;
    // Town hall: plot (26,2), 9x7 tiles, sprite 5x4 tiles.
    expect(townHall.x).toBe((26 + 2) * TILE_PX);
    expect(townHall.y + townHall.sprite.height).toBe((2 + 7) * TILE_PX);
  });

  it("stands a worker just outside their building's door", () => {
    const plan = planCanvasDraw(BASE_FACTS);
    const mayor = plan.villagers.find((v) => v.villager.id === 'hesper');
    expect(mayor?.x).toBe((26 + 4) * TILE_PX);
    expect(mayor?.y).toBe((2 + 7) * TILE_PX);
  });

  it('depth-sorts standing sprites by their bottom edge', () => {
    const plan = planCanvasDraw(BASE_FACTS);
    const bottoms = plan.standing.map((s) => s.y + s.sprite.height);
    expect(bottoms).toEqual([...bottoms].sort((a, b) => a - b));
  });

  it("clears an empty plot's scrub once something is built on it", () => {
    const empty: VillageFacts = { ...BASE_FACTS, villagers: [], builtBuildingIds: [] };
    const withHall: VillageFacts = { ...empty, builtBuildingIds: ['town-hall'] };
    const onHallPlot = (plan: ReturnType<typeof planCanvasDraw>) =>
      [...plan.groundDecor, ...plan.standing.filter((s) => s.kind === 'decor')].filter(
        (d) => d.x >= 26 * TILE_PX && d.x < 35 * TILE_PX && d.y >= 2 * TILE_PX && d.y < 9 * TILE_PX,
      ).length;
    expect(onHallPlot(planCanvasDraw(empty))).toBeGreaterThan(0);
    expect(onHallPlot(planCanvasDraw(withHall))).toBe(0);
  });

  it('draws a built Riverside building when asked for the Riverside map', () => {
    const facts: VillageFacts = { ...BASE_FACTS, villagers: [], builtBuildingIds: ['smokehouse'] };
    const plan = planCanvasDraw(facts, 'riverside');
    expect(plan.buildings.length).toBe(1);
  });
});
