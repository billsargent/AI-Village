import { describe, expect, it } from 'vitest';
import { BUILDING_SPRITES, GRASS_TILE, VILLAGER_SPRITE, type SpriteFrame } from './sprites.js';

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

  it('VILLAGER_SPRITE is a sane, tile-sized frame', () => {
    expect(isSaneFrame(VILLAGER_SPRITE)).toBe(true);
    expect(VILLAGER_SPRITE.width).toBe(16);
    expect(VILLAGER_SPRITE.height).toBe(16);
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
});
