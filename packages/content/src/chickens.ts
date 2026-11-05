/**
 * The farm's chickens (spec section 15: "the farm gets chickens"). Once
 * fields are built, three hens peck about the first field, each moving
 * to a new spot every quarter of a village hour - from the clock alone,
 * like the villagers and the cat, so every browser agrees.
 */
import { getPlot } from './layout.js';
import type { SpriteFrame } from './sprites.js';

/** A white hen's two frames (Ninja Adventure, CC0), swapped as she pecks. */
export const CHICKEN_FRAMES: readonly SpriteFrame[] = [
  { file: 'characters/chicken.png', x: 0, y: 0, width: 16, height: 16 },
  { file: 'characters/chicken.png', x: 16, y: 0, width: 16, height: 16 },
];

export const CHICKEN_COUNT = 3;

export interface ChickenSpot {
  id: string;
  /** A tile on the main map. */
  x: number;
  y: number;
  where: string;
}

const DOINGS = ['pecking at the furrows', 'scratching for seed', 'having a dust bath', 'clucking'];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * Where each hen is: somewhere inside the first field, picked afresh each
 * quarter hour. `day` is any string that changes from day to day. None
 * without fields.
 */
export function chickenSpots(
  day: string,
  hour: number,
  minuteOfHour: number,
  builtBuildingIds: readonly string[],
): readonly ChickenSpot[] {
  const field = builtBuildingIds.includes('fields') ? getPlot('fields', 0) : undefined;
  if (!field) {
    return [];
  }
  // Fields are 8x6 tiles; the hens keep a tile in from the edges.
  const quarter = Math.floor(minuteOfHour / 15);
  return Array.from({ length: CHICKEN_COUNT }, (_, index) => {
    const roll = hash(`${day}:${hour}:${quarter}:${index}`);
    return {
      id: `chicken-${index}`,
      x: field.x + 1 + (roll % 6),
      y: field.y + 1 + (Math.floor(roll / 6) % 4),
      where: DOINGS[Math.floor(roll / 24) % DOINGS.length] ?? 'clucking',
    };
  });
}
