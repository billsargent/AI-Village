import {
  BUILDING_SPRITES,
  getPlot,
  MAPS,
  positionForWorker,
  spriteForVillager,
  TILE_PX,
  type BuildingId,
  type MapId,
  type SpriteFrame,
} from '@ai-village/content';
import type { VillagerFact, VillageFacts } from './village-api.js';

export interface PlacedVillager {
  villager: VillagerFact;
  /** Tile coordinates (spec section 8), not pixels. */
  x: number;
  y: number;
}

/**
 * Who's currently placed at their built workplace, per `positionForWorker`
 * (spec section 8's plot layout). Each trade's workers fill that
 * workplace's plots in order, so two farmers at a one-field village both
 * show at the same plot - there's no per-villager instance assignment
 * yet, so this never guesses which exact field is "theirs".
 *
 * Only places a villager whose workplace is on `map` - the main,
 * Riverside and Forest maps each have their own separate tile grid (spec
 * section 8), so a worker's plot coordinates only mean something on the
 * one map they're actually on.
 */
export function whereaboutsNow(data: VillageFacts, map: MapId = 'main'): readonly PlacedVillager[] {
  const slotByWorksAt = new Map<string, number>();
  const whereabouts: PlacedVillager[] = [];
  for (const villager of data.villagers) {
    const plot = positionForWorker(villager.tradeId, data.builtBuildingIds, data.phase);
    if (!plot) {
      continue;
    }
    const slot = slotByWorksAt.get(plot.buildingId) ?? 0;
    const placed = positionForWorker(villager.tradeId, data.builtBuildingIds, data.phase, slot);
    slotByWorksAt.set(plot.buildingId, slot + 1);
    if (placed && placed.map === map) {
      whereabouts.push({ villager, x: placed.x, y: placed.y });
    }
  }
  return whereabouts;
}

export interface PlacedBuilding {
  buildingId: string;
  sprite: SpriteFrame;
  /** Tile coordinates of the plot's top-left corner (spec section 8). */
  x: number;
  y: number;
}

/**
 * Every built building this project has picked a sprite for yet, at its
 * plot position on `map`. A building with no `BUILDING_SPRITES` entry is
 * skipped - never stood in for with a placeholder box. A building whose
 * fixed plot (spec section 8) is on a different map is skipped too - its
 * coordinates only mean something on that map.
 */
export function builtBuildingsNow(
  data: VillageFacts,
  map: MapId = 'main',
): readonly PlacedBuilding[] {
  const slotByBuildingId = new Map<string, number>();
  const placed: PlacedBuilding[] = [];
  for (const buildingId of data.builtBuildingIds) {
    const slot = slotByBuildingId.get(buildingId) ?? 0;
    slotByBuildingId.set(buildingId, slot + 1);
    const sprite = BUILDING_SPRITES[buildingId as BuildingId];
    if (!sprite) {
      continue;
    }
    const plot = getPlot(buildingId as BuildingId, slot);
    if (!plot || plot.map !== map) {
      continue;
    }
    placed.push({ buildingId, sprite, x: plot.x, y: plot.y });
  }
  return placed;
}

export interface DrawnSprite {
  sprite: SpriteFrame;
  /** Canvas pixel coordinates, already camera-adjusted. */
  x: number;
  y: number;
}

export interface VillagerDrawnSprite {
  villager: VillagerFact;
  sprite: SpriteFrame;
  x: number;
  y: number;
}

export interface CanvasDrawPlan {
  width: number;
  height: number;
  buildings: readonly DrawnSprite[];
  villagers: readonly VillagerDrawnSprite[];
}

const MARGIN_PX = TILE_PX * 2;

/**
 * Lays out this frame's buildings and villagers on `map` in canvas pixel
 * space, a simple single-screen "camera" that fits everything currently
 * drawn there (plus a margin) rather than a scrollable map - the real
 * map/camera is later work once there's a real Tiled map to scroll
 * around in.
 */
export function planCanvasDraw(data: VillageFacts, map: MapId = 'main'): CanvasDrawPlan {
  const buildings = builtBuildingsNow(data, map).map((building) => ({
    sprite: building.sprite,
    x: building.x * TILE_PX,
    y: building.y * TILE_PX,
  }));
  const villagers = whereaboutsNow(data, map).map(({ villager, x, y }) => ({
    villager,
    sprite: spriteForVillager(villager.id),
    x: x * TILE_PX,
    y: y * TILE_PX,
  }));

  const boxes = [
    ...buildings.map((b) => ({ x: b.x, y: b.y, width: b.sprite.width, height: b.sprite.height })),
    ...villagers.map((v) => ({ x: v.x, y: v.y, width: v.sprite.width, height: v.sprite.height })),
  ];

  if (boxes.length === 0) {
    // Nothing built or staffed here yet - still a real, correctly-sized
    // patch of this map (spec section 8's own dimensions), not an
    // arbitrary placeholder box.
    const dimensions = MAPS[map];
    return {
      width: dimensions.widthTiles * TILE_PX,
      height: dimensions.heightTiles * TILE_PX,
      buildings: [],
      villagers: [],
    };
  }

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  const offsetX = MARGIN_PX - minX;
  const offsetY = MARGIN_PX - minY;

  return {
    width: maxX - minX + MARGIN_PX * 2,
    height: maxY - minY + MARGIN_PX * 2,
    buildings: buildings.map((b) => ({ ...b, x: b.x + offsetX, y: b.y + offsetY })),
    villagers: villagers.map((v) => ({ ...v, x: v.x + offsetX, y: v.y + offsetY })),
  };
}
