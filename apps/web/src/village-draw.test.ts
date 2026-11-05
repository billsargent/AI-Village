import { MAPS, TILE_PX } from '@ai-village/content';
import { describe, expect, it } from 'vitest';
import {
  builtBuildingsNow,
  planCanvasDraw,
  villagersInside,
  villagersOnMap,
  whereaboutsNow,
} from './village-draw.js';
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
  boardPosts: [],
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
  it('says where everyone is: the mayor in the town hall, the farmer on the green (no fields yet)', () => {
    expect(whereaboutsNow(BASE_FACTS).map((w) => [w.villager.id, w.where])).toEqual([
      ['hesper', 'in the town hall'],
      ['ada', 'on the green'],
    ]);
  });

  it('has everyone at home at night', () => {
    const night: VillageFacts = { ...BASE_FACTS, phase: 'night' };
    expect(whereaboutsNow(night).map((w) => w.where)).toEqual(['at home', 'at home']);
  });
});

describe('villagersInside', () => {
  it('finds who is in a building: the mayor at work in the town hall, nobody at home by day', () => {
    expect(villagersInside(BASE_FACTS, 'town-hall').map((o) => o.villager.id)).toEqual(['hesper']);
    expect(villagersInside(BASE_FACTS, 'cottage')).toEqual([]);
  });

  it('has everyone home in the cottage at night - in that copy of it, not another', () => {
    const night: VillageFacts = { ...BASE_FACTS, phase: 'night' };
    expect(villagersInside(night, 'cottage').map((o) => o.villager.id)).toEqual(['hesper', 'ada']);
    expect(villagersInside(night, 'cottage', 0)).toHaveLength(2);
    expect(villagersInside(night, 'cottage', 1)).toEqual([]);
  });
});

describe('villagersOnMap', () => {
  it('draws everyone, even out of sight: the mayor hidden at the town hall door, the farmer on the green', () => {
    const [hesper, ada] = villagersOnMap(BASE_FACTS);
    // Town hall: plot (26,2), 9x7 tiles - the door is mid-plot, on the doorstep row.
    expect(hesper).toMatchObject({ x: 26 + 4, y: 2 + 7, hidden: true });
    expect(ada?.hidden).toBe(false);
  });

  it('shows a fisher at the jetty on the Riverside map, and gone by the signpost on the main map', () => {
    const facts: VillageFacts = {
      ...BASE_FACTS,
      villagers: [{ id: 'finn', tradeId: 'fisher', role: 'villager' }],
      builtBuildingIds: ['riverside-jetty'],
    };
    expect(villagersOnMap(facts, 'riverside')[0]?.hidden).toBe(false);
    expect(villagersOnMap(facts, 'main')[0]).toMatchObject({ x: 67, y: 25, hidden: true });
  });
});

describe('planCanvasDraw', () => {
  it('always lays out the whole map, even with nothing built', () => {
    const facts: VillageFacts = { ...BASE_FACTS, villagers: [], builtBuildingIds: [] };
    const plan = planCanvasDraw(facts);
    expect(plan.buildings).toEqual([]);
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
