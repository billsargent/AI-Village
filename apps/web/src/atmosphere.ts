/**
 * How the village looks beyond its drawn art: lights at night (spec
 * section 7: "lamps light at 19"; "lit windows and lamps glow"), the
 * seasons (section 10: "spring blossom pinks, summer greens, autumn
 * ambers with falling leaves, winter snow on roofs and paths") and the
 * weather (section 5: rain and a darker tint, snow falling, a fog layer).
 * All tints and particles over the same art - "seasons and night are
 * palette swaps and tints, not new drawings".
 *
 * Plain functions, so the canvas only has to draw what they decide.
 */
import { OPEN_AIR_BUILDINGS } from '@ai-village/content';
import type { Rgb } from './light.js';
import type { BuildingDrawnSprite } from './village-draw.js';

/** One soft light on the map, in map pixels: its centre and how far it reaches. */
export interface Glow {
  x: number;
  y: number;
  radius: number;
  kind: 'window' | 'door';
}

/**
 * The lights of every lived-in building on the map: a window either side
 * of the door, about two-thirds down the front, and the door itself.
 * Open ground - fields, gardens, the jetty - has nothing to light.
 */
export function glowsFor(buildings: readonly BuildingDrawnSprite[]): readonly Glow[] {
  const glows: Glow[] = [];
  for (const building of buildings) {
    if (OPEN_AIR_BUILDINGS.has(building.buildingId)) {
      continue;
    }
    const { width, height } = building.sprite;
    const windowY = building.y + Math.round(height * 0.62);
    glows.push(
      { x: building.x + Math.round(width * 0.25), y: windowY, radius: 14, kind: 'window' },
      { x: building.x + Math.round(width * 0.75), y: windowY, radius: 14, kind: 'window' },
      { x: building.x + Math.round(width / 2), y: windowY + 4, radius: 10, kind: 'door' },
    );
  }
  return glows;
}

/**
 * How brightly the lights burn, 0-1: lit from 18:30 to full by 19:30,
 * all night, then put out between 05:00 and 06:00.
 */
export function glowStrength(hour: number, minuteOfHour: number): number {
  const time = hour + minuteOfHour / 60;
  if (time >= 19.5 || time < 5) {
    return 1;
  }
  if (time >= 18.5) {
    return time - 18.5;
  }
  if (time < 6) {
    return 6 - time;
  }
  return 0;
}

export type Particles = 'none' | 'rain' | 'snow' | 'petals' | 'leaves';

/**
 * A colour matrix (Pixi's 4x5, offsets 0-1): the palette swap a season makes.
 * Each row is r, g, b, a, offset for one output channel.
 */
export type ColourMatrix = readonly number[];

/** Autumn's ground: greens warmed towards olive and gold, paths barely changed. */
// prettier-ignore
export const AUTUMN_GROUND_MATRIX: ColourMatrix = [
  0.9, 0.18, 0, 0, 0,
  0.05, 0.85, 0, 0, 0,
  0, 0, 0.8, 0, 0,
  0, 0, 0, 1, 0,
];

/** Autumn's trees: leaf greens turned to orange and amber, trunks still brown. */
// prettier-ignore
export const AUTUMN_FOLIAGE_MATRIX: ColourMatrix = [
  0.6, 0.9, 0, 0, 0,
  0.2, 0.55, 0, 0, 0,
  0, 0, 0.3, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * Winter's snow cover over the ground: each pixel's brightness, kept
 * faintly so paths and banks still show, over a pale blue-white.
 */
// prettier-ignore
export const SNOW_COVER_MATRIX: ColourMatrix = [
  0.105, 0.175, 0.07, 0, 0.6,
  0.105, 0.175, 0.07, 0, 0.63,
  0.105, 0.175, 0.07, 0, 0.68,
  0, 0, 0, 1, 0,
];

/** Winter's trees: dusted with snow, most of their colour still showing. */
// prettier-ignore
export const FROSTED_FOLIAGE_MATRIX: ColourMatrix = [
  0.65, 0, 0, 0, 0.3,
  0, 0.65, 0, 0, 0.32,
  0, 0, 0.65, 0, 0.36,
  0, 0, 0, 1, 0,
];

export interface SeasonLook {
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  /** The palette swap for trees and bushes, or null to leave them as drawn. */
  foliage: ColourMatrix | null;
  /** The palette swap for the grass, paths, water and flat decor, or null. */
  ground: ColourMatrix | null;
  /** Whether flowers and daisies show. */
  blooms: boolean;
  /** What drifts across the map in fair weather. */
  drift: Particles;
}

export function seasonLook(season: string): SeasonLook {
  switch (season) {
    case 'spring':
      return { season, foliage: null, ground: null, blooms: true, drift: 'petals' };
    case 'autumn':
      return {
        season,
        foliage: AUTUMN_FOLIAGE_MATRIX,
        ground: AUTUMN_GROUND_MATRIX,
        blooms: true,
        drift: 'leaves',
      };
    case 'winter':
      return {
        season,
        foliage: FROSTED_FOLIAGE_MATRIX,
        ground: SNOW_COVER_MATRIX,
        blooms: false,
        drift: 'none',
      };
    default:
      return { season: 'summer', foliage: null, ground: null, blooms: true, drift: 'none' };
  }
}

export interface WeatherLook {
  /** What falls or blows; `drift` means the season's own drift, if any. */
  particles: Particles | 'drift';
  /** How many on screen at once. */
  count: number;
  /** How fast they blow sideways, in screen pixels a second. */
  wind: number;
  /** The light multiplied by this: rain and storms are darker. */
  dim: number;
  /** 0-1: how thick the fog layer is. */
  fog: number;
}

export function weatherLook(weather: string): WeatherLook {
  switch (weather) {
    case 'rain':
      return { particles: 'rain', count: 160, wind: 40, dim: 0.85, fog: 0 };
    case 'storm':
      return { particles: 'rain', count: 320, wind: 160, dim: 0.7, fog: 0 };
    case 'snow':
      return { particles: 'snow', count: 140, wind: 15, dim: 0.95, fog: 0 };
    case 'fog':
      return { particles: 'drift', count: 25, wind: 10, dim: 0.95, fog: 0.4 };
    case 'wind':
      return { particles: 'drift', count: 60, wind: 140, dim: 1, fog: 0 };
    default:
      return { particles: 'drift', count: 30, wind: 25, dim: 1, fog: 0 };
  }
}

/** What actually falls or drifts: the weather's own, or the season's in fair weather. */
export function particlesNow(season: SeasonLook, weather: WeatherLook): Particles {
  return weather.particles === 'drift' ? season.drift : weather.particles;
}

/** The light, dimmed by the weather. */
export function dimmed(light: Rgb, by: number): Rgb {
  return [Math.round(light[0] * by), Math.round(light[1] * by), Math.round(light[2] * by)];
}

/**
 * How fast villagers walk against real time (spec section 5: snow makes
 * walking 20% slower). Paused, nobody moves. Faster clocks speed them up,
 * but not all the way, so a walk can still be followed by eye.
 */
export function walkPace(
  clock: { speed: number; paused: boolean } | undefined,
  weather: string,
): number {
  if (clock?.paused) {
    return 0;
  }
  const bySpeed: Record<number, number> = { 1: 1, 2: 1.6, 4: 2.5 };
  const pace = bySpeed[clock?.speed ?? 1] ?? 1;
  return weather === 'snow' ? pace * 0.8 : pace;
}
