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
export const BED_PINK = insideTileRect(2, 18, 2, 2);
export const NIGHTSTAND = insideTileRect(2, 9, 1, 2);
export const WARDROBE = insideTileRect(2, 10, 2, 2);
export const TABLE = insideTileRect(2, 12, 2, 2);
export const BOOKSHELF = insideTileRect(4, 12, 2, 2);
export const CHAIR = insideTileRect(4, 14, 1, 1);
export const RUG_SMALL = insideTileRect(4, 8, 2, 1);
export const RUG_BIG = insideTileRect(6, 11, 3, 3);
export const PLANT = insideTileRect(0, 12, 1, 1);
/** A compact wood-banded trunk, the closest match on the sheet to spec section 9's "treasury chest". */
export const CHEST = insideTileRect(1, 16, 1, 1);

/**
 * What a picked furniture sprite actually is, independent of which
 * building places it or where - spec section 9 ties real features to
 * specific furniture by this same kind of name ("the bookshelf", "the
 * desk"), not to a building+position pair.
 */
export type FurnitureKind =
  'bed' | 'nightstand' | 'wardrobe' | 'table' | 'bookshelf' | 'chair' | 'rug' | 'plant' | 'chest';

const KIND_BY_SPRITE = new Map<SpriteFrame, FurnitureKind>([
  [BED, 'bed'],
  [BED_PINK, 'bed'],
  [NIGHTSTAND, 'nightstand'],
  [WARDROBE, 'wardrobe'],
  [TABLE, 'table'],
  [BOOKSHELF, 'bookshelf'],
  [CHAIR, 'chair'],
  [RUG_SMALL, 'rug'],
  [RUG_BIG, 'rug'],
  [PLANT, 'plant'],
  [CHEST, 'chest'],
]);

/** The kind of a sprite picked above, for code that cares what a piece of furniture *is*, not just how to draw it. */
export function kindOfFurniture(sprite: SpriteFrame): FurnitureKind | undefined {
  return KIND_BY_SPRITE.get(sprite);
}

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
    { sprite: CHEST, x: 6, y: 0 },
  ],
  inn: [
    { sprite: BED, x: 0, y: 0 },
    { sprite: NIGHTSTAND, x: 2, y: 0 },
    { sprite: BED_PINK, x: 3, y: 0 },
    { sprite: RUG_SMALL, x: 0, y: 3 },
    { sprite: PLANT, x: 5, y: 1 },
  ],
  school: [
    { sprite: BOOKSHELF, x: 0, y: 0 },
    { sprite: TABLE, x: 3, y: 0 },
    { sprite: CHAIR, x: 3, y: 2 },
    { sprite: TABLE, x: 6, y: 0 },
    { sprite: CHAIR, x: 6, y: 2 },
    { sprite: RUG_SMALL, x: 0, y: 3 },
  ],
  'post-office': [
    { sprite: TABLE, x: 0, y: 0 },
    { sprite: CHAIR, x: 0, y: 2 },
    { sprite: BOOKSHELF, x: 3, y: 0 },
    { sprite: PLANT, x: 3, y: 3 },
  ],
  shop: [
    { sprite: TABLE, x: 0, y: 0 },
    { sprite: BOOKSHELF, x: 3, y: 0 },
    { sprite: BOOKSHELF, x: 5, y: 0 },
    { sprite: RUG_SMALL, x: 0, y: 3 },
    { sprite: PLANT, x: 7, y: 0 },
  ],
  'forest-hut': [
    { sprite: BED, x: 0, y: 0 },
    { sprite: NIGHTSTAND, x: 2, y: 0 },
    { sprite: RUG_SMALL, x: 0, y: 3 },
    { sprite: PLANT, x: 3, y: 1 },
  ],
};
