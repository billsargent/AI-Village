import {
  BUILDING_SPRITES,
  decorFor,
  getBuilding,
  getPlot,
  groundTiles,
  MAPS,
  plotKey,
  positionForWorker,
  spriteForVillager,
  TILE_PX,
  type BuildingId,
  type MapId,
  type Plot,
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
  return workersAtPlots(data, map).map(({ villager, plot }) => ({
    villager,
    x: plot.x,
    y: plot.y,
  }));
}

function workersAtPlots(data: VillageFacts, map: MapId): { villager: VillagerFact; plot: Plot }[] {
  const slotByWorksAt = new Map<string, number>();
  const placed: { villager: VillagerFact; plot: Plot }[] = [];
  for (const villager of data.villagers) {
    const first = positionForWorker(villager.tradeId, data.builtBuildingIds, data.phase);
    if (!first) {
      continue;
    }
    const slot = slotByWorksAt.get(first.buildingId) ?? 0;
    const plot = positionForWorker(villager.tradeId, data.builtBuildingIds, data.phase, slot);
    slotByWorksAt.set(first.buildingId, slot + 1);
    if (plot && plot.map === map) {
      placed.push({ villager, plot });
    }
  }
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

export interface VillagerDrawnSprite extends DrawnSprite {
  villager: VillagerFact;
}

/** Anything that stands up, drawn in order of its bottom edge so nearer things cover farther ones. */
export type StandingSprite =
  | ({ kind: 'building' } & BuildingDrawnSprite)
  | ({ kind: 'villager' } & VillagerDrawnSprite)
  | ({ kind: 'decor' } & DrawnSprite);

export interface CanvasDrawPlan {
  /** The whole map, in pixels at 1x - the camera decides how much of it is on screen. */
  width: number;
  height: number;
  /** Roads, water and bridges, over a base of tiling grass. */
  ground: readonly DrawnSprite[];
  /** Flowers and daisies lying flat on the grass. */
  groundDecor: readonly DrawnSprite[];
  /** Buildings, villagers, trees, rocks and signposts, already depth-sorted. */
  standing: readonly StandingSprite[];
  buildings: readonly BuildingDrawnSprite[];
  villagers: readonly VillagerDrawnSprite[];
}

function footprintOf(buildingId: string): readonly [number, number] {
  return getBuilding(buildingId)?.footprintTiles ?? [1, 1];
}

/**
 * Lays out everything on `map`, in map pixels: its ground, its decor, its
 * built buildings and whoever's at work. A building's sprite is smaller
 * than its plot, so it sits at the bottom-centre of the plot, facing the
 * road; whoever works there stands just outside its door.
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

  // Several workers at one plot stand side by side at its door.
  const standingAtPlot = new Map<string, number>();
  const villagers = workersAtPlots(data, map).map(({ villager, plot }) => {
    const key = `${plot.buildingId}:${plot.slot}`;
    const index = standingAtPlot.get(key) ?? 0;
    standingAtPlot.set(key, index + 1);
    const [fw, fh] = footprintOf(plot.buildingId);
    return {
      villager,
      sprite: spriteForVillager(villager.id),
      x: (plot.x + Math.floor(fw / 2) + index) * TILE_PX,
      y: (plot.y + fh) * TILE_PX,
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
    ...villagers.map((v) => ({ kind: 'villager' as const, ...v })),
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
    villagers,
  };
}
