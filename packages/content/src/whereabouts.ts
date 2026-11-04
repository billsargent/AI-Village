/**
 * Where each villager is at each part of the day (spec section 7's "A
 * villager's day"): "Positions come from the schedule and the clock, so
 * the browser places everyone correctly on any load."
 *
 * The sim doesn't build per-villager schedules yet (needs, weather and
 * traits don't move anyone), so this is the plain routine every villager
 * follows, from spec section 5's day shape:
 * - dawn and night: at home, indoors;
 * - work stints: at their workplace - indoors if it's a building, out on
 *   the plot if it's fields or a garden;
 * - lunch: at the inn if there is one, otherwise out on the green;
 * - evening: half at the inn (if there is one), the rest on the green.
 * Anyone with no home, or whose workplace isn't built, waits on the green.
 *
 * Homes aren't assigned in the sim yet, so villagers share out the built
 * cottages in roster order. That's a display rule, not a tenancy.
 */

import { getBuilding, type BuildingId } from './buildings.js';
import { getPlot, type DayPhase, type MapId, type Plot } from './layout.js';
import { getTrade } from './trades.js';

/** Buildings that are open ground, not rooms: villagers work out on them instead of going in. */
export const OPEN_AIR_BUILDINGS: ReadonlySet<string> = new Set([
  'fields',
  'gardens',
  'cottage-garden',
  'riverside-jetty',
  'clocktower',
]);

/** Places on the path round the green where villagers stand about (spec section 8's "The Green"). */
const GREEN_SPOTS: readonly { x: number; y: number }[] = [
  { x: 28, y: 24 },
  { x: 38, y: 24 },
  { x: 28, y: 33 },
  { x: 38, y: 33 },
  { x: 25, y: 27 },
  { x: 42, y: 27 },
  { x: 25, y: 31 },
  { x: 42, y: 31 },
  { x: 31, y: 24 },
  { x: 35, y: 24 },
  { x: 31, y: 33 },
  { x: 35, y: 33 },
];

/**
 * Where a villager leaves one map for another: the tile by each
 * signpost, on its road. Riverside and the forest only connect to the
 * main map.
 */
const EXITS: Record<MapId, Partial<Record<MapId, { x: number; y: number }>>> = {
  main: { riverside: { x: 67, y: 25 }, forest: { x: 44, y: 0 } },
  riverside: { main: { x: 0, y: 6 } },
  forest: { main: { x: 5, y: 31 } },
};

/** Where a villager is: a tile on a map, and whether they're out of sight inside a building there. */
export interface Spot {
  map: MapId;
  /** Tile coordinates. For someone inside, the building's door. */
  x: number;
  y: number;
  /** The building they've gone into, if they're indoors. */
  inside?: { buildingId: string; slot: number };
  /** For people to read: "at home", "in the town hall", "on the green". */
  where: string;
}

export interface Resident {
  id: string;
  tradeId: string;
}

function footprint(buildingId: string): readonly [number, number] {
  return getBuilding(buildingId)?.footprintTiles ?? [1, 1];
}

/** The tile just outside a building's door: the middle of the doorstep row below its plot. */
export function doorOf(plot: Plot): { x: number; y: number } {
  const [width, height] = footprint(plot.buildingId);
  return { x: plot.x + Math.floor(width / 2), y: plot.y + height };
}

/** "town-hall" -> "town hall", "riverside-jetty" -> "jetty". */
function nameOf(buildingId: string): string {
  return buildingId.replace(/^riverside-/, '').replace(/-/g, ' ');
}

function countBuilt(builtBuildingIds: readonly string[], buildingId: string): number {
  return builtBuildingIds.filter((id) => id === buildingId).length;
}

function onTheGreen(index: number): Spot {
  const spot = GREEN_SPOTS[index % GREEN_SPOTS.length] ?? { x: 28, y: 24 };
  return { map: 'main', x: spot.x, y: spot.y, where: 'on the green' };
}

function insideOf(plot: Plot, where: string): Spot {
  const door = doorOf(plot);
  return {
    map: plot.map,
    ...door,
    inside: { buildingId: plot.buildingId, slot: plot.slot },
    where,
  };
}

/** Out on open ground - a field, a garden, the jetty - spaced out so two workers don't overlap. */
function outOn(plot: Plot, nth: number): Spot {
  const [width, height] = footprint(plot.buildingId);
  return {
    map: plot.map,
    x: plot.x + 1 + ((nth * 2) % Math.max(1, width - 2)),
    y: plot.y + Math.floor(height / 2),
    where: `at the ${nameOf(plot.buildingId)}`,
  };
}

/**
 * Where everyone is at `phase`, in roster order - one spot per resident.
 * Pure and deterministic: the same facts always give the same places.
 */
export function spotsFor(
  residents: readonly Resident[],
  builtBuildingIds: readonly string[],
  phase: DayPhase,
): readonly Spot[] {
  const cottages = countBuilt(builtBuildingIds, 'cottage');
  const innBuilt = countBuilt(builtBuildingIds, 'inn') > 0;
  const workersSoFar = new Map<string, number>();

  return residents.map((resident, index) => {
    const homePlot = cottages > 0 ? getPlot('cottage', index % cottages) : undefined;
    const atHome = homePlot ? insideOf(homePlot, 'at home') : onTheGreen(index);
    const inn = getPlot('inn');

    switch (phase) {
      case 'dawn':
      case 'night':
        return atHome;
      case 'lunch':
        return innBuilt && inn ? insideOf(inn, 'at the inn') : onTheGreen(index);
      case 'evening':
        return innBuilt && inn && index % 2 === 0 ? insideOf(inn, 'at the inn') : onTheGreen(index);
      case 'work-first-stint':
      case 'work-second-stint': {
        const workplace = getTrade(resident.tradeId)?.worksAt;
        const built = workplace ? countBuilt(builtBuildingIds, workplace) : 0;
        if (!workplace || built === 0) {
          return onTheGreen(index);
        }
        const nth = workersSoFar.get(workplace) ?? 0;
        workersSoFar.set(workplace, nth + 1);
        const plot = getPlot(workplace as BuildingId, nth % built);
        if (!plot) {
          return onTheGreen(index);
        }
        return OPEN_AIR_BUILDINGS.has(workplace)
          ? outOn(plot, Math.floor(nth / built))
          : insideOf(plot, `in the ${nameOf(workplace)}`);
      }
    }
  });
}

/**
 * How a spot looks from `viewMap`: itself if it's on that map; if it's
 * on another, the villager has gone off by the signpost toward it -
 * standing at the exit, out of sight. Null if there's no way between.
 */
export function spotSeenFrom(spot: Spot, viewMap: MapId): Spot | null {
  if (spot.map === viewMap) {
    return spot;
  }
  const exit = EXITS[viewMap][viewMap === 'main' ? spot.map : 'main'];
  if (!exit) {
    return null;
  }
  return { map: viewMap, ...exit, inside: { buildingId: 'signpost', slot: 0 }, where: spot.where };
}
