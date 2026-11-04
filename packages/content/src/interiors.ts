import type { BuildingId } from './buildings.js';
import type { SpriteFrame } from './sprites.js';

const INSIDE_TILES = 'tiles/serene-village-inside.png';
const TILE = 16;

/** A rectangle given in art/src/tiles/serene-village-inside.png's own 16px tile grid. */
function insideTileRect(x: number, y: number, width: number, height: number): SpriteFrame {
  return {
    file: INSIDE_TILES,
    x: x * TILE,
    y: y * TILE,
    width: width * TILE,
    height: height * TILE,
  };
}

/**
 * Furniture this project has picked from the original Serene Village
 * pack's interior sheet (spec section 10) - opened with a tile-grid
 * overlay and read off the same way the outdoor building sprites were,
 * not guessed. Only the pieces actually used by an `INTERIOR_LAYOUTS`
 * entry below are named here.
 */
export const BED = insideTileRect(0, 18, 2, 2);
export const NIGHTSTAND = insideTileRect(2, 9, 1, 2);
export const WARDROBE = insideTileRect(2, 10, 2, 2);
export const TABLE = insideTileRect(2, 12, 2, 2);
export const BOOKSHELF = insideTileRect(4, 12, 2, 2);
export const CHAIR = insideTileRect(4, 14, 1, 1);
export const RUG_SMALL = insideTileRect(4, 8, 2, 1);
export const RUG_BIG = insideTileRect(6, 11, 3, 3);
export const PLANT = insideTileRect(0, 12, 1, 1);

/**
 * A plain floor colour for interior scenes, the indoor equivalent of
 * the outdoor view's canvas background - not a real floor tile (the
 * sheet's own floor/wall art doesn't sit on clean tile boundaries, so
 * there's no honest single tile to crop and repeat), just a backdrop
 * behind the real, picked furniture sprites.
 */
export const INTERIOR_FLOOR_COLOR = '#d7c88a';

export interface InteriorItem {
  sprite: SpriteFrame;
  /** Tile coordinates (16px) local to this one building's interior scene. */
  x: number;
  y: number;
}

/**
 * A small, explicit furniture layout per building id - never
 * auto-generated or guessed. Only buildings this project has actually
 * furnished have an entry; every other built building has nowhere to
 * "look inside" yet, the same precedent as `clocktower` having no
 * outdoor sprite rather than a misrepresented one.
 */
export const INTERIOR_LAYOUTS: Partial<Record<BuildingId, readonly InteriorItem[]>> = {
  cottage: [
    { sprite: BED, x: 0, y: 0 },
    { sprite: NIGHTSTAND, x: 2, y: 0 },
    { sprite: WARDROBE, x: 3, y: 0 },
    { sprite: RUG_SMALL, x: 0, y: 3 },
    { sprite: PLANT, x: 5, y: 1 },
  ],
  'town-hall': [
    { sprite: RUG_BIG, x: 0, y: 0 },
    { sprite: TABLE, x: 4, y: 0 },
    { sprite: CHAIR, x: 4, y: 2 },
    { sprite: BOOKSHELF, x: 4, y: 3 },
    { sprite: PLANT, x: 0, y: 3 },
  ],
};
