/**
 * The map's zoom levels. Close up they're whole steps only, so pixel art
 * stays crisp (spec sections 8 and 10: "zooms in whole steps"). At the far
 * end there's one more: 1x, and below it, if 1x still doesn't fit, the
 * scale at which the whole map fits the screen - the overview, where a
 * little softness is worth seeing everything at once.
 */
const WHOLE_STEPS = [1, 2, 3, 4] as const;

/** The zoom the map opens at. */
export const DEFAULT_ZOOM = 3;

export function zoomLevels(
  screenWidth: number,
  screenHeight: number,
  mapWidth: number,
  mapHeight: number,
): readonly number[] {
  const fit = Math.min(screenWidth / mapWidth, screenHeight / mapHeight);
  return fit < 1 && fit > 0 ? [fit, ...WHOLE_STEPS] : WHOLE_STEPS;
}

/**
 * One step in (`step` 1) or out (-1) from `current`. A zoom that's no
 * longer a level - the screen was resized, so the whole-map fit moved -
 * steps to the nearest level in that direction.
 */
export function stepZoom(levels: readonly number[], current: number, step: number): number {
  const first = levels[0] ?? 1;
  const last = levels[levels.length - 1] ?? 1;
  if (step > 0) {
    return levels.find((level) => level > current + 1e-6) ?? last;
  }
  if (step < 0) {
    return [...levels].reverse().find((level) => level < current - 1e-6) ?? first;
  }
  return clampZoom(levels, current);
}

/** Keeps a zoom within the levels there are now. */
export function clampZoom(levels: readonly number[], current: number): number {
  const first = levels[0] ?? 1;
  const last = levels[levels.length - 1] ?? 1;
  return Math.min(Math.max(current, first), last);
}
