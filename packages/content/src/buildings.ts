import { z } from 'zod';
import { goodQuantitySchema, TRADES } from './trades.js';

export const buildingCostSchema = z.object({
  coins: z.number().nonnegative(),
  materials: z.array(goodQuantitySchema).default([]),
});
export type BuildingCost = z.infer<typeof buildingCostSchema>;

export const buildingSchema = z.object({
  id: z.string(),
  footprintTiles: z.tuple([z.number().positive(), z.number().positive()]),
  cost: buildingCostSchema,
  buildDays: z.number().nonnegative(),
  workers: z.number().nonnegative(),
  /** Population count that unlocks this building, or null if it exists from the start. */
  unlocksAtPopulation: z.number().positive().nullable(),
  /** Whether the village can have more than one (spec's facts-block example: "fields x4"; homes are numbered "Cottage 3"). Most buildings are one-of-a-kind. */
  multiInstance: z.boolean(),
});
export type Building = z.infer<typeof buildingSchema>;

/** Version 1 buildings table (spec section 6). */
export const BUILDINGS = [
  {
    id: 'town-hall',
    footprintTiles: [9, 7],
    cost: { coins: 0, materials: [] },
    buildDays: 0,
    workers: 1,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
  {
    id: 'inn',
    footprintTiles: [9, 7],
    cost: { coins: 0, materials: [] },
    buildDays: 0,
    workers: 2,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
  {
    id: 'fields',
    footprintTiles: [8, 6],
    cost: { coins: 10, materials: [] },
    buildDays: 1,
    workers: 2,
    unlocksAtPopulation: null,
    multiInstance: true,
  },
  {
    id: 'workshop',
    footprintTiles: [7, 6],
    cost: { coins: 50, materials: [{ good: 'logs', qty: 10 }] },
    buildDays: 2,
    workers: 1,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
  {
    id: 'cottage',
    footprintTiles: [5, 5],
    cost: { coins: 40, materials: [{ good: 'planks', qty: 20 }] },
    buildDays: 2,
    workers: 0,
    unlocksAtPopulation: null,
    multiInstance: true,
  },
  {
    id: 'bakery',
    footprintTiles: [7, 6],
    cost: { coins: 80, materials: [{ good: 'planks', qty: 30 }] },
    buildDays: 3,
    workers: 1,
    unlocksAtPopulation: 4,
    multiInstance: false,
  },
  {
    id: 'post-office',
    footprintTiles: [7, 6],
    cost: { coins: 60, materials: [{ good: 'planks', qty: 20 }] },
    buildDays: 2,
    workers: 1,
    unlocksAtPopulation: 5,
    multiInstance: false,
  },
  {
    id: 'shop',
    footprintTiles: [7, 6],
    cost: { coins: 80, materials: [{ good: 'planks', qty: 30 }] },
    buildDays: 3,
    workers: 1,
    unlocksAtPopulation: 5,
    multiInstance: false,
  },
  {
    id: 'mill',
    footprintTiles: [6, 7],
    cost: {
      coins: 100,
      materials: [
        { good: 'planks', qty: 40 },
        { good: 'stone', qty: 10 },
      ],
    },
    buildDays: 4,
    workers: 1,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
  {
    id: 'forest-hut',
    footprintTiles: [5, 5],
    cost: { coins: 30, materials: [] },
    buildDays: 1,
    workers: 1,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
  {
    id: 'smokehouse',
    footprintTiles: [5, 5],
    cost: { coins: 40, materials: [{ good: 'planks', qty: 10 }] },
    buildDays: 2,
    workers: 0,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
  {
    id: 'smithy',
    footprintTiles: [7, 6],
    cost: { coins: 120, materials: [{ good: 'stone', qty: 20 }] },
    buildDays: 4,
    workers: 1,
    unlocksAtPopulation: 7,
    multiInstance: false,
  },
  {
    id: 'school',
    footprintTiles: [9, 7],
    cost: { coins: 150, materials: [{ good: 'planks', qty: 40 }] },
    buildDays: 5,
    workers: 1,
    unlocksAtPopulation: 8,
    multiInstance: false,
  },
  {
    id: 'chapel',
    footprintTiles: [7, 9],
    cost: { coins: 150, materials: [{ good: 'stone', qty: 40 }] },
    buildDays: 5,
    workers: 0,
    unlocksAtPopulation: 8,
    multiInstance: false,
  },
  {
    id: 'clocktower',
    footprintTiles: [3, 5],
    cost: { coins: 200, materials: [{ good: 'stone', qty: 30 }] },
    buildDays: 6,
    workers: 0,
    unlocksAtPopulation: 10,
    multiInstance: false,
  },
  {
    id: 'riverside-jetty',
    footprintTiles: [5, 5],
    cost: { coins: 0, materials: [] },
    buildDays: 0,
    workers: 1,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
  {
    id: 'gardens',
    footprintTiles: [5, 5],
    cost: { coins: 20, materials: [] },
    buildDays: 1,
    workers: 1,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
  {
    id: 'cottage-garden',
    footprintTiles: [5, 5],
    cost: { coins: 20, materials: [] },
    buildDays: 1,
    workers: 1,
    unlocksAtPopulation: null,
    multiInstance: false,
  },
] as const satisfies readonly Building[];

export const buildingsTableSchema = z.array(buildingSchema);
buildingsTableSchema.parse(BUILDINGS);

const BUILDING_IDS = new Set<string>(BUILDINGS.map((building) => building.id));

for (const trade of TRADES) {
  if (!BUILDING_IDS.has(trade.worksAt)) {
    throw new Error(`Trade "${trade.id}" works at unknown building "${trade.worksAt}"`);
  }
}

export type BuildingId = (typeof BUILDINGS)[number]['id'];

const BUILDINGS_BY_ID = new Map<string, Building>(
  BUILDINGS.map((building) => [building.id, building]),
);

export function getBuilding(id: string): Building | undefined {
  return BUILDINGS_BY_ID.get(id);
}
