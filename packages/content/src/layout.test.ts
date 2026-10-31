import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './buildings.js';
import { getPlot, MAPS, plotsOnMap, positionForWorker, TILE_PX } from './layout.js';
import { TRADES } from './trades.js';

describe('layout', () => {
  it('has a plot for every building id', () => {
    for (const building of BUILDINGS) {
      expect(getPlot(building.id), `building "${building.id}" has no plot`).toBeDefined();
    }
  });

  it('gives every multi-instance building more than one slot, and every other building exactly one', () => {
    for (const building of BUILDINGS) {
      const count = [
        ...plotsOnMap('main'),
        ...plotsOnMap('riverside'),
        ...plotsOnMap('forest'),
      ].filter((plot) => plot.buildingId === building.id).length;
      if (building.multiInstance) {
        expect(count, building.id).toBeGreaterThan(1);
      } else {
        expect(count, building.id).toBe(1);
      }
    }
  });

  it('places every plot within its map bounds', () => {
    for (const mapId of Object.keys(MAPS) as (keyof typeof MAPS)[]) {
      const map = MAPS[mapId];
      for (const plot of plotsOnMap(mapId)) {
        const building = BUILDINGS.find((candidate) => candidate.id === plot.buildingId);
        if (!building) {
          throw new Error(`unreachable: plot references unknown building "${plot.buildingId}"`);
        }
        const [width, height] = building.footprintTiles;
        expect(plot.x).toBeGreaterThanOrEqual(0);
        expect(plot.y).toBeGreaterThanOrEqual(0);
        expect(plot.x + width).toBeLessThanOrEqual(map.widthTiles);
        expect(plot.y + height).toBeLessThanOrEqual(map.heightTiles);
      }
    }
  });

  it('TILE_PX matches spec section 8 (16px tiles)', () => {
    expect(TILE_PX).toBe(16);
  });

  describe('positionForWorker', () => {
    const bakerTrade = TRADES.find((trade) => trade.worksAt === 'bakery');
    if (!bakerTrade) {
      throw new Error('unreachable: no trade works at the bakery in this content table');
    }

    it('places a worker at their built workplace during a work stint', () => {
      const plot = positionForWorker(bakerTrade.id, ['bakery'], 'work-first-stint');
      expect(plot).toEqual(getPlot('bakery'));
    });

    it('is undefined when the workplace has not been built yet', () => {
      expect(positionForWorker(bakerTrade.id, [], 'work-first-stint')).toBeUndefined();
    });

    it('is undefined outside work-stint hours', () => {
      expect(positionForWorker(bakerTrade.id, ['bakery'], 'evening')).toBeUndefined();
    });

    it('is undefined for an unknown trade', () => {
      expect(positionForWorker('not-a-trade', ['bakery'], 'work-first-stint')).toBeUndefined();
    });

    it('is undefined for a slot beyond how many are built', () => {
      const farmerTrade = TRADES.find((trade) => trade.worksAt === 'fields');
      if (!farmerTrade) {
        throw new Error('unreachable: no trade works the fields in this content table');
      }
      expect(positionForWorker(farmerTrade.id, ['fields'], 'work-second-stint', 1)).toBeUndefined();
      expect(
        positionForWorker(farmerTrade.id, ['fields', 'fields'], 'work-second-stint', 1),
      ).toEqual(getPlot('fields', 1));
    });
  });
});
