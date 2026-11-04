import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './buildings.js';
import { BUILDING_SPRITES, GRASS_TILE, spriteForVillager, type SpriteFrame } from './sprites.js';

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

describe('sprites', () => {
  it('GRASS_TILE is a sane, tile-sized frame', () => {
    expect(isSaneFrame(GRASS_TILE)).toBe(true);
    expect(GRASS_TILE.width).toBe(16);
    expect(GRASS_TILE.height).toBe(16);
  });

  describe('spriteForVillager', () => {
    it('is a sane, tile-sized frame', () => {
      const sprite = spriteForVillager('hesper');
      expect(isSaneFrame(sprite)).toBe(true);
      expect(sprite.width).toBe(16);
      expect(sprite.height).toBe(16);
    });

    it('is deterministic - the same id always gets the same sprite', () => {
      expect(spriteForVillager('hesper')).toEqual(spriteForVillager('hesper'));
    });

    it('spreads a sample of ids across more than one sprite', () => {
      const sampleIds = Array.from({ length: 30 }, (_, i) => `villager-${i}`);
      const files = new Set(sampleIds.map((id) => spriteForVillager(id).file));
      expect(files.size).toBeGreaterThan(1);
    });
  });

  it('every building sprite is a sane frame', () => {
    for (const [buildingId, frame] of Object.entries(BUILDING_SPRITES)) {
      expect(isSaneFrame(frame), buildingId).toBe(true);
    }
  });

  it('has sprites for town-hall and cottage, the bootstrap scenario', () => {
    expect(BUILDING_SPRITES['town-hall']).toBeDefined();
    expect(BUILDING_SPRITES.cottage).toBeDefined();
  });

  it('has a sprite for every building except clocktower', () => {
    const withoutSprites = BUILDINGS.filter((building) => !BUILDING_SPRITES[building.id]).map(
      (building) => building.id,
    );
    expect(withoutSprites).toEqual(['clocktower']);
  });

  it('never reuses the same crop rectangle for two different buildings', () => {
    const seen = new Map<string, string>();
    for (const [buildingId, frame] of Object.entries(BUILDING_SPRITES)) {
      const key = `${frame.file}:${frame.x},${frame.y},${frame.width}x${frame.height}`;
      const earlier = seen.get(key);
      expect(earlier, `${buildingId} reuses ${earlier}'s crop rect`).toBeUndefined();
      seen.set(key, buildingId);
    }
  });

  it('crops every frame within the bounds of its real, committed sheet file', () => {
    const dimensionsByFile = new Map<string, { width: number; height: number }>();
    const sampleIds = Array.from({ length: 30 }, (_, i) => `villager-${i}`);
    const villagerFrames = new Map(sampleIds.map((id) => [id, spriteForVillager(id)]));
    const frames: [string, SpriteFrame][] = [
      ['GRASS_TILE', GRASS_TILE],
      ...villagerFrames.entries(),
      ...Object.entries(BUILDING_SPRITES),
    ];
    for (const [name, frame] of frames) {
      let dimensions = dimensionsByFile.get(frame.file);
      if (!dimensions) {
        dimensions = pngDimensions(`${ART_SRC}/${frame.file}`);
        dimensionsByFile.set(frame.file, dimensions);
      }
      expect(frame.x + frame.width, name).toBeLessThanOrEqual(dimensions.width);
      expect(frame.y + frame.height, name).toBeLessThanOrEqual(dimensions.height);
    }
  });
});
