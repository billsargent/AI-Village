/**
 * What the building card says about one building (spec section 14:
 * "Building card: keeper and workers, today's output, stock in and out,
 * condition. Button: Enter."), worked out from the facts alone.
 */
import { getBuilding, getTrade, INTERIOR_LAYOUTS, type BuildingId } from '@ai-village/content';
import type { VillagerFact, VillageFacts } from './village-api.js';
import { villagersInside } from './village-draw.js';

export interface BuildingSummary {
  buildingId: string;
  slot: number;
  /** "Town Hall", or "Cottage 2" for the second of several. */
  title: string;
  /** Whose trade works here. */
  workers: readonly VillagerFact[];
  /** How many can work here. */
  places: number;
  /** For a cottage: who lives in this one. */
  residents: readonly VillagerFact[];
  /** Who's inside right now. */
  inside: readonly VillagerFact[];
  /** Whether it has a room to go into. */
  canEnter: boolean;
}

/** "town-hall" -> "Town Hall". */
export function titleCase(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "Ada", "Ada and Ben", "Ada, Ben and Cal". */
export function namesList(villagers: readonly VillagerFact[]): string {
  const names = villagers.map((villager) => capitalise(villager.id));
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

export function buildingSummary(
  data: VillageFacts,
  buildingId: string,
  slot: number,
): BuildingSummary {
  const copies = data.builtBuildingIds.filter((id) => id === buildingId).length;
  const title = copies > 1 ? `${titleCase(buildingId)} ${slot + 1}` : titleCase(buildingId);
  const workers = data.villagers.filter(
    (villager) => getTrade(villager.tradeId)?.worksAt === buildingId,
  );
  // Homes are shared out in roster order (see `spotsFor`): villager n lives in cottage n mod count.
  const residents =
    buildingId === 'cottage' && copies > 0
      ? data.villagers.filter((_, index) => index % copies === slot)
      : [];
  return {
    buildingId,
    slot,
    title,
    workers,
    places: getBuilding(buildingId)?.workers ?? 0,
    residents,
    inside: villagersInside(data, buildingId, slot).map((occupant) => occupant.villager),
    canEnter: INTERIOR_LAYOUTS[buildingId as BuildingId] !== undefined,
  };
}

/**
 * Who's in, as the map says it on hover (spec section 15: "Lit windows at
 * night show who is home"): "Hesper and Ada are home", "Tobin is in", or
 * nothing when it's empty.
 */
export function whoIsIn(buildingId: string, inside: readonly VillagerFact[]): string | null {
  if (inside.length === 0) {
    return null;
  }
  const verb = inside.length === 1 ? 'is' : 'are';
  return `${namesList(inside)} ${verb} ${buildingId === 'cottage' ? 'home' : 'in'}`;
}
