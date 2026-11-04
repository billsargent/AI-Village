import {
  DEFAULT_ROLE,
  getTrade,
  HAPPENINGS,
  type HappeningCard,
  type RoleId,
} from '@ai-village/content';
import { archiveOldBoardPosts, createBoard, type BoardState } from './board.js';
import { calendarDateFromMinute, MINUTES_PER_DAY, type CalendarDate } from './calendar.js';
import { appendChronicle, type Chronicle } from './chronicle.js';
import { createClock, type ClockState } from './clock.js';
import { grantReliefIfNeeded, tryEat } from './eating.js';
import {
  createLedger,
  getBalance,
  MARKET_ACCOUNT,
  recordMovement,
  type LedgerState,
} from './ledger.js';
import { createMemoryState, type MemoryState } from './memory.js';
import {
  applyPurposeForDay,
  createNeeds,
  decayNeeds,
  MAX_NEED,
  moodFactorFromMood,
  moodFromNeeds,
  type Needs,
} from './needs.js';
import {
  createOrders,
  deliverReadyOrders,
  maybePostDownriverOrder,
  type OrdersState,
} from './orders.js';
import { createPromisesState, type PromisesState } from './promises.js';
import { runEveningInteractions, type Relationships } from './relationships.js';
import { pickHappening, type StorytellerStyle } from './storyteller.js';
import { chargeUpkeep, upkeepDue } from './upkeep.js';
import { runStint, type WorkerAssignment } from './work.js';
import { drawWeather, type WeatherDay } from './weather.js';
import { createWorkRequestQueue, type WorkRequestQueue } from './work-requests.js';

const HOURS_PER_VILLAGE_DAY = 24;
/** Spec section 6: "One stint is half a working day." */
const STINTS_PER_DAY = 2;

/**
 * The fixed order systems run in each village day (spec section 5). Work
 * runs two stints per villager, economy runs nightly upkeep, needs include
 * eating/relief, social rolls evening interactions, and happenings/the
 * chronicle run too. A real two-stint schedule (morning/afternoon, tied to
 * actual clock hours rather than a day-at-a-time loop) still lands with a
 * full schedules system; this is the stint mechanic without the clock-hour
 * placement.
 */
export const SYSTEM_ORDER = [
  'clock',
  'weather',
  'schedules',
  'needs',
  'work',
  'economy',
  'social',
  'happenings',
  'chronicle',
] as const;
export type SystemName = (typeof SYSTEM_ORDER)[number];

export interface VillageState {
  villageSeed: number;
  clock: ClockState;
  ledger: LedgerState;
  weatherHistory: readonly WeatherDay[];
  villagers: readonly WorkerAssignment[];
  villagerNeeds: Readonly<Record<string, Needs>>;
  builtBuildingIds: readonly string[];
  storytellerStyle: StorytellerStyle;
  chronicle: Chronicle;
  daysSinceLastHappening: number;
  relationships: Relationships;
  orders: OrdersState;
  board: BoardState;
  memory: MemoryState;
  promises: PromisesState;
  workRequests: WorkRequestQueue;
}

export interface StartingStock {
  account: string;
  item: string;
  qty: number;
}

export interface VillageScenario {
  /** Role defaults to `villager` when omitted. */
  villagers?: readonly (Omit<WorkerAssignment, 'role'> & { role?: RoleId })[];
  builtBuildingIds?: readonly string[];
  /** Opening stock (e.g. a starting treasury) funded from the market account. */
  startingStock?: readonly StartingStock[];
  storytellerStyle?: StorytellerStyle;
}

/** A village can have only one Mayor at a time (spec section 12: "The Mayor" is a single, named position). */
function validateRoles(villagers: readonly WorkerAssignment[]): void {
  const mayors = villagers.filter((villager) => villager.role === 'mayor');
  if (mayors.length > 1) {
    throw new Error(
      `A village can have only one Mayor, found ${mayors.length}: ${mayors.map((v) => v.villagerId).join(', ')}`,
    );
  }
}

