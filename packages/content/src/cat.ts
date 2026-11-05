/**
 * The village cat (spec section 15: "The village cat roams, naps in sunny
 * spots"). Like the villagers, where it is comes from the clock alone, so
 * every browser sees it in the same place: a new nap spot each village
 * hour by day, and a doorstep to sleep on at night.
 */
import { getPlot } from './layout.js';
import type { SpriteFrame } from './sprites.js';
import { doorOf } from './whereabouts.js';

/** The orange cat's two sitting frames (Ninja Adventure, CC0), swapped for a slow idle. */
export const CAT_FRAMES: readonly SpriteFrame[] = [
  { file: 'characters/cat.png', x: 0, y: 0, width: 22, height: 17 },
  { file: 'characters/cat.png', x: 22, y: 0, width: 22, height: 17 },
];

export interface CatSpot {
  /** A tile on the main map. */
  x: number;
  y: number;
  /** For people to read: "napping on the green". */
  where: string;
}

/** Sunny places on the main map, all on open grass. */
export const CAT_NAP_SPOTS: readonly CatSpot[] = [
  { x: 33, y: 28, where: 'napping on the green' },
  { x: 30, y: 30, where: 'napping on the green' },
  { x: 36, y: 27, where: 'sunning itself on the green' },
  { x: 20, y: 12, where: 'napping in the long grass' },
  { x: 48, y: 14, where: 'watching the birds' },
  { x: 14, y: 38, where: 'stalking something in the grass' },
  { x: 50, y: 40, where: 'napping in the long grass' },
  { x: 62, y: 18, where: 'watching the river' },
];

/** A small, steady hash, so the same hour always picks the same spot. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * Where the cat is: asleep on a doorstep from 21:00 to 06:00 (the inn's,
 * or the town hall's if there's no inn), otherwise in one of its nap
 * spots, picked afresh each hour of each day. `day` is any number that
 * changes from day to day.
 */
export function catSpot(day: string, hour: number, builtBuildingIds: readonly string[]): CatSpot {
  if (hour >= 21 || hour < 6) {
    const doorstep = builtBuildingIds.includes('inn')
      ? getPlot('inn')
      : builtBuildingIds.includes('town-hall')
        ? getPlot('town-hall')
        : undefined;
    if (doorstep) {
      const door = doorOf(doorstep);
      return {
        x: door.x + 1,
        y: door.y,
        where: `asleep on the ${doorstep.buildingId === 'inn' ? 'inn' : 'town hall'} doorstep`,
      };
    }
  }
  const spot = CAT_NAP_SPOTS[hash(`${day}:${hour}`) % CAT_NAP_SPOTS.length];
  return spot ?? { x: 33, y: 28, where: 'napping on the green' };
}
