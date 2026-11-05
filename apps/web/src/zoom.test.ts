import { describe, expect, it } from 'vitest';
import { clampZoom, stepZoom, zoomLevels } from './zoom.js';

// The main map: 72 x 52 tiles of 16px.
const MAIN = [72 * 16, 52 * 16] as const;

describe('zoomLevels', () => {
  it('goes from 1x to 4x in whole steps when the whole map fits at 1x', () => {
    expect(zoomLevels(1920, 1080, ...MAIN)).toEqual([1, 2, 3, 4]);
  });

  it('adds a whole-map level below 1x on a screen too small for it', () => {
    const levels = zoomLevels(1280, 720, ...MAIN);
    expect(levels.slice(1)).toEqual([1, 2, 3, 4]);
    const fit = levels[0] ?? 0;
    expect(fit).toBeLessThan(1);
    // At that zoom the whole map is on screen.
    expect(MAIN[0] * fit).toBeLessThanOrEqual(1280);
    expect(MAIN[1] * fit).toBeLessThanOrEqual(720);
  });
});

describe('stepZoom', () => {
  const levels = zoomLevels(1280, 720, ...MAIN);

  it('steps out from 3x down to the whole map, and no further', () => {
    let zoom = 3;
    zoom = stepZoom(levels, zoom, -1);
    expect(zoom).toBe(2);
    zoom = stepZoom(levels, zoom, -1);
    expect(zoom).toBe(1);
    zoom = stepZoom(levels, zoom, -1);
    expect(zoom).toBe(levels[0]);
    expect(stepZoom(levels, zoom, -1)).toBe(levels[0]);
  });

  it('steps back in to whole steps, and stops at 4x', () => {
    expect(stepZoom(levels, levels[0] ?? 0, 1)).toBe(1);
    expect(stepZoom(levels, 4, 1)).toBe(4);
  });

  it('keeps a zoom within the levels there are', () => {
    expect(clampZoom([1, 2, 3, 4], 0.5)).toBe(1);
    expect(clampZoom([1, 2, 3, 4], 9)).toBe(4);
  });
});