export function createVillage(villageSeed: number, scenario: VillageScenario = {}): VillageState {
  let ledger = createLedger();
  for (const stock of scenario.startingStock ?? []) {
    ledger = recordMovement(ledger, {
      minute: 0,
      from: MARKET_ACCOUNT,
      to: stock.account,
      item: stock.item,
      qty: stock.qty,
      reason: 'opening stock',
    });
  }
  const villagers: WorkerAssignment[] = (scenario.villagers ?? []).map((villager) => ({
    ...villager,
    role: villager.role ?? DEFAULT_ROLE,
  }));
  validateRoles(villagers);
  return {
    villageSeed,
    clock: createClock(),
    ledger,
    weatherHistory: [],
    villagers,
    villagerNeeds: Object.fromEntries(villagers.map((v) => [v.villagerId, createNeeds()])),
    builtBuildingIds: scenario.builtBuildingIds ?? [],
    storytellerStyle: scenario.storytellerStyle ?? 'lively',
    chronicle: [],
    daysSinceLastHappening: 0,
    relationships: {},
    orders: createOrders(),
    board: createBoard(),
    memory: createMemoryState(),
    promises: createPromisesState(),
    workRequests: createWorkRequestQueue(),
  };
}

/** A bumper harvest adds half of today's village wheat stock as a one-off surplus; a visiting bard lifts everyone's fun for the day. Most happening cards are narrative-only for now - these two have an effect simple enough to apply directly, with no new persisted state. */
const BUMPER_HARVEST_BONUS_FRACTION = 0.5;
const VISITING_BARD_FUN_BOOST = 30;

export function applyHappeningEffect(
  happening: HappeningCard | null,
  ledger: LedgerState,
  minute: number,
  villagerNeeds: Readonly<Record<string, Needs>>,
): { ledger: LedgerState; villagerNeeds: Readonly<Record<string, Needs>> } {
  if (happening?.id === 'bumper-harvest') {
    const bonus = Math.round(
      getBalance(ledger, 'village', 'wheat') * BUMPER_HARVEST_BONUS_FRACTION,
    );
    if (bonus > 0) {
      return {
        ledger: recordMovement(ledger, {
          minute,
          from: MARKET_ACCOUNT,
          to: 'village',
          item: 'wheat',
          qty: bonus,
          reason: 'bumper harvest',
        }),
        villagerNeeds,
      };
    }
  }

  if (happening?.id === 'visiting-bard') {
    return {
      ledger,
      villagerNeeds: Object.fromEntries(
        Object.entries(villagerNeeds).map(([id, needs]) => [
          id,
          { ...needs, fun: Math.min(MAX_NEED, needs.fun + VISITING_BARD_FUN_BOOST) },
        ]),
      ),
    };
  }

  return { ledger, villagerNeeds };
}

export interface DayReport {
  day: number;
  date: CalendarDate;
  weather: WeatherDay;
  waiting: readonly string[];
  happening: HappeningCard | null;
}

/**
 * Runs one village day's systems in the fixed order and returns the next
 * state, one whole day later - the headless runner's step (spec section 3).
 */
export function runVillageDay(state: VillageState): { state: VillageState; report: DayReport } {
  const settled = settleDay(state);
  return {
    state: {
      ...settled.state,
      clock: { ...settled.state.clock, minute: state.clock.minute + MINUTES_PER_DAY },
    },
    report: settled.report,
  };
}

/**
 * Runs the systems for the village day the clock is currently in,
 * without moving the clock - so a live clock can advance minute by minute
 * and settle each day as it reaches it. Every ledger and chronicle entry
 * it makes is stamped with the clock's current minute.
 */
