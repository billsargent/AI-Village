import type { BuildingId } from './buildings.js';

/**
 * A pixel rectangle within one of art/src's sheets (spec section 10),
 * served at the same relative path by the web app's Vite `publicDir`.
 * These are the project's own choice of which sprite stands for which
 * game entity - not something the vendor packs label for us, so each
 * one is a deliberate, documented pick rather than a guess.
 */
export interface SpriteFrame {
  /** Path relative to art/src, e.g. "tiles/serene-village-outside.png". */
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const OUTSIDE_TILES = 'tiles/serene-village-outside.png';
const VILLAGER_IDLE = 'characters/villager-idle.png';

/** A single plain grass tile, tileable, from Serene Village Revamped. */
export const GRASS_TILE: SpriteFrame = { file: OUTSIDE_TILES, x: 48, y: 0, width: 16, height: 16 };

/**
 * One sprite per building id this project has actually picked an image
 * for yet - buildings without an entry here aren't drawn (never a blank
 * placeholder box standing in for real art).
 */
export const BUILDING_SPRITES: Partial<Record<BuildingId, SpriteFrame>> = {
  'town-hall': { file: OUTSIDE_TILES, x: 0, y: 400, width: 80, height: 64 },
  cottage: { file: OUTSIDE_TILES, x: 0, y: 352, width: 48, height: 48 },
};

/** The one villager sprite available so far: a plain idle, facing the viewer. */
export const VILLAGER_SPRITE: SpriteFrame = {
  file: VILLAGER_IDLE,
  x: 0,
  y: 0,
  width: 16,
  height: 16,
};
