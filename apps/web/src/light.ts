/**
 * Spec section 10's lighting: "A full-screen tint follows the clock:
 * amber at dawn, neutral by day, violet at dusk, deep blue at night (45%
 * brightness)." The tint is a colour the map is multiplied by, blended
 * smoothly between these points through the day; text panels sit above
 * it and are never tinted.
 */

export type Rgb = readonly [number, number, number];

const NIGHT: Rgb = [92, 104, 168]; // deep blue, about 45% brightness
const DAWN: Rgb = [255, 196, 140]; // amber
const DAY: Rgb = [255, 255, 255]; // neutral: multiplying by white changes nothing
const DUSK: Rgb = [206, 160, 222]; // violet

/** [hour of day, colour], in order; the day wraps from the last back to the first. */
const KEYS: readonly (readonly [number, Rgb])[] = [
  [0, NIGHT],
  [4, NIGHT],
  [5.5, DAWN],
  [7.5, DAY],
  [17, DAY],
  [19, DUSK],
  [21, NIGHT],
  [24, NIGHT],
];

/** The tint colour at a village time, as an `rgb()` multiplier. */
export function lightAt(hour: number, minuteOfHour: number): Rgb {
  const time = (((hour + minuteOfHour / 60) % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [fromHour, from] = KEYS[i] as readonly [number, Rgb];
    const [toHour, to] = KEYS[i + 1] as readonly [number, Rgb];
    if (time >= fromHour && time <= toHour) {
      const t = toHour === fromHour ? 0 : (time - fromHour) / (toHour - fromHour);
      const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
      return [mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2])];
    }
  }
  return NIGHT;
}

/** Roughly how bright the map looks under the tint, 0-1. */
export function brightnessOf(rgb: Rgb): number {
  return (rgb[0] + rgb[1] + rgb[2]) / (3 * 255);
}

/** A word for the light, for screen readers and the clock. */
export function lightWord(hour: number): string {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 17 && hour < 21) return 'dusk';
  if (hour >= 21 || hour < 5) return 'night';
  return 'day';
}
