import {
  BUILDING_SPRITES,
  decorFor,
  getBuilding,
  getPlot,
  groundTiles,
  MAPS,
  plotKey,
  spotSeenFrom,
  spotsFor,
  spriteForVillager,
  TILE_PX,
  type BuildingId,
  type MapId,
  type SpriteFrame,
  type Spot,
} from '@ai-village/content';
import type { VillagerFact, VillageFacts } from './village-api.js';

/** Where one villager is right now, for the journal: "Ada is on the green". */
export interface Whereabouts {
  villager: VillagerFact;
  where: string;
}

function spotsNow(data: VillageFacts): readonly Spot[] {
  return spotsFor(
    data.villagers.map((villager) => ({ id: villager.id, tradeId: villager.tradeId })),
    data.builtBuildingIds,
    data.phase,
  );
}

/** Where everyone is (spec section 7's day shape), whichever map they're on. */
export function whereaboutsNow(data: VillageFacts): readonly Whereabouts[] {
  const spots = spotsNow(data);
  return data.villagers.map((villager, index) => ({
    villager,
    where: spots[index]?.where ?? 'about the village',
  }));
}

/** One villager as the map draws them: their sprite, and the tile they're at as seen from this map. */
export interface VillagerPlacement {
  villager: VillagerFact;
  sprite: SpriteFrame;
  /** Tile coordinates on the map being drawn. */
  x: number;
  y: number;
  /** Out of sight: inside a building (at its door), or off by a signpost to another map. */
  hidden: boolean;
  where: string;
}

/**
 * Everyone who belongs on `map` right now, or has just left it: someone
 * at work on the riverside shows on the main map as gone by the
 * riverside signpost, so they can be seen walking off there.
 */
export function villagersOnMap(
  data: VillageFacts,
  map: MapId = 'main',
): readonly VillagerPlacement[] {
  const spots = spotsNow(data);
  const placed: VillagerPlacement[] = [];
  data.villagers.forEach((villager, index) => {
    const spot = spots[index];
    const seen = spot ? spotSeenFrom(spot, map) : null;
    if (!seen) {
      return;
    }
    placed.push({
      villager,
      sprite: spriteForVillager(villager.id),
      x: seen.x,
      y: seen.y,
      hidden: seen.inside !== undefined,
      where: seen.where,
    });
  });
  return placed;
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
  /** Map pixel coordinates (tile x 16) of the sprite's top-left corner. */
  x: number;
  y: number;
}

export interface BuildingDrawnSprite extends DrawnSprite {
  buildingId: string;
}

/** Anything that stands up, drawn in order of its bottom edge so nearer things cover farther ones. */
export type StandingSprite =
  ({ kind: 'building' } & BuildingDrawnSprite) | ({ kind: 'decor' } & DrawnSprite);

export interface CanvasDrawPlan {
  /** The whole map, in pixels at 1x - the camera decides how much of it is on screen. */
  width: number;
  height: number;
  /** Roads, water and bridges, over a base of tiling grass. */
  ground: readonly DrawnSprite[];
  /** Flowers and daisies lying flat on the grass. */
  groundDecor: readonly DrawnSprite[];
  /**
   * Buildings, trees, rocks and signposts, already depth-sorted. Villagers
   * aren't here: they walk, so the canvas keeps them on their own (see
   * `villagersOnMap`), sorted in among these by the same bottom-edge rule.
   */
  standing: readonly StandingSprite[];
  buildings: readonly BuildingDrawnSprite[];
}

function footprintOf(buildingId: string): readonly [number, number] {
  return getBuilding(buildingId)?.footprintTiles ?? [1, 1];
}

/**
 * Lays out everything on `map`, in map pixels: its ground, its decor, its
 * built buildings. A building's sprite is smaller than its plot, so it
 * sits at the bottom-centre of the plot, facing the road.
 */
export function planCanvasDraw(data: VillageFacts, map: MapId = 'main'): CanvasDrawPlan {
  const { widthTiles, heightTiles } = MAPS[map];

  const buildings = builtBuildingsNow(data, map).map((building) => {
    const [fw, fh] = footprintOf(building.buildingId);
    const plotX = building.x * TILE_PX;
    const plotY = building.y * TILE_PX;
    return {
      buildingId: building.buildingId,
      sprite: building.sprite,
      x: plotX + Math.floor((fw * TILE_PX - building.sprite.width) / 2 / TILE_PX) * TILE_PX,
      y: plotY + fh * TILE_PX - building.sprite.height,
    };
  });

  const toPx = (item: { sprite: SpriteFrame; x: number; y: number }): DrawnSprite => ({
    sprite: item.sprite,
    x: item.x * TILE_PX,
    y: item.y * TILE_PX,
  });
  // Scrub on a plot is cleared once that plot is built - even for a
  // building with no sprite yet, whose land is still in use.
  const builtPlots = new Set<string>();
  const slots = new Map<string, number>();
  for (const buildingId of data.builtBuildingIds) {
    const slot = slots.get(buildingId) ?? 0;
    slots.set(buildingId, slot + 1);
    builtPlots.add(plotKey(buildingId, slot));
  }
  const decor = decorFor(map).filter((item) => !item.plot || !builtPlots.has(item.plot));

  const standing: StandingSprite[] = [
    ...buildings.map((b) => ({ kind: 'building' as const, ...b })),
    ...decor
      .filter((d) => d.layer === 'object')
      .map((d) => ({ kind: 'decor' as const, ...toPx(d) })),
  ].sort((a, b) => a.y + a.sprite.height - (b.y + b.sprite.height));

  return {
    width: widthTiles * TILE_PX,
    height: heightTiles * TILE_PX,
    ground: groundTiles(map).map(toPx),
    groundDecor: decor.filter((d) => d.layer === 'ground').map(toPx),
    standing,
    buildings,
  };
}
