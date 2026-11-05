import {
  BACK_WALL,
  INTERIOR_LAYOUTS,
  kindOfFurniture,
  PICTURE,
  TILE_PX,
  WINDOW,
  type BuildingId,
  type FurnitureKind,
  type SpriteFrame,
} from '@ai-village/content';

export interface DrawnFurniture {
  sprite: SpriteFrame;
  kind: FurnitureKind | undefined;
  /** Room pixel coordinates of the sprite's top-left corner. */
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One room, laid out in its own pixels (spec section 10's picked interior
 * sprites): a pale wall top all round, a back wall with windows and a
 * picture, a floorboard floor with the furniture on it, and a gap in the
 * front wall for the door.
 */
export interface InteriorDrawPlan {
  /** The whole room, outer walls included. */
  width: number;
  height: number;
  /** How thick the pale wall top round the room is. */
  border: number;
  /** The back wall, filled with `BACK_WALL` repeated sideways. */
  wall: Rect;
  /** Windows and a picture on the back wall. */
  wallDecor: readonly { sprite: SpriteFrame; x: number; y: number }[];
  /** The floor, filled with `FLOORBOARDS`. */
  floor: Rect;
  /** The doorway: a gap in the front wall, at the middle. */
  door: Rect;
  furniture: readonly DrawnFurniture[];
  /** Where people inside stand, nearest the middle first: the open floor in front of the furniture. */
  standingSpots: readonly { x: number; y: number }[];
}

/** How thick the room's surrounding wall top is, as on the sheet's sample rooms. */
const BORDER_PX = 6;
/** The narrowest a room is, so even a small hut has room for a window and a picture. */
const MIN_FLOOR_WIDTH = 8 * TILE_PX;
/** Open floor in front of the furniture, for people and the doorway. */
const FRONT_ROWS = 3;
const DOOR_WIDTH = 24;
const PERSON_PX = 16;
/** People stand this far apart, side by side. */
const PERSON_SPACING = 20;

function roundUpToTile(px: number): number {
  return Math.ceil(px / TILE_PX) * TILE_PX;
}

/**
 * Lays out one building's room around its furniture (`INTERIOR_LAYOUTS`).
 * The floor is the furniture's own extent plus a tile either side, never
 * narrower than `MIN_FLOOR_WIDTH`, with open rows at the front for people.
 * Undefined for a building nobody has furnished yet.
 */
export function planInteriorDraw(buildingId: BuildingId): InteriorDrawPlan | undefined {
  const layout = INTERIOR_LAYOUTS[buildingId];
  if (!layout) {
    return undefined;
  }

  const items = layout.map((item) => ({
    sprite: item.sprite,
    kind: kindOfFurniture(item.sprite),
    x: item.x * TILE_PX,
    y: item.y * TILE_PX,
  }));
  const contentWidth = Math.max(...items.map((item) => item.x + item.sprite.width));
  const contentHeight = Math.max(...items.map((item) => item.y + item.sprite.height));

  const floorWidth = Math.max(MIN_FLOOR_WIDTH, roundUpToTile(contentWidth + 2 * TILE_PX));
  const floorHeight = roundUpToTile(contentHeight) + FRONT_ROWS * TILE_PX;
  const wall: Rect = { x: BORDER_PX, y: BORDER_PX, width: floorWidth, height: BACK_WALL.height };
  const floor: Rect = {
    x: BORDER_PX,
    y: wall.y + wall.height,
    width: floorWidth,
    height: floorHeight,
  };
  const width = floorWidth + 2 * BORDER_PX;
  const height = floor.y + floorHeight + BORDER_PX;

  // The furniture sits against the back wall, centred across the room.
  const offsetX = floor.x + Math.floor((floorWidth - contentWidth) / 2 / TILE_PX) * TILE_PX;
  const furniture = items.map((item) => ({ ...item, x: item.x + offsetX, y: item.y + floor.y }));

  const middle = floor.x + Math.floor(floorWidth / 2);
  const windowY = wall.y + 4;
  const wallDecor = [
    { sprite: WINDOW, x: floor.x + TILE_PX, y: windowY },
    { sprite: PICTURE, x: middle - PICTURE.width / 2, y: wall.y + 5 },
    { sprite: WINDOW, x: floor.x + floorWidth - TILE_PX - WINDOW.width, y: windowY },
  ];

  const door: Rect = {
    x: middle - DOOR_WIDTH / 2,
    y: floor.y + floorHeight,
    width: DOOR_WIDTH,
    height: BORDER_PX,
  };

  // One row of places across the open floor, from the middle outwards.
  const standY = floor.y + roundUpToTile(contentHeight) + Math.floor(TILE_PX / 2);
  const standingSpots: { x: number; y: number }[] = [];
  const across = Math.floor((floorWidth - TILE_PX) / PERSON_SPACING);
  for (let i = 0; i < across; i++) {
    const step = Math.ceil(i / 2) * (i % 2 === 1 ? -1 : 1);
    const x = middle - PERSON_PX / 2 + step * PERSON_SPACING;
    if (x >= floor.x && x + PERSON_PX <= floor.x + floorWidth) {
      standingSpots.push({ x, y: standY });
    }
  }

  return {
    width,
    height,
    border: BORDER_PX,
    wall,
    wallDecor,
    floor,
    door,
    furniture,
    standingSpots,
  };
}

/** Which built buildings can actually be looked inside right now. */
export function buildingsWithInteriors(builtBuildingIds: readonly string[]): readonly BuildingId[] {
  const seen = new Set<BuildingId>();
  const result: BuildingId[] = [];
  for (const id of builtBuildingIds) {
    if (seen.has(id as BuildingId) || !INTERIOR_LAYOUTS[id as BuildingId]) {
      continue;
    }
    seen.add(id as BuildingId);
    result.push(id as BuildingId);
  }
  return result;
}

/**
 * The biggest whole zoom (spec section 10: integer scaling only) at which
 * the room fits the screen with some space to spare, between 2x and 6x.
 */
export function roomZoom(
  plan: InteriorDrawPlan,
  screenWidth: number,
  screenHeight: number,
): number {
  const fit = Math.floor(
    Math.min((screenWidth * 0.8) / plan.width, (screenHeight * 0.7) / plan.height),
  );
  return Math.min(6, Math.max(2, fit));
}
