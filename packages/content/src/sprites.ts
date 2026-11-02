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
const TILE = 16;

/** A rectangle given in art/src/tiles/serene-village-outside.png's own 16px tile grid. */
function tileRect(x: number, y: number, width: number, height: number): SpriteFrame {
  return {
    file: OUTSIDE_TILES,
    x: x * TILE,
    y: y * TILE,
    width: width * TILE,
    height: height * TILE,
  };
}

/** A single plain grass tile, tileable, from Serene Village Revamped. */
export const GRASS_TILE: SpriteFrame = tileRect(3, 0, 1, 1);

/**
 * One sprite per building id this project has actually picked an image
 * for yet - buildings without an entry here aren't drawn (never a blank
 * placeholder box standing in for real art). Picked by opening
 * Serene_Village_16x16.png with a tile-grid overlay and reading off
 * coordinates, not guessed; coordinates are documented per entry below
 * since nothing in the sheet itself names which house is which building.
 *
 * `clocktower` has no entry: it's tall and narrow (spec's footprint is
 * 3x5), and nothing in this tileset reads as a tower rather than a
 * square cottage - better left undrawn than visually misrepresented.
 * It's also late-game (unlocks at population 10).
 */
export const BUILDING_SPRITES: Partial<Record<BuildingId, SpriteFrame>> = {
  // The large, two-window house, one copy per civic/prominent building.
  'town-hall': tileRect(0, 25, 5, 4),
  inn: tileRect(5, 25, 5, 4),
  school: tileRect(0, 33, 5, 4),
  chapel: tileRect(0, 41, 5, 4),
  mill: tileRect(5, 41, 5, 4),

  // The small plain cottage, for housing and the two "hut" buildings.
  cottage: tileRect(0, 22, 3, 3),
  'forest-hut': tileRect(0, 30, 3, 3),

  // The small house with a window bay, for modest trade buildings.
  'post-office': tileRect(6, 21, 3, 3),
  shop: tileRect(6, 29, 3, 3),
  workshop: tileRect(6, 37, 3, 3),

  // The small house with a chimney - fits anywhere smoke or heat is the point.
  bakery: tileRect(10, 24, 3, 4),
  smokehouse: tileRect(10, 32, 3, 4),
  smithy: tileRect(10, 40, 3, 4),

  // Non-house plots: a walled garden, a smaller bush/rock cluster, a
  // riverside dock, and a worked patch of ground for the fields.
  gardens: tileRect(0, 7, 6, 5),
  'cottage-garden': tileRect(7, 7, 2, 3),
  'riverside-jetty': tileRect(10, 3, 2, 4),
  fields: tileRect(7, 1, 1, 1),
};

/** The one villager sprite available so far: a plain idle, facing the viewer. */
export const VILLAGER_SPRITE: SpriteFrame = {
  file: VILLAGER_IDLE,
  x: 0,
  y: 0,
  width: 16,
  height: 16,
};
