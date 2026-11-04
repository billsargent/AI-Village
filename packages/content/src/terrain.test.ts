import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getBuilding } from './buildings.js';
import { MAPS, plotsOnMap, type MapId } from './layout.js';
import {
  decorFor,
  DIRT_TILES,
  groundGrid,
  groundTileAt,
  groundTiles,
  plotKey,
  roadsOnMap,
  waterOnMap,
  waterPlotsOnMap,
  WATER_TILES,
  type Ground,
  type Rect,
} from './terrain.js';

const MAP_IDS = Object.keys(MAPS) as MapId[];
const ART_SRC = fileURLToPath(new URL('../../../art/src', import.meta.url));

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function plotRects(map: MapId): { id: string; rect: Rect }[] {
  return plotsOnMap(map).map((plot) => {
    const building = getBuilding(plot.buildingId);
    const [w, h] = building?.footprintTiles ?? [0, 0];
    return { id: plot.buildingId, rect: { x: plot.x, y: plot.y, w, h } };
  });
}

describe('terrain layout', () => {
  it.each(MAP_IDS)('keeps every road and water body on the %s map', (map) => {
    const { widthTiles, heightTiles } = MAPS[map];
    for (const rect of [...roadsOnMap(map), ...waterOnMap(map)]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(widthTiles);
      expect(rect.y + rect.h).toBeLessThanOrEqual(heightTiles);
    }
  });

  it.each(MAP_IDS)('makes every road on the %s map at least 2 tiles wide', (map) => {
    for (const rect of roadsOnMap(map)) {
      expect(Math.min(rect.w, rect.h)).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(MAP_IDS)('never runs a road through a plot on the %s map', (map) => {
    for (const road of roadsOnMap(map)) {
      for (const { id, rect } of plotRects(map)) {
        expect(overlaps(road, rect), `${id} vs road ${JSON.stringify(road)}`).toBe(false);
      }
    }
  });

  it.each(MAP_IDS)('keeps water off every plot on the %s map, except a jetty', (map) => {
    for (const water of waterOnMap(map)) {
      for (const { id, rect } of plotRects(map)) {
        if (waterPlotsOnMap(map).includes(id)) {
          continue;
        }
        expect(overlaps(water, rect), `${id} vs water`).toBe(false);
      }
    }
  });

  it('lets the riverside jetty actually reach the water', () => {
    const jetty = plotRects('riverside').find((p) => p.id === 'riverside-jetty');
    expect(jetty).toBeDefined();
    expect(waterOnMap('riverside').some((w) => jetty && overlaps(w, jetty.rect))).toBe(true);
  });
});

describe('groundTileAt', () => {
  const grid = (rows: string[]): Ground[][] =>
    rows.map((row) =>
      Array.from(row, (c): Ground => (c === 'd' ? 'dirt' : c === 'w' ? 'water' : 'grass')),
    );

  it('returns nothing for grass', () => {
    expect(groundTileAt(grid(['g']), 0, 0)).toBeUndefined();
  });

  it('picks edges and outer corners for a block of dirt', () => {
    const g = grid(['ggggg', 'gdddg', 'gdddg', 'gdddg', 'ggggg']);
    expect(groundTileAt(g, 1, 1)).toBe(DIRT_TILES.nw);
    expect(groundTileAt(g, 2, 1)).toBe(DIRT_TILES.n);
    expect(groundTileAt(g, 3, 1)).toBe(DIRT_TILES.ne);
    expect(groundTileAt(g, 1, 2)).toBe(DIRT_TILES.w);
    expect(groundTileAt(g, 2, 2)).toBe(DIRT_TILES.center);
    expect(groundTileAt(g, 3, 2)).toBe(DIRT_TILES.e);
    expect(groundTileAt(g, 1, 3)).toBe(DIRT_TILES.sw);
    expect(groundTileAt(g, 2, 3)).toBe(DIRT_TILES.s);
    expect(groundTileAt(g, 3, 3)).toBe(DIRT_TILES.se);
  });

  it('picks an inner corner where two paths meet', () => {
    // An L of dirt: the cell at (1,1) has dirt all round except to its south-east.
    const g = grid(['ddd', 'ddd', 'ddg']);
    expect(groundTileAt(g, 1, 1)).toBe(DIRT_TILES.innerSe);
  });

  it('runs water off the edge of the map without a bank', () => {
    const g = grid(['ww', 'ww']);
    expect(groundTileAt(g, 0, 0)).toBe(WATER_TILES.center);
  });
});

describe('groundTiles and decor', () => {
  it.each(MAP_IDS)('draws a tile for every road and water cell on the %s map', (map) => {
    const nonGrass = groundGrid(map)
      .flat()
      .filter((cell) => cell !== 'grass').length;
    expect(groundTiles(map).length).toBeGreaterThanOrEqual(nonGrass);
  });

  it.each(MAP_IDS)('is the same on every call for the %s map', (map) => {
    expect(decorFor(map)).toEqual(decorFor(map));
  });

  it.each(MAP_IDS)('never puts decor on a road or in water on the %s map', (map) => {
    const grid = groundGrid(map);
    const { widthTiles, heightTiles } = MAPS[map];
    for (const item of decorFor(map)) {
      for (let y = item.y; y < item.y + item.sprite.height / 16; y++) {
        for (let x = item.x; x < item.x + item.sprite.width / 16; x++) {
          // A tree on the rim may hang off the map's edge - that part is the woods beyond.
          if (x < 0 || y < 0 || x >= widthTiles || y >= heightTiles) {
            continue;
          }
          expect(grid[y]?.[x], `${map} decor at ${x},${y}`).toBe('grass');
        }
      }
    }
  });

  it.each(MAP_IDS)('only lets scrub on a plot that knows which plot it is on the %s map', (map) => {
    for (const item of decorFor(map)) {
      const rect = { x: item.x, y: item.y, w: item.sprite.width / 16, h: item.sprite.height / 16 };
      for (const plot of plotsOnMap(map)) {
        const [w, h] = getBuilding(plot.buildingId)?.footprintTiles ?? [0, 0];
        if (!overlaps(rect, { x: plot.x, y: plot.y, w, h })) {
          continue;
        }
        // Never a tree (those stay off plots), and always tagged with this plot.
        expect(item.sprite.height, `${map} tree on ${plot.buildingId}`).toBe(16);
        expect(item.plot).toBe(plotKey(plot.buildingId, plot.slot));
      }
    }
  });

  it('frames the main map with a tree line along its edges', () => {
    const rimTrees = decorFor('main').filter((d) => d.sprite.height >= 32 && d.y < 0);
    expect(rimTrees.length).toBeGreaterThan(10);
  });

  it('grows a real amount of greenery on the main map and a dense wood in the forest', () => {
    const trees = (map: MapId) => decorFor(map).filter((d) => d.sprite.height >= 32).length;
    expect(trees('main')).toBeGreaterThan(40);
    expect(trees('forest')).toBeGreaterThan(trees('main') / 2);
  });

  it('crops every terrain sprite within the real, committed outdoor sheet', () => {
    const buffer = readFileSync(`${ART_SRC}/tiles/serene-village-outside.png`);
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    for (const map of MAP_IDS) {
      for (const { sprite } of [...groundTiles(map), ...decorFor(map)]) {
        expect(sprite.x + sprite.width).toBeLessThanOrEqual(width);
        expect(sprite.y + sprite.height).toBeLessThanOrEqual(height);
      }
    }
  });
});