export function settleDay(state: VillageState): { state: VillageState; report: DayReport } {
  // clock: whoever calls this moves the clock; here it's only read, for
  // the date that weather and the rest need.
  const date = calendarDateFromMinute(state.clock.minute);

  // weather
  const yesterday = state.weatherHistory.at(-1)?.kind ?? null;
  const weather = drawWeather(state.villageSeed, date.absoluteDay, date.season, yesterday);

  // schedules: land with a real schedule system; for now every villager
  // works exactly one stint a day.

  let ledger = state.ledger;
  let chronicle = state.chronicle;
  const villagerNeeds: Record<string, Needs> = { ...state.villagerNeeds };
  const waiting: string[] = [];
  const unpaid = new Set<string>();

  // A trade's workers fill its workplace's built instances in order, one
  // each - the same rule the map uses to place them (content's
  // `positionForWorker`), so the sim never pays someone the map shows idle.
  const placesTaken = new Map<string, number>();

  for (const villager of state.villagers) {
    const needsBeforeWork = villagerNeeds[villager.villagerId] ?? createNeeds();

    // needs -> mood -> the work system's moodFactor, used for both of today's stints
    const moodFactor = moodFactorFromMood(moodFromNeeds(needsBeforeWork));

    const worksAt = getTrade(villager.tradeId)?.worksAt;
    const taken = worksAt ? (placesTaken.get(worksAt) ?? 0) : 0;
    const built = worksAt ? state.builtBuildingIds.filter((id) => id === worksAt).length : 0;
    const hasPlace = worksAt !== undefined && taken < built;
    if (worksAt && hasPlace) {
      placesTaken.set(worksAt, taken + 1);
    }

    // work: two stints a day (spec section 6), if there's somewhere to do it
    let workedAStint = false;
    if (!hasPlace) {
      const reason = `No ${worksAt ?? 'workplace'} for ${villager.villagerId} to work at yet`;
      waiting.push(reason);
      chronicle = appendChronicle(chronicle, {
        minute: state.clock.minute,
        kind: 'work-wait',
        text: reason,
        actors: [villager.villagerId],
        importance: 1,
        public: false,
      });
    }
    for (let stintIndex = 0; hasPlace && stintIndex < STINTS_PER_DAY; stintIndex++) {
      const stint = runStint(
        ledger,
        { ...villager, moodFactor },
        {
          minute: state.clock.minute,
          day: date.absoluteDay,
          villageSeed: state.villageSeed,
          season: date.season,
          weather: weather.kind,
        },
      );
      ledger = stint.ledger;
      if (stint.waiting) {
        waiting.push(stint.waiting);
        chronicle = appendChronicle(chronicle, {
          minute: state.clock.minute,
          kind: 'work-wait',
          text: stint.waiting,
          actors: [villager.villagerId],
          importance: 1,
          public: false,
        });
      } else {
        workedAStint = true;
      }
      if (stint.unpaid) {
        unpaid.add(villager.villagerId);
      }
    }

    // needs: eat from stores, or get a relief basket if there's neither food nor coins
    const eaten = tryEat(ledger, state.clock.minute, villager.villagerId, needsBeforeWork);
    ledger = eaten.ledger;
    const relief = grantReliefIfNeeded(
      ledger,
      state.clock.minute,
      villager.villagerId,
      eaten.needs,
      eaten.ate,
    );
    ledger = relief.ledger;

    const decayed = decayNeeds(relief.needs, {
      villageHours: HOURS_PER_VILLAGE_DAY,
      isWorking: workedAStint,
      isAlone: false,
      hasShelter: true,
    });
    villagerNeeds[villager.villagerId] = applyPurposeForDay(decayed, workedAStint);
  }

  if (unpaid.size > 0) {
    chronicle = appendChronicle(chronicle, {
      minute: state.clock.minute,
      kind: 'unpaid-wages',
      text: `The treasury ran dry: ${[...unpaid].join(', ')} worked without pay.`,
      actors: [...unpaid],
      importance: 3,
      public: true,
    });
  }

  // economy: nightly upkeep, as much as the treasury can cover
  const treasuryBeforeUpkeep = getBalance(ledger, 'treasury', 'coins');
  ledger = chargeUpkeep(ledger, state.clock.minute, state.builtBuildingIds);
  const upkeepShort =
    upkeepDue(state.builtBuildingIds) -
    (treasuryBeforeUpkeep - getBalance(ledger, 'treasury', 'coins'));
  if (upkeepShort > 0) {
    chronicle = appendChronicle(chronicle, {
      minute: state.clock.minute,
      kind: 'unpaid-upkeep',
      text: `The treasury couldn't cover the upkeep: ${upkeepShort} coin(s) short.`,
      actors: [],
      importance: 2,
      public: true,
    });
  }

  // economy: the downriver town may post a new order, and any accepted order with enough stock is delivered
  const ordersBeforePosting = state.orders.orders;
  let orders = maybePostDownriverOrder(state.orders, state.villageSeed, date.absoluteDay);
  const ordersBeforeDelivery = orders.orders;
  const delivery = deliverReadyOrders(orders, ledger, state.clock.minute, date.absoluteDay);
  orders = delivery.ordersState;
  ledger = delivery.ledger;

  if (orders.orders.length > ordersBeforePosting.length) {
    const posted = orders.orders.at(-1);
    if (posted) {
      chronicle = appendChronicle(chronicle, {
        minute: state.clock.minute,
        kind: 'order-posted',
        text: `The downriver town posted an order for ${posted.items.map((item) => `${item.qty} ${item.good}`).join(', ')}.`,
        actors: [],
        importance: 2,
        public: true,
      });
    }
  }
  for (const order of orders.orders) {
    const before = ordersBeforeDelivery.find((candidate) => candidate.id === order.id);
    if (order.status === 'delivered' && before?.status !== 'delivered') {
      chronicle = appendChronicle(chronicle, {
        minute: state.clock.minute,
        kind: 'order-delivered',
        text: `Delivered ${order.items.map((item) => `${item.qty} ${item.good}`).join(', ')} to the downriver town.`,
        actors: [],
        importance: 2,
        public: true,
      });
    }
  }

  // the board: archive any post past its retention window
  const board = archiveOldBoardPosts(state.board, date.absoluteDay);

  // social: an evening interaction for every pair of villagers
  const villagerIds = state.villagers.map((v) => v.villagerId);
  const relationships = runEveningInteractions(
    state.relationships,
    villagerIds,
    date.absoluteDay,
    state.villageSeed,
  );

  // happenings
  const happening = pickHappening(HAPPENINGS, {
    villageSeed: state.villageSeed,
    day: date.absoluteDay,
    style: state.storytellerStyle,
    season: date.season,
    weather: weather.kind,
    isMarketDay: date.isMarketDay,
    builtBuildingIds: state.builtBuildingIds,
    daysSinceLastHappening: state.daysSinceLastHappening,
    villagerIds,
    relationships,
    weatherHistory: [...state.weatherHistory.map((day) => day.kind), weather.kind],
  });
  const daysSinceLastHappening = happening ? 0 : state.daysSinceLastHappening + 1;

  const effect = applyHappeningEffect(happening, ledger, state.clock.minute, villagerNeeds);
  ledger = effect.ledger;

  // chronicle
  if (happening) {
    chronicle = appendChronicle(chronicle, {
      minute: state.clock.minute,
      kind: 'happening',
      text: happening.chronicleLine,
      actors: [],
      importance: happening.isDamageOrIllness ? 5 : 3,
      public: true,
    });
  }

  const nextState: VillageState = {
    ...state,
    ledger,
    villagerNeeds: effect.villagerNeeds,
    weatherHistory: [...state.weatherHistory, weather],
    chronicle,
    daysSinceLastHappening,
    relationships,
    orders,
    board,
  };

  return { state: nextState, report: { day: date.absoluteDay, date, weather, waiting, happening } };
}

export function runVillageDays(
  villageSeed: number,
  days: number,
  scenario: VillageScenario = {},
): { state: VillageState; reports: DayReport[] } {
  let state = createVillage(villageSeed, scenario);
  const reports: DayReport[] = [];
  for (let i = 0; i < days; i++) {
    const result = runVillageDay(state);
    state = result.state;
    reports.push(result.report);
  }
  return { state, reports };
}
