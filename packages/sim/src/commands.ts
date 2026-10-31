/**
 * `apply(command)` (spec section 2): the agent and the owner's own UI
 * change the village only this way, one command per transaction, never by
 * poking state directly. This lives in `sim` rather than `agent` - the
 * mechanic itself (ledger movements, relationship changes, construction)
 * is sim's job, the same as the rest of the economy, and both the agent
 * and a future owner UI call the same `apply()`.
 *
 * All five commands spec section 2 names now have a mechanic buildable
 * from what the sim has. `CallVote` is a generic "ask the village and
 * tally" mechanic (see `applyCallVote` below for what that deliberately
 * leaves out, like trait/affinity-weighted voting).
 */

import { getBuilding, getGood } from '@ai-village/content';
import { postToBoard } from './board.js';
import { calendarDateFromMinute } from './calendar.js';
import { appendChronicle } from './chronicle.js';
import { MARKET_ACCOUNT, recordMovement } from './ledger.js';
import type { OrderStatus } from './orders.js';
import { seededRandom, weightedPick } from './random.js';
import { applyGift } from './relationships.js';
import type { VillageState } from './systems.js';

export type Command =
  | { kind: 'GiveGift'; from: string; to: string; item: string; qty: number }
  | { kind: 'ProposeBuilding'; buildingId: string }
  | { kind: 'AcceptOrder'; orderId: number }
  | { kind: 'DeclineOrder'; orderId: number }
  | { kind: 'PostOnBoard'; author: string; text: string }
  | { kind: 'CallVote'; topic: string; options: readonly string[] };

export type DomainEvent =
  | { kind: 'GiftGiven'; from: string; to: string; item: string; qty: number }
  | { kind: 'BuildingFinished'; buildingId: string }
  | { kind: 'OrderAccepted'; orderId: number }
  | { kind: 'OrderDeclined'; orderId: number }
  | { kind: 'PostedOnBoard'; postId: number }
  | {
      kind: 'VoteResolved';
      topic: string;
      winner: string;
      tally: Readonly<Record<string, number>>;
    };

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
    case 'AcceptOrder':
      return applyOrderDecision(state, command.orderId, 'accepted');
    case 'DeclineOrder':
      return applyOrderDecision(state, command.orderId, 'declined');
    case 'PostOnBoard':
      return applyPostOnBoard(state, command);
    case 'CallVote':
      return applyCallVote(state, command);
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

function applyOrderDecision(
  state: VillageState,
  orderId: number,
  decision: Extract<OrderStatus, 'accepted' | 'declined'>,
): CommandResult {
  const order = state.orders.orders.find((candidate) => candidate.id === orderId);
  if (!order) {
    throw new CommandError(`Unknown order #${orderId}`);
  }
  if (order.status !== 'pending') {
    throw new CommandError(`Order #${orderId} is not pending (status: ${order.status})`);
  }

  const orders = {
    ...state.orders,
    orders: state.orders.orders.map((candidate) =>
      candidate.id === orderId ? { ...candidate, status: decision } : candidate,
    ),
  };

  const itemsText = order.items.map((item) => `${item.qty} ${item.good}`).join(', ');
  const chronicle = appendChronicle(state.chronicle, {
    minute: state.clock.minute,
    kind: 'order-decision',
    text:
      decision === 'accepted'
        ? `The Mayor accepted an order for ${itemsText}.`
        : `The Mayor declined an order for ${itemsText}.`,
    actors: [],
    importance: 2,
    public: true,
  });

  return {
    state: { ...state, orders, chronicle },
    events: [
      decision === 'accepted'
        ? { kind: 'OrderAccepted', orderId }
        : { kind: 'OrderDeclined', orderId },
    ],
  };
}

function applyPostOnBoard(
  state: VillageState,
  command: { author: string; text: string },
): CommandResult {
  const { author, text } = command;
  if (!state.villagers.some((villager) => villager.villagerId === author)) {
    throw new CommandError(`Unknown villager "${author}"`);
  }
  if (text.trim().length === 0) {
    throw new CommandError('A board post cannot be empty');
  }

  const day = calendarDateFromMinute(state.clock.minute).absoluteDay;
  const postId = state.board.nextId;
  const board = postToBoard(state.board, author, text, day);

  const chronicle = appendChronicle(state.chronicle, {
    minute: state.clock.minute,
    kind: 'board-post',
    text: `${author} posted on the board: "${text}"`,
    actors: [author],
    importance: 1,
    public: true,
  });

  return {
    state: { ...state, board, chronicle },
    events: [{ kind: 'PostedOnBoard', postId }],
  };
}

/**
 * Spec section 15's "ask the village" is the closest named vote to a
 * generic mechanic: a question with options, tallied. Building-approval
 * votes, conduct votes (weighted by trust) and elections (weighted by
 * affinity/traits) are each their own flavor the spec names but doesn't
 * unify - and none of those weights are tracked per-villager in the sim
 * yet, so every villager here casts one uniformly random vote among the
 * options, resolved immediately. No new persisted state: the chronicle
 * entry and the returned tally are the whole record.
 */
function applyCallVote(
  state: VillageState,
  command: { topic: string; options: readonly string[] },
): CommandResult {
  const { topic, options } = command;
  if (options.length < 2) {
    throw new CommandError('A vote needs at least two options');
  }
  if (new Set(options).size !== options.length) {
    throw new CommandError('A vote cannot have duplicate options');
  }
  if (state.villagers.length === 0) {
    throw new CommandError('There is nobody to vote');
  }

  const day = calendarDateFromMinute(state.clock.minute).absoluteDay;
  const tally: Record<string, number> = Object.fromEntries(options.map((option) => [option, 0]));
  for (const villager of state.villagers) {
    const rng = seededRandom({
      villageSeed: state.villageSeed,
      day,
      system: 'vote',
      entity: `${topic}::${villager.villagerId}`,
    });
    const pick = weightedPick(
      options,
      options.map(() => 1),
      rng,
    );
    tally[pick] = (tally[pick] ?? 0) + 1;
  }

  let winner = options[0] as string;
  for (const option of options) {
    if ((tally[option] ?? 0) > (tally[winner] ?? 0)) {
      winner = option;
    }
  }

  const chronicle = appendChronicle(state.chronicle, {
    minute: state.clock.minute,
    kind: 'vote',
    text: `The village voted on "${topic}": "${winner}" won with ${tally[winner]} of ${state.villagers.length} votes.`,
    actors: [],
    importance: 3,
    public: true,
  });

  return {
    state: { ...state, chronicle },
    events: [{ kind: 'VoteResolved', topic, winner, tally }],
  };
}
