import {
  INTERIOR_LAYOUTS,
  kindOfFurniture,
  TILE_PX,
  type BuildingId,
  type FurnitureKind,
  type SpriteFrame,
} from '@ai-village/content';

export interface DrawnFurniture {
  sprite: SpriteFrame;
  kind: FurnitureKind | undefined;
  /** Canvas pixel coordinates, already margin-adjusted. */
  x: number;
  y: number;
}

export interface InteriorDrawPlan {
  width: number;
  height: number;
  furniture: readonly DrawnFurniture[];
}

const MARGIN_PX = TILE_PX;

/**
 * Lays out one building's furniture (spec section 10's picked interior
 * sprites) in canvas pixel space, fit to whatever's actually placed
 * there plus a margin - the same simple single-screen "camera" the
 * outdoor view uses (`planCanvasDraw`), since an interior scene is its
 * own small self-contained room, not part of the outdoor map grid.
 */
export function planInteriorDraw(buildingId: BuildingId): InteriorDrawPlan | undefined {
  const layout = INTERIOR_LAYOUTS[buildingId];
  if (!layout) {
    return undefined;
  }

  const furniture = layout.map((item) => ({
    sprite: item.sprite,
    kind: kindOfFurniture(item.sprite),
    x: item.x * TILE_PX,
    y: item.y * TILE_PX,
  }));

  const maxX = Math.max(...furniture.map((f) => f.x + f.sprite.width));
  const maxY = Math.max(...furniture.map((f) => f.y + f.sprite.height));

  return {
    width: maxX + MARGIN_PX * 2,
    height: maxY + MARGIN_PX * 2,
    furniture: furniture.map((f) => ({ ...f, x: f.x + MARGIN_PX, y: f.y + MARGIN_PX })),
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
