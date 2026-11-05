import { getBuilding } from './buildings.js';
import { MAPS, plotsOnMap, type MapId } from './layout.js';
import type { SpriteFrame } from './sprites.js';

/**
 * Each map's ground (roads and water) and decor (trees, bushes, rocks,
 * flowers), drawn from tiles on the already-vendored Serene Village
 * Revamped outdoor sheet. Roads follow spec section 8's own names; the
 * river curves round the east and south of the main map as the spec
 * describes. There's still no Tiled map (spec section 8's map data is
 * later work) - this is the committed, deterministic stand-in a renderer
 * reads from, so the village looks the same on every load.
 */

const OUTSIDE_TILES = 'tiles/serene-village-outside.png';
const TILE = 16;

function tile(x: number, y: number, width = 1, height = 1): SpriteFrame {
  return {
    file: OUTSIDE_TILES,
    x: x * TILE,
    y: y * TILE,
    width: width * TILE,
    height: height * TILE,
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Ground = 'grass' | 'dirt' | 'water';

/**
 * The dirt-path blob tiles (sheet columns 3-10, rows 1-3): edges, outer
 * corners, inner corners where two paths meet, and plain dirt. Every
 * road below is at least 2 tiles wide, so no tile ever needs both
 * opposite edges at once - this set covers every case that comes up.
 */
export const DIRT_TILES = {
  center: tile(10, 2),
  n: tile(7, 3),
  s: tile(7, 1),
  e: tile(6, 2),
  w: tile(9, 2),
  nw: tile(5, 2),
  ne: tile(3, 2),
  sw: tile(5, 1),
  se: tile(3, 1),
  innerNw: tile(9, 3),
  innerNe: tile(6, 3),
  innerSw: tile(9, 1),
  innerSe: tile(6, 1),
} as const;

/** The 3x3 pond tiles (sheet columns 11-13, rows 0-2): water with grassy banks. */
export const WATER_TILES = {
  center: tile(12, 1),
  n: tile(12, 0),
  s: tile(12, 2),
  e: tile(13, 1),
  w: tile(11, 1),
  nw: tile(11, 0),
  ne: tile(13, 0),
  sw: tile(11, 2),
  se: tile(13, 2),
} as const;

/** A 3x3 plank bridge, walked east-west, drawn over water. */
export const BRIDGE = tile(12, 3, 3, 3);

/** Bright summer greens, matching the grass; the cooler teal pair suits the deep forest. */
const GREEN_TREES = [tile(9, 12, 2, 3), tile(11, 12, 2, 3)];
const TEAL_TREES = [tile(13, 12, 2, 3), tile(15, 12, 2, 3)];
const SMALL_TREE = tile(17, 13, 2, 2);
const BUSH = tile(7, 12);
const ROCKS = [tile(0, 15), tile(1, 15), tile(2, 15)];
const FLOWERS = [tile(2, 12), tile(3, 12), tile(4, 12), tile(5, 12), tile(6, 12)];
const DAISIES = [tile(2, 13), tile(2, 14)];
/** Trees and bushes: what turns amber in autumn and frosts over in winter. */
const FOLIAGE: ReadonlySet<SpriteFrame> = new Set([
  ...GREEN_TREES,
  ...TEAL_TREES,
  SMALL_TREE,
  BUSH,
]);

/** Whether a decor sprite is a tree or bush, for the season's colours. */
export function isFoliage(sprite: SpriteFrame): boolean {
  return FOLIAGE.has(sprite);
}

/** Flowers and daisies: what winter puts away. */
const BLOOMS: ReadonlySet<SpriteFrame> = new Set([...FLOWERS, ...DAISIES]);

/** Whether a decor sprite is a flower or daisy. */
export function isBloom(sprite: SpriteFrame): boolean {
  return BLOOMS.has(sprite);
}

const SIGNPOST = tile(8, 13);
const SIGNPOST_RIGHT = tile(8, 14);

interface MapTerrainSpec {
  roads: readonly Rect[];
  water: readonly Rect[];
  bridges: readonly { x: number; y: number }[];
  signposts: readonly { x: number; y: number; sprite: SpriteFrame }[];
  /** 0-1: how thickly trees grow on open grass. */
  treeDensity: number;
  /** Plots allowed to sit partly in water (a dock has to reach it). */
  waterPlots: readonly string[];
}

const TERRAIN: Record<MapId, MapTerrainSpec> = {
  main: {
    roads: [
      // Civic Row's road, in front of the town hall, post office and school.
      { x: 22, y: 9, w: 35, h: 2 },
      // North Lane, between the post office and the school, to the forest.
      { x: 44, y: 0, w: 2, h: 9 },
      // Trade Street, along the fronts of the inn, bakery, shop, smithy and workshop.
      { x: 55, y: 9, w: 2, h: 32 },
      // The lane past the chapel, down to the green.
      { x: 33, y: 11, w: 2, h: 12 },
      // The ring path round the green.
      { x: 24, y: 23, w: 20, h: 2 },
      { x: 24, y: 33, w: 20, h: 2 },
      { x: 24, y: 23, w: 2, h: 12 },
      { x: 42, y: 23, w: 2, h: 12 },
      // The High Road, east from the green across Trade Street to the river.
      { x: 44, y: 25, w: 25, h: 2 },
      // The Mill Track, west to the farmland.
      { x: 0, y: 26, w: 24, h: 2 },
      // The farm lane between the fields.
      { x: 10, y: 0, w: 2, h: 26 },
      // The South Lane, down from the green to the cottages.
      { x: 33, y: 35, w: 2, h: 4 },
      // The cottage road, in front of every cottage, joining Trade Street.
      { x: 0, y: 39, w: 57, h: 2 },
    ],
    water: [
      { x: 69, y: 0, w: 3, h: 52 },
      { x: 0, y: 49, w: 69, h: 3 },
    ],
    bridges: [{ x: 69, y: 25 }],
    signposts: [
      { x: 46, y: 0, sprite: SIGNPOST },
      { x: 67, y: 23, sprite: SIGNPOST_RIGHT },
    ],
    treeDensity: 0.3,
    waterPlots: [],
  },
  riverside: {
    roads: [{ x: 0, y: 6, w: 40, h: 2 }],
    water: [{ x: 0, y: 11, w: 40, h: 13 }],
    bridges: [],
    signposts: [{ x: 1, y: 4, sprite: SIGNPOST }],
    treeDensity: 0.1,
    waterPlots: ['riverside-jetty'],
  },
  forest: {
    roads: [{ x: 5, y: 9, w: 2, h: 23 }],
    water: [],
    bridges: [],
    signposts: [{ x: 8, y: 29, sprite: SIGNPOST }],
    treeDensity: 0.55,
    waterPlots: [],
  },
};

function inRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

export function roadsOnMap(map: MapId): readonly Rect[] {
  return TERRAIN[map].roads;
}

export function waterOnMap(map: MapId): readonly Rect[] {
  return TERRAIN[map].water;
}

/** The 3x3 footbridges over the water on `map` (top-left tiles). */
export function bridgesOnMap(map: MapId): readonly { x: number; y: number }[] {
  return TERRAIN[map].bridges;
}

/** Plots on `map` allowed to overlap water, like a jetty reaching into the river. */
export function waterPlotsOnMap(map: MapId): readonly string[] {
  return TERRAIN[map].waterPlots;
}

/** Each tile of `map`, row by row: `grid[y][x]`. Water wins over a road where they'd meet. */
export function groundGrid(map: MapId): readonly (readonly Ground[])[] {
  const { widthTiles, heightTiles } = MAPS[map];
  const spec = TERRAIN[map];
  const grid: Ground[][] = [];
  for (let y = 0; y < heightTiles; y++) {
    const row: Ground[] = [];
    for (let x = 0; x < widthTiles; x++) {
      if (spec.water.some((rect) => inRect(rect, x, y))) {
        row.push('water');
      } else if (spec.roads.some((rect) => inRect(rect, x, y))) {
        row.push('dirt');
      } else {
        row.push('grass');
      }
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Picks the blob tile for one dirt or water cell from its neighbours.
 * Off-map neighbours count as the same ground, so a road or river runs
 * cleanly off the edge of the map instead of ending in a bank there.
 * Returns `undefined` for grass, which the renderer draws as one tiling
 * base layer underneath everything.
 */
export function groundTileAt(
  grid: readonly (readonly Ground[])[],
  x: number,
  y: number,
): SpriteFrame | undefined {
  const here = grid[y]?.[x];
  if (here === undefined || here === 'grass') {
    return undefined;
  }
  const same = (dx: number, dy: number): boolean => {
    const row = grid[y + dy];
    if (row === undefined) {
      return true;
    }
    const cell = row[x + dx];
    return cell === undefined || cell === here;
  };
  const n = same(0, -1);
  const s = same(0, 1);
  const e = same(1, 0);
  const w = same(-1, 0);
  const tiles = here === 'dirt' ? DIRT_TILES : WATER_TILES;

  if (!n && !w) return tiles.nw;
  if (!n && !e) return tiles.ne;
  if (!s && !w) return tiles.sw;
  if (!s && !e) return tiles.se;
  if (!n) return tiles.n;
  if (!s) return tiles.s;
  if (!w) return tiles.w;
  if (!e) return tiles.e;

  if (here === 'dirt') {
    if (!same(-1, -1)) return DIRT_TILES.innerNw;
    if (!same(1, -1)) return DIRT_TILES.innerNe;
    if (!same(-1, 1)) return DIRT_TILES.innerSw;
    if (!same(1, 1)) return DIRT_TILES.innerSe;
  }
  return tiles.center;
}

export interface PlacedTile {
  sprite: SpriteFrame;
  /** Tile coordinates of the sprite's top-left corner. */
  x: number;
  y: number;
}

/** Every non-grass ground tile on `map`, plus its bridges drawn over the water. */
export function groundTiles(map: MapId): readonly PlacedTile[] {
  const grid = groundGrid(map);
  const placed: PlacedTile[] = [];
  grid.forEach((row, y) => {
    row.forEach((_, x) => {
      const sprite = groundTileAt(grid, x, y);
      if (sprite) {
        placed.push({ sprite, x, y });
      }
    });
  });
  for (const bridge of TERRAIN[map].bridges) {
    placed.push({ sprite: BRIDGE, x: bridge.x, y: bridge.y });
  }
  return placed;
}

export interface DecorItem extends PlacedTile {
  /**
   * `ground` items (daisies, flowers) lie flat on the grass under
   * everything; `object` items (trees, bushes, rocks, signposts) stand
   * up and depth-sort with buildings and villagers by their bottom edge.
   */
  layer: 'ground' | 'object';
  /**
   * Set for scrub growing on an empty plot (`buildingId:slot`) - the
   * renderer clears it once that plot is built, the way new land in a
   * farming game starts out overgrown.
   */
  plot?: string;
}

/** The key `DecorItem.plot` uses for one plot. */
export function plotKey(buildingId: string, slot: number): string {
  return `${buildingId}:${slot}`;
}

/** A stable 0-1 hash of a tile position, so the scatter is the same on every load. */
function noise(map: MapId, x: number, y: number, salt: number): number {
  let h = 2166136261 ^ salt;
  const key = `${map}:${x}:${y}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth 0-1 value noise over a lattice `cell` tiles apart, so trees and
 * flowers grow in natural-looking groves and patches with clearings
 * between them, rather than as an even sprinkle.
 */
function clusterNoise(map: MapId, x: number, y: number, cell: number, salt: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sx = smooth(x / cell - gx);
  const sy = smooth(y / cell - gy);
  const v00 = noise(map, gx, gy, salt);
  const v10 = noise(map, gx + 1, gy, salt);
  const v01 = noise(map, gx, gy + 1, salt);
  const v11 = noise(map, gx + 1, gy + 1, salt);
  const top = v00 + (v10 - v00) * sx;
  const bottom = v01 + (v11 - v01) * sx;
  return top + (bottom - top) * sy;
}

function pick<T>(items: readonly T[], roll: number): T {
  const item = items[Math.floor(roll * items.length) % items.length];
  if (item === undefined) {
    throw new Error('pick: items must not be empty');
  }
  return item;
}

type Grid<T> = T[][];

function makeGrid<T>(map: MapId, fill: T): Grid<T> {
  const { widthTiles, heightTiles } = MAPS[map];
  return Array.from({ length: heightTiles }, () => Array.from({ length: widthTiles }, () => fill));
}

function mark<T>(grid: Grid<T>, rect: Rect, margin: number, value: T): void {
  for (let y = rect.y - margin; y < rect.y + rect.h + margin; y++) {
    const row = grid[y];
    if (!row) {
      continue;
    }
    for (let x = rect.x - margin; x < rect.x + rect.w + margin; x++) {
      if (x >= 0 && x < row.length) {
        row[x] = value;
      }
    }
  }
}

/**
 * Where things may grow on `map`:
 * - `small`: blocked for anything - roads, water, bridges and signposts
 *   (with a 1-tile margin), and the doorstep row below each plot, where
 *   its keeper stands.
 * - `trees`: all of that, plus every plot and a margin round it, so a
 *   plot is always a clearing a building can go on.
 * - `plotAt`: which plot (if any) covers each tile.
 */
function growthGrids(map: MapId) {
  const small = makeGrid(map, false);
  const trees = makeGrid(map, false);
  const plotAt = makeGrid<string | undefined>(map, undefined);
  const spec = TERRAIN[map];
  const hard: Rect[] = [
    ...spec.roads,
    ...spec.water,
    ...spec.bridges.map((b) => ({ x: b.x, y: b.y, w: 3, h: 3 })),
    ...spec.signposts.map((s) => ({ x: s.x, y: s.y, w: 1, h: 1 })),
  ];
  for (const rect of hard) {
    mark(small, rect, 1, true);
    mark(trees, rect, 1, true);
  }
  for (const plot of plotsOnMap(map)) {
    const building = getBuilding(plot.buildingId);
    if (!building) {
      continue;
    }
    const [w, h] = building.footprintTiles;
    const footprint = { x: plot.x, y: plot.y, w, h };
    mark(plotAt, footprint, 0, plotKey(plot.buildingId, plot.slot));
    mark(trees, { ...footprint, h: h + 1 }, 1, true);
    mark(small, { x: plot.x, y: plot.y + h, w, h: 1 }, 0, true);
  }
  return { small, trees, plotAt };
}

/**
 * Trees, bushes, rocks and flowers on `map`, scattered deterministically:
 * a dense tree line round the map's edges (half off the map, so the
 * village reads as a clearing in the woods), groves and meadows in
 * between, and scrub on every empty plot. Trees never grow on a plot,
 * and nothing grows on a road, in water, on a signpost or on a doorstep.
 */
export function decorFor(map: MapId): readonly DecorItem[] {
  const { widthTiles, heightTiles } = MAPS[map];
  const spec = TERRAIN[map];
  const grids = growthGrids(map);
  const taken = makeGrid(map, false);
  const inMap = (x: number, y: number) => x >= 0 && x < widthTiles && y >= 0 && y < heightTiles;

  // Only the on-map part of a rect matters; anything hanging off the map's
  // edge is just the forest beyond it.
  const clear = (grid: Grid<boolean>, rect: Rect): boolean => {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (inMap(x, y) && (grid[y]?.[x] || taken[y]?.[x])) {
          return false;
        }
      }
    }
    return true;
  };
  const take = (rect: Rect) => {
    mark(taken, rect, 0, true);
  };

  const items: DecorItem[] = [];
  for (const sign of spec.signposts) {
    items.push({ sprite: sign.sprite, x: sign.x, y: sign.y, layer: 'object' });
  }

  const trees = map === 'forest' ? [...GREEN_TREES, ...TEAL_TREES] : GREEN_TREES;

  // Trees first, including candidates hanging off the top and left edges.
  for (let y = -2; y < heightTiles - 1; y++) {
    for (let x = -1; x < widthTiles - 1; x++) {
      const canopy = { x, y, w: 2, h: 3 };
      const trunk = { x, y: y + 2, w: 2, h: 1 };
      // Every tree needs some of its canopy on the map, and its trunk row too.
      if (!inMap(x + 1, y + 2) && !inMap(x, y + 2)) {
        continue;
      }
      const rim = x <= 0 || y <= -1 || x >= widthTiles - 3 || y >= heightTiles - 4;
      const edge = Math.max(
        Math.abs((x + 1) / widthTiles - 0.5) * 2,
        Math.abs((y + 2) / heightTiles - 0.5) * 2,
      );
      const grove = Math.max(0, clusterNoise(map, x, y, 7, 11) - 0.42) / 0.58;
      const chance = rim
        ? 0.9
        : map === 'main'
          ? spec.treeDensity * (grove * 2.4 + edge * edge)
          : spec.treeDensity * (0.4 + grove * 1.2);
      if (noise(map, x, y, 1) >= chance || !clear(grids.trees, canopy) || !clear(taken, trunk)) {
        continue;
      }
      const small = noise(map, x, y, 2) < 0.12;
      items.push({
        sprite: small ? SMALL_TREE : pick(trees, noise(map, x, y, 3)),
        x,
        y: small ? y + 1 : y,
        layer: 'object',
      });
      // Claim the trunk and the tiles round it, so the next tree's trunk
      // sits below or beside this one's - canopies may still overlap. In
      // the forest they pack trunk to trunk, into a thicket.
      take(map === 'forest' ? { x, y: y + 1, w: 2, h: 2 } : { x: x - 1, y: y + 1, w: 4, h: 3 });
    }
  }

  // Then bushes, rocks and flowers on whatever's left, including empty plots.
  for (let y = 0; y < heightTiles; y++) {
    for (let x = 0; x < widthTiles; x++) {
      const cell = { x, y, w: 1, h: 1 };
      if (!clear(grids.small, cell)) {
        continue;
      }
      const plot = grids.plotAt[y]?.[x];
      const grove = Math.max(0, clusterNoise(map, x, y, 7, 11) - 0.42) / 0.58;
      const meadow = clusterNoise(map, x, y, 5, 21);
      const roll = noise(map, x, y, 4);
      // Empty plots are stonier and weedier than the lawns round them;
      // bushes gather at the edges of groves.
      const scrub = plot ? 0.035 : 0;

      let item: DecorItem | undefined;
      if (roll < 0.006 + grove * 0.06) {
        item = { sprite: BUSH, x, y, layer: 'object' };
      } else if (roll < 0.012 + grove * 0.06 + scrub) {
        item = { sprite: pick(ROCKS, noise(map, x, y, 5)), x, y, layer: 'object' };
      } else if (meadow > (plot ? 0.5 : 0.62) && roll < 0.5) {
        // One colour per patch, so a meadow reads as a drift of one flower.
        const colour = pick(FLOWERS, clusterNoise(map, x, y, 5, 31));
        item = { sprite: roll < 0.28 ? colour : pick(DAISIES, roll), x, y, layer: 'ground' };
      } else if (roll < 0.07 + scrub) {
        item = { sprite: pick(DAISIES, noise(map, x, y, 7)), x, y, layer: 'ground' };
      }
      if (item) {
        items.push(plot ? { ...item, plot } : item);
        take(cell);
      }
    }
  }
  return items;
}
