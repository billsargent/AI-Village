/**
 * `apply(command)` (spec section 2): the agent and the owner's own UI
 * change the village only this way, one command per transaction, never by
 * poking state directly. This lives in `sim` rather than `agent` - the
 * mechanic itself (ledger movements, relationship changes, construction)
 * is sim's job, the same as the rest of the economy, and both the agent
 * and a future owner UI call the same `apply()`.
 *
 * Of the five commands spec section 2 names, two have a mechanic already
 * buildable from what the sim has (`GiveGift`, `ProposeBuilding`);
 * `AcceptOrder`, `PostOnBoard` and `CallVote` wait on sim features that
 * don't exist yet (orders, the board, villager roles) - see issues
 * #69-#71.
 */

import { getBuilding, getGood } from '@ai-village/content';
import { calendarDateFromMinute } from './calendar.js';
import { appendChronicle } from './chronicle.js';
import { MARKET_ACCOUNT, recordMovement } from './ledger.js';
import { applyGift } from './relationships.js';
import type { VillageState } from './systems.js';

export type Command =
  | { kind: 'GiveGift'; from: string; to: string; item: string; qty: number }
  | { kind: 'ProposeBuilding'; buildingId: string };

export type DomainEvent =
  | { kind: 'GiftGiven'; from: string; to: string; item: string; qty: number }
  | { kind: 'BuildingFinished'; buildingId: string };

export interface CommandResult {
  state: VillageState;
  events: readonly DomainEvent[];
}

/** A command that failed validation - an unknown villager/building, insufficient stock, population too low, and so on. */
export class CommandError extends Error {}

export function apply(state: VillageState, command: Command): CommandResult {
  switch (command.kind) {
    case 'GiveGift':
      return applyGiveGift(state, command);
    case 'ProposeBuilding':
      return applyProposeBuilding(state, command);
  }
}

function applyGiveGift(
  state: VillageState,
  command: { from: string; to: string; item: string; qty: number },
): CommandResult {
  const { from, to, item, qty } = command;
  if (from === to) {
    throw new CommandError('A villager cannot give a gift to themselves');
  }
  const villagerIds = new Set(state.villagers.map((villager) => villager.villagerId));
  if (!villagerIds.has(from) || !villagerIds.has(to)) {
    throw new CommandError(`Unknown villager in gift: "${from}" -> "${to}"`);
  }
  if (!getGood(item)) {
    throw new CommandError(`Unknown good "${item}"`);
  }

  const ledger = recordMovement(state.ledger, {
    minute: state.clock.minute,
    from: `villager:${from}`,
    to: `villager:${to}`,
    item,
    qty,
    reason: 'gift',
  });

  const day = calendarDateFromMinute(state.clock.minute).absoluteDay;
  const relationships = applyGift(state.relationships, from, to, day, state.villageSeed);

  const chronicle = appendChronicle(state.chronicle, {
    minute: state.clock.minute,
    kind: 'gift',
    text: `${from} gave ${to} ${qty} ${item}.`,
    actors: [from, to],
    importance: 2,
    public: true,
  });

  return {
    state: { ...state, ledger, relationships, chronicle },
    events: [{ kind: 'GiftGiven', from, to, item, qty }],
  };
}

function applyProposeBuilding(state: VillageState, command: { buildingId: string }): CommandResult {
  const building = getBuilding(command.buildingId);
  if (!building) {
    throw new CommandError(`Unknown building "${command.buildingId}"`);
  }
  if (!building.multiInstance && state.builtBuildingIds.includes(building.id)) {
    throw new CommandError(`"${building.id}" is already built`);
  }
  if (
    building.unlocksAtPopulation !== null &&
    state.villagers.length < building.unlocksAtPopulation
  ) {
    throw new CommandError(
      `"${building.id}" needs a population of ${building.unlocksAtPopulation}, the village has ${state.villagers.length}`,
    );
  }

  let ledger = state.ledger;
  if (building.cost.coins > 0) {
    ledger = recordMovement(ledger, {
      minute: state.clock.minute,
      from: 'treasury',
      to: MARKET_ACCOUNT,
      item: 'coins',
      qty: building.cost.coins,
      reason: `building ${building.id}`,
    });
  }
  for (const material of building.cost.materials) {
    ledger = recordMovement(ledger, {
      minute: state.clock.minute,
      from: 'village',
      to: 'spoiled',
      item: material.good,
      qty: material.qty,
      reason: `building ${building.id}`,
    });
  }

  // Not yet modeled: multi-day construction (buildDays) and the owner/
  // vote/Mayor approval routing from Settings (spec section 6). The
  // building completes immediately on a successful command, the same
  // way the work system simplifies the full schedule system until a real
  // one lands.
  const chronicle = appendChronicle(state.chronicle, {
    minute: state.clock.minute,
    kind: 'building',
    text: `The village built the ${building.id}.`,
    actors: [],
    importance: 4,
    public: true,
  });

  return {
    state: {
      ...state,
      ledger,
      builtBuildingIds: [...state.builtBuildingIds, building.id],
      chronicle,
    },
    events: [{ kind: 'BuildingFinished', buildingId: building.id }],
  };
}
