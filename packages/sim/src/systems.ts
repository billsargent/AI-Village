import { HAPPENINGS, type HappeningCard } from '@ai-village/content';
import { calendarDateFromMinute, MINUTES_PER_DAY, type CalendarDate } from './calendar.js';
import { appendChronicle, type Chronicle } from './chronicle.js';
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
import { runEveningInteractions, type Relationships } from './relationships.js';
import { pickHappening, type StorytellerStyle } from './storyteller.js';
import { chargeUpkeep } from './upkeep.js';
import { runStint, type WorkerAssignment } from './work.js';
import { drawWeather, type WeatherDay } from './weather.js';

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
  storytellerStyle?: StorytellerStyle;
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
    storytellerStyle: scenario.storytellerStyle ?? 'lively',
    chronicle: [],
    daysSinceLastHappening: 0,
    relationships: {},
  };
}

export interface DayReport {
  day: number;
  date: CalendarDate;
  weather: WeatherDay;
  waiting: readonly string[];
  happening: HappeningCard | null;
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
  let chronicle = state.chronicle;
  const villagerNeeds: Record<string, Needs> = { ...state.villagerNeeds };
  const waiting: string[] = [];

  for (const villager of state.villagers) {
    const needsBeforeWork = villagerNeeds[villager.villagerId] ?? createNeeds();

    // needs -> mood -> the work system's moodFactor, used for both of today's stints
    const moodFactor = moodFactorFromMood(moodFromNeeds(needsBeforeWork));

    // work: two stints a day (spec section 6)
    let workedAStint = false;
    for (let stintIndex = 0; stintIndex < STINTS_PER_DAY; stintIndex++) {
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

  // economy: nightly upkeep
  ledger = chargeUpkeep(ledger, state.clock.minute, state.builtBuildingIds);

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
  });
  const daysSinceLastHappening = happening ? 0 : state.daysSinceLastHappening + 1;

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
    clock: { ...state.clock, minute: state.clock.minute + MINUTES_PER_DAY },
    ledger,
    villagerNeeds,
    weatherHistory: [...state.weatherHistory, weather],
    chronicle,
    daysSinceLastHappening,
    relationships,
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
