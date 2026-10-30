import { calendarDateFromMinute, MINUTES_PER_DAY, type CalendarDate } from './calendar.js';
import { createClock, type ClockState } from './clock.js';
import { createLedger, type LedgerState } from './ledger.js';
import { drawWeather, type WeatherDay } from './weather.js';

/**
 * The fixed order systems run in each village day (spec section 5). Later
 * milestones give schedules, needs, work, economy, social, happenings and
 * chronicle real bodies; for now they are named no-ops so the order itself
 * is locked in and testable before that logic exists.
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
}

export function createVillage(villageSeed: number): VillageState {
  return {
    villageSeed,
    clock: createClock(),
    ledger: createLedger(),
    weatherHistory: [],
  };
}

export interface DayReport {
  day: number;
  date: CalendarDate;
  weather: WeatherDay;
}

/** Runs one village day's systems in the fixed order and returns the next state. */
export function runVillageDay(state: VillageState): { state: VillageState; report: DayReport } {
  // clock: the headless runner steps by whole days, so nothing to do here
  // beyond reading the date that weather needs.
  const date = calendarDateFromMinute(state.clock.minute);

  // weather
  const yesterday = state.weatherHistory.at(-1)?.kind ?? null;
  const weather = drawWeather(state.villageSeed, date.absoluteDay, date.season, yesterday);

  // schedules, needs, work, economy, social, happenings, chronicle: land in
  // later milestones (see master issue R, step R6).

  const nextState: VillageState = {
    ...state,
    clock: { ...state.clock, minute: state.clock.minute + MINUTES_PER_DAY },
    weatherHistory: [...state.weatherHistory, weather],
  };

  return { state: nextState, report: { day: date.absoluteDay, date, weather } };
}

export function runVillageDays(
  villageSeed: number,
  days: number,
): { state: VillageState; reports: DayReport[] } {
  let state = createVillage(villageSeed);
  const reports: DayReport[] = [];
  for (let i = 0; i < days; i++) {
    const result = runVillageDay(state);
    state = result.state;
    reports.push(result.report);
  }
  return { state, reports };
}
