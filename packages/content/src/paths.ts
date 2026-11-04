/**
 * Spec section 7: "Paths come from A* on the map's walk grid." The walk
 * grid is the map's tiles: water and the walls of every built building
 * are off limits, footbridges and open-air plots (fields, the jetty) are
 * walkable. Roads cost less than grass, so villagers keep to the roads
 * the way people do.
 */

import { getBuilding, type BuildingId } from './buildings.js';
import { getPlot, type MapId } from './layout.js';
import { bridgesOnMap, groundGrid } from './terrain.js';
import { OPEN_AIR_BUILDINGS } from './whereabouts.js';

export interface Tile {
  x: number;
  y: number;
}

/** `grid[y][x]`: the cost of stepping onto a tile, or 0 if it can't be walked on. */
export type WalkGrid = readonly (readonly number[])[];

const ROAD_COST = 1;
const GRASS_COST = 3;

/** The walk grid for `map` with `builtBuildingIds` standing on it. */
export function walkGrid(map: MapId, builtBuildingIds: readonly string[]): WalkGrid {
  const grid: number[][] = groundGrid(map).map((row) =>
    row.map((ground) => (ground === 'water' ? 0 : ground === 'dirt' ? ROAD_COST : GRASS_COST)),
  );
  const set = (x: number, y: number, cost: number) => {
    const row = grid[y];
    if (row && x >= 0 && x < row.length) {
      row[x] = cost;
    }
  };

  for (const bridge of bridgesOnMap(map)) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        set(bridge.x + dx, bridge.y + dy, ROAD_COST);
      }
    }
  }

  const slots = new Map<string, number>();
  for (const buildingId of builtBuildingIds) {
    const slot = slots.get(buildingId) ?? 0;
    slots.set(buildingId, slot + 1);
    const plot = getPlot(buildingId as BuildingId, slot);
    const building = getBuilding(buildingId);
    if (!plot || plot.map !== map || !building) {
      continue;
    }
    const [width, height] = building.footprintTiles;
    const cost = OPEN_AIR_BUILDINGS.has(buildingId) ? GRASS_COST : 0;
    for (let y = plot.y; y < plot.y + height; y++) {
      for (let x = plot.x; x < plot.x + width; x++) {
        set(x, y, cost);
      }
    }
  }
  return grid;
}

/** A small binary min-heap of [priority, index] pairs, for A*'s open set. */
class MinHeap {
  private readonly items: [number, number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(priority: number, value: number): void {
    const items = this.items;
    items.push([priority, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const a = items[parent];
      const b = items[i];
      if (!a || !b || a[0] <= b[0]) {
        break;
      }
      items[parent] = b;
      items[i] = a;
      i = parent;
    }
  }

  pop(): number | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (!top || !last) {
      return undefined;
    }
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        const at = (k: number) => items[k]?.[0] ?? Number.POSITIVE_INFINITY;
        if (at(left) < at(smallest)) {
          smallest = left;
        }
        if (at(right) < at(smallest)) {
          smallest = right;
        }
        if (smallest === i) {
          break;
        }
        const a = items[i];
        const b = items[smallest];
        if (!a || !b) {
          break;
        }
        items[i] = b;
        items[smallest] = a;
        i = smallest;
      }
    }
    return top[1];
  }
}

const STEPS: readonly Tile[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * The cheapest 4-way path from `from` to `to`, both ends included, or
 * null if there's none. The two ends may be on tiles that can't be walked
 * (a doorstep against a wall, say) - only the tiles between must be.
 */
export function findPath(grid: WalkGrid, from: Tile, to: Tile): Tile[] | null {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const inside = (t: Tile) => t.x >= 0 && t.y >= 0 && t.x < width && t.y < height;
  if (!inside(from) || !inside(to)) {
    return null;
  }
  if (from.x === to.x && from.y === to.y) {
    return [{ ...from }];
  }

  const index = (t: Tile) => t.y * width + t.x;
  const goal = index(to);
  const cost = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(width * height).fill(-1);
  const open = new MinHeap();
  const heuristic = (x: number, y: number) => (Math.abs(x - to.x) + Math.abs(y - to.y)) * ROAD_COST;

  cost[index(from)] = 0;
  open.push(heuristic(from.x, from.y), index(from));

  while (open.size > 0) {
    const current = open.pop();
    if (current === undefined) {
      break;
    }
    if (current === goal) {
      const path: Tile[] = [];
      for (let at = goal; at !== -1; at = cameFrom[at] ?? -1) {
        path.push({ x: at % width, y: Math.floor(at / width) });
      }
      return path.reverse();
    }
    const cx = current % width;
    const cy = Math.floor(current / width);
    const here = cost[current] ?? Number.POSITIVE_INFINITY;
    for (const step of STEPS) {
      const nx = cx + step.x;
      const ny = cy + step.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const next = ny * width + nx;
      // The goal can be entered even if it's not walkable (a door against a wall).
      const stepCost = next === goal ? ROAD_COST : (grid[ny]?.[nx] ?? 0);
      if (stepCost === 0) {
        continue;
      }
      const total = here + stepCost;
      if (total < (cost[next] ?? Number.POSITIVE_INFINITY)) {
        cost[next] = total;
        cameFrom[next] = current;
        open.push(total + heuristic(nx, ny), next);
      }
    }
  }
  return null;
}
