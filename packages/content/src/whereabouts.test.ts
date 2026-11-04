import { describe, expect, it } from 'vitest';
import { getPlot } from './layout.js';
import { findPath, walkGrid } from './paths.js';
import { doorOf, spotSeenFrom, spotsFor, type Resident } from './whereabouts.js';

const HESPER: Resident = { id: 'hesper', tradeId: 'mayor' };
const ADA: Resident = { id: 'ada', tradeId: 'farmer' };
const FINN: Resident = { id: 'finn', tradeId: 'fisher' };

function door(buildingId: Parameters<typeof getPlot>[0], slot = 0) {
  const plot = getPlot(buildingId, slot);
  if (!plot) {
    throw new Error(`no plot for ${buildingId}`);
  }
  return doorOf(plot);
}

describe('spotsFor', () => {
  it('puts everyone indoors at home at night, at the door of their cottage', () => {
    const [hesper, ada] = spotsFor([HESPER, ADA], ['town-hall', 'cottage', 'cottage'], 'night');
    expect(hesper).toMatchObject({
      ...door('cottage', 0),
      inside: { buildingId: 'cottage', slot: 0 },
    });
    expect(ada).toMatchObject({
      ...door('cottage', 1),
      inside: { buildingId: 'cottage', slot: 1 },
    });
    expect(hesper?.where).toBe('at home');
  });

  it('sends a villager with no home to the green at night, rather than nowhere', () => {
    const [ada] = spotsFor([ADA], ['town-hall'], 'night');
    expect(ada?.inside).toBeUndefined();
    expect(ada?.where).toBe('on the green');
  });

  it('takes a worker inside their workplace during a stint', () => {
    const [hesper] = spotsFor([HESPER], ['town-hall', 'cottage'], 'work-first-stint');
    expect(hesper).toMatchObject({ ...door('town-hall'), inside: { buildingId: 'town-hall' } });
    expect(hesper?.where).toBe('in the town hall');
  });

  it('keeps a farmer out in the fields, in sight, rather than inside them', () => {
    const [ada] = spotsFor([ADA], ['fields'], 'work-second-stint');
    const fields = getPlot('fields', 0);
    expect(ada?.inside).toBeUndefined();
    expect(ada?.where).toBe('at the fields');
    expect(ada?.x).toBeGreaterThanOrEqual(fields?.x ?? 0);
    expect(ada?.y).toBeGreaterThan(fields?.y ?? 0);
  });

  it("waits on the green when their workplace isn't built", () => {
    const [ada] = spotsFor([ADA], ['town-hall', 'cottage'], 'work-first-stint');
    expect(ada?.where).toBe('on the green');
  });

  it('goes to the inn for lunch if there is one, and the green if not', () => {
    expect(spotsFor([ADA], ['inn'], 'lunch')[0]?.inside?.buildingId).toBe('inn');
    expect(spotsFor([ADA], [], 'lunch')[0]?.where).toBe('on the green');
  });

  it('spreads people out over the green so they do not stand on each other', () => {
    const spots = spotsFor([HESPER, ADA, FINN], [], 'evening');
    const tiles = new Set(spots.map((spot) => `${spot.x},${spot.y}`));
    expect(tiles.size).toBe(3);
  });

  it('puts a fisher on the Riverside map, and seen from the main map they have gone by the signpost', () => {
    const [finn] = spotsFor([FINN], ['riverside-jetty'], 'work-first-stint');
    expect(finn?.map).toBe('riverside');
    if (!finn) {
      throw new Error('no spot');
    }
    expect(spotSeenFrom(finn, 'riverside')).toBe(finn);
    const fromMain = spotSeenFrom(finn, 'main');
    expect(fromMain).toMatchObject({ map: 'main', x: 67, y: 25 });
    expect(fromMain?.inside).toBeDefined();
  });
});

describe('findPath', () => {
  it("walks from a cottage door to the town hall's door without crossing a building or the water", () => {
    const built = ['town-hall', 'cottage', 'inn', 'bakery'];
    const grid = walkGrid('main', built);
    const from = door('cottage');
    const to = door('town-hall');
    const path = findPath(grid, from, to);
    expect(path).not.toBeNull();
    expect(path?.[0]).toEqual(from);
    expect(path?.at(-1)).toEqual(to);
    for (const [i, tile] of (path ?? []).entries()) {
      if (i > 0 && i < (path?.length ?? 0) - 1) {
        expect(grid[tile.y]?.[tile.x]).toBeGreaterThan(0);
      }
      const prev = path?.[i - 1];
      if (prev) {
        expect(Math.abs(prev.x - tile.x) + Math.abs(prev.y - tile.y)).toBe(1);
      }
    }
  });

  it('keeps to the roads where it can', () => {
    const grid = walkGrid('main', ['town-hall', 'cottage']);
    const path = findPath(grid, door('cottage'), door('town-hall')) ?? [];
    const onRoad = path.filter((tile) => grid[tile.y]?.[tile.x] === 1).length;
    expect(onRoad / path.length).toBeGreaterThan(0.7);
  });

  it('crosses the river only by the footbridge, to reach the riverside signpost', () => {
    const grid = walkGrid('main', []);
    const path = findPath(grid, { x: 34, y: 25 }, { x: 67, y: 25 });
    expect(path).not.toBeNull();
    expect(grid[0]?.[70]).toBe(0);
  });

  it("is null when there's no way through", () => {
    const grid = [
      [1, 0, 1],
      [1, 0, 1],
    ];
    expect(findPath(grid, { x: 0, y: 0 }, { x: 2, y: 1 })).toBeNull();
  });
});
