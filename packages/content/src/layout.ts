import { getBuilding, type BuildingId } from './buildings.js';
import { getTrade } from './trades.js';

/**
 * Mirrors `@ai-village/sim`'s `DayPhase` (spec section 5's day shape) -
 * content may not depend on sim (the `content-has-no-deps` dependency
 * boundary), so the phase names are restated here rather than shared.
 */
export type DayPhase =
  'dawn' | 'work-first-stint' | 'lunch' | 'work-second-stint' | 'evening' | 'night';

/** Spec section 8: 16px tiles, a 72x52 main map, two smaller signposted areas. */
export const TILE_PX = 16;

export const MAPS = {
  main: { widthTiles: 72, heightTiles: 52 },
  riverside: { widthTiles: 40, heightTiles: 24 },
  forest: { widthTiles: 48, heightTiles: 32 },
} as const;

export type MapId = keyof typeof MAPS;

export interface Plot {
  buildingId: BuildingId;
  /** Which of a multi-instance building's plots this is, 0-indexed in build order. */
  slot: number;
  map: MapId;
  x: number;
  y: number;
}

/**
 * A fixed layout for every building in the table (spec section 8's
 * districts), one entry per building id, or several for a multi-instance
 * one. Positions are tile coordinates, top-left of the building's
 * footprint. There's no real Tiled map yet, so this is the committed
 * placeholder layout a future map/renderer reads real coordinates from,
 * rather than inventing them per render.
 */
const PLOTS: readonly Plot[] = [
  // Civic Row (north of the green)
  { buildingId: 'town-hall', slot: 0, map: 'main', x: 26, y: 2 },
  { buildingId: 'post-office', slot: 0, map: 'main', x: 37, y: 2 },
  { buildingId: 'school', slot: 0, map: 'main', x: 46, y: 2 },
  { buildingId: 'chapel', slot: 0, map: 'main', x: 26, y: 11 },
  { buildingId: 'gardens', slot: 0, map: 'main', x: 35, y: 11 },

  // The Green (centre)
  { buildingId: 'clocktower', slot: 0, map: 'main', x: 30, y: 27 },

  // Trade Street (east, along the High Road)
  { buildingId: 'inn', slot: 0, map: 'main', x: 58, y: 2 },
  { buildingId: 'bakery', slot: 0, map: 'main', x: 58, y: 11 },
  { buildingId: 'shop', slot: 0, map: 'main', x: 58, y: 19 },
  { buildingId: 'smithy', slot: 0, map: 'main', x: 58, y: 27 },
  { buildingId: 'workshop', slot: 0, map: 'main', x: 58, y: 35 },

  // Farmland (west)
  { buildingId: 'fields', slot: 0, map: 'main', x: 2, y: 2 },
  { buildingId: 'fields', slot: 1, map: 'main', x: 12, y: 2 },
  { buildingId: 'fields', slot: 2, map: 'main', x: 2, y: 10 },
  { buildingId: 'fields', slot: 3, map: 'main', x: 12, y: 10 },
  { buildingId: 'mill', slot: 0, map: 'main', x: 2, y: 18 },

  // Cottage Lanes (south) - six cottage plots is this layout's own
  // placeholder capacity, not a spec-mandated count (`cottage` is
  // multi-instance; `cottage-garden` is not, so it gets one plot).
  { buildingId: 'cottage', slot: 0, map: 'main', x: 2, y: 41 },
  { buildingId: 'cottage', slot: 1, map: 'main', x: 10, y: 41 },
  { buildingId: 'cottage', slot: 2, map: 'main', x: 18, y: 41 },
  { buildingId: 'cottage', slot: 3, map: 'main', x: 26, y: 41 },
  { buildingId: 'cottage', slot: 4, map: 'main', x: 34, y: 41 },
  { buildingId: 'cottage', slot: 5, map: 'main', x: 42, y: 41 },
  { buildingId: 'cottage-garden', slot: 0, map: 'main', x: 50, y: 41 },

  // Riverside (its own map, reached by the signpost over the footbridge)
  { buildingId: 'riverside-jetty', slot: 0, map: 'riverside', x: 2, y: 2 },
  { buildingId: 'smokehouse', slot: 0, map: 'riverside', x: 10, y: 2 },

  // Forest (its own map, reached by the signpost north of Civic Row)
  { buildingId: 'forest-hut', slot: 0, map: 'forest', x: 4, y: 4 },
];

function footprintOf(plot: Plot): { x0: number; y0: number; x1: number; y1: number } {
  const building = getBuilding(plot.buildingId);
  if (!building) {
    throw new Error(`layout plot references unknown building "${plot.buildingId}"`);
  }
  const [width, height] = building.footprintTiles;
  return { x0: plot.x, y0: plot.y, x1: plot.x + width, y1: plot.y + height };
}

function overlaps(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

for (const plot of PLOTS) {
  const map = MAPS[plot.map];
  const box = footprintOf(plot);
  if (box.x0 < 0 || box.y0 < 0 || box.x1 > map.widthTiles || box.y1 > map.heightTiles) {
    throw new Error(
      `layout plot for "${plot.buildingId}" slot ${plot.slot} falls outside the ${plot.map} map`,
    );
  }
}

for (let i = 0; i < PLOTS.length; i++) {
  for (let j = i + 1; j < PLOTS.length; j++) {
    const a = PLOTS[i];
    const b = PLOTS[j];
    if (a === undefined || b === undefined || a.map !== b.map) {
      continue;
    }
    if (overlaps(footprintOf(a), footprintOf(b))) {
      throw new Error(
        `layout plots for "${a.buildingId}" slot ${a.slot} and "${b.buildingId}" slot ${b.slot} overlap on the ${a.map} map`,
      );
    }
  }
}

/** The fixed plot for a building, or its `slot`-th instance if it's multi-instance. */
export function getPlot(buildingId: BuildingId, slot = 0): Plot | undefined {
  return PLOTS.find((plot) => plot.buildingId === buildingId && plot.slot === slot);
}

/** Every plot on a given map, for a renderer to draw. */
export function plotsOnMap(map: MapId): readonly Plot[] {
  return PLOTS.filter((plot) => plot.map === map);
}

const WORK_PHASES: readonly DayPhase[] = ['work-first-stint', 'work-second-stint'];

/**
 * Where a villager working `tradeId` is right now, or `undefined` if
 * there's nothing to honestly place them at: their trade's workplace
 * hasn't been built yet, it's not a work-stint hour, or the `slot`-th
 * instance of that workplace doesn't exist. Off-duty villagers have no
 * assigned home plot yet (spec section 8's "owner's home at the end of
 * the lane" aside, cottages aren't assigned to a particular villager),
 * so this never guesses a home location.
 */
export function positionForWorker(
  tradeId: string,
  builtBuildingIds: readonly string[],
  phase: DayPhase,
  slot = 0,
): Plot | undefined {
  if (!WORK_PHASES.includes(phase)) {
    return undefined;
  }
  const trade = getTrade(tradeId);
  if (!trade) {
    return undefined;
  }
  const builtCount = builtBuildingIds.filter((id) => id === trade.worksAt).length;
  if (slot >= builtCount) {
    return undefined;
  }
  return getPlot(trade.worksAt as BuildingId, slot);
}
