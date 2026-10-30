import { calendarDateFromMinute, MINUTES_PER_DAY, type CalendarDate } from './calendar.js';
import { createClock, type ClockState } from './clock.js';
import { grantReliefIfNeeded, tryEat } from './eating.js';
import { createLedger, MARKET_ACCOUNT, recordMovement, type LedgerState } from './ledger.js';
import {
  applyPurposeForDay,
  createNeeds,
  decayNeeds,
  moodFactorFromMood,
  moodFromNeeds,
  type Needs,
} from './needs.js';
import { chargeUpkeep } from './upkeep.js';
import { runStint, type WorkerAssignment } from './work.js';
import { drawWeather, type WeatherDay } from './weather.js';

const HOURS_PER_VILLAGE_DAY = 24;

/**
 * The fixed order systems run in each village day (spec section 5). Work
 * and economy run one stint per villager per day, nightly upkeep, and
 * eating/relief; schedules, social and happenings are still named no-ops.
 * A real schedule (two stints a day, evenings, sleep) replaces this day-at-
 * a-time simplification once the schedules system lands.
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
}

export interface StartingStock {
  account: string;
  item: string;
  qty: number;
}

export interface VillageScenario {
  villagers?: readonly WorkerAssignment[];
  builtBuildingIds?: readonly string[];
  /** Opening stock (e.g. a starting treasury) funded from the market account. */
  startingStock?: readonly StartingStock[];
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
  const villagers = scenario.villagers ?? [];
  return {
    villageSeed,
    clock: createClock(),
    ledger,
    weatherHistory: [],
    villagers,
    villagerNeeds: Object.fromEntries(villagers.map((v) => [v.villagerId, createNeeds()])),
    builtBuildingIds: scenario.builtBuildingIds ?? [],
  };
}

export interface DayReport {
  day: number;
  date: CalendarDate;
  weather: WeatherDay;
  waiting: readonly string[];
}

/** Runs one village day's systems in the fixed order and returns the next state. */
export function runVillageDay(state: VillageState): { state: VillageState; report: DayReport } {
  // clock: the headless runner steps by whole days, so nothing to do here
  // beyond reading the date that weather needs.
  const date = calendarDateFromMinute(state.clock.minute);

  // weather
  const yesterday = state.weatherHistory.at(-1)?.kind ?? null;
  const weather = drawWeather(state.villageSeed, date.absoluteDay, date.season, yesterday);

  // schedules: land with a real schedule system; for now every villager
  // works exactly one stint a day.

  let ledger = state.ledger;
  const villagerNeeds: Record<string, Needs> = { ...state.villagerNeeds };
  const waiting: string[] = [];

  for (const villager of state.villagers) {
    const needsBeforeWork = villagerNeeds[villager.villagerId] ?? createNeeds();

    // needs -> mood -> the work system's moodFactor
    const moodFactor = moodFactorFromMood(moodFromNeeds(needsBeforeWork));

    // work
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
      isWorking: stint.waiting === null,
      isAlone: false,
      hasShelter: true,
    });
    villagerNeeds[villager.villagerId] = applyPurposeForDay(decayed, stint.waiting === null);
  }

  // economy: nightly upkeep
  ledger = chargeUpkeep(ledger, state.clock.minute, state.builtBuildingIds);

  // social, happenings, chronicle: land in later milestones.

  const nextState: VillageState = {
    ...state,
    clock: { ...state.clock, minute: state.clock.minute + MINUTES_PER_DAY },
    ledger,
    villagerNeeds,
    weatherHistory: [...state.weatherHistory, weather],
  };

  return { state: nextState, report: { day: date.absoluteDay, date, weather, waiting } };
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
