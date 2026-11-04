import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INTERIOR_LAYOUTS } from './interiors.js';
import type { SpriteFrame } from './sprites.js';

/** A PNG's width/height live in its IHDR chunk at fixed byte offsets - no need for an image library just to read them. */
function pngDimensions(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const ART_SRC = fileURLToPath(new URL('../../../art/src', import.meta.url));

function isSaneFrame(frame: SpriteFrame): boolean {
  return (
    frame.file.length > 0 && frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0
  );
}

function footprint(item: { sprite: SpriteFrame; x: number; y: number }) {
  return {
    x0: item.x,
    y0: item.y,
    x1: item.x + item.sprite.width / 16,
    y1: item.y + item.sprite.height / 16,
  };
}

function overlaps(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

describe('interiors', () => {
  it('has a layout for cottage and town-hall, the bootstrap scenario', () => {
    expect(INTERIOR_LAYOUTS.cottage).toBeDefined();
    expect(INTERIOR_LAYOUTS['town-hall']).toBeDefined();
  });

  it('every placed item is a sane frame at a non-negative tile position', () => {
    for (const [buildingId, items] of Object.entries(INTERIOR_LAYOUTS)) {
      for (const item of items) {
        expect(isSaneFrame(item.sprite), buildingId).toBe(true);
        expect(item.x, buildingId).toBeGreaterThanOrEqual(0);
        expect(item.y, buildingId).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never overlaps two items in the same layout', () => {
    for (const [buildingId, items] of Object.entries(INTERIOR_LAYOUTS)) {
      const placed = items;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          if (!a || !b) {
            continue;
          }
          expect(overlaps(footprint(a), footprint(b)), `${buildingId}[${i}] vs [${j}]`).toBe(false);
        }
      }
    }
  });

  it('crops every placed sprite within the bounds of its real, committed sheet file', () => {
    const dimensionsByFile = new Map<string, { width: number; height: number }>();
    for (const [buildingId, items] of Object.entries(INTERIOR_LAYOUTS)) {
      for (const item of items) {
        const frame = item.sprite;
        let dimensions = dimensionsByFile.get(frame.file);
        if (!dimensions) {
          dimensions = pngDimensions(`${ART_SRC}/${frame.file}`);
          dimensionsByFile.set(frame.file, dimensions);
        }
        expect(frame.x + frame.width, buildingId).toBeLessThanOrEqual(dimensions.width);
        expect(frame.y + frame.height, buildingId).toBeLessThanOrEqual(dimensions.height);
      }
    }
  });
});
