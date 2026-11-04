import { MINUTES_PER_DAY } from './calendar.js';
import { advanceClock, catchUpClock, type ClockSettings } from './clock.js';
import { settleDay, type DayReport, type VillageState } from './systems.js';

/**
 * The most days a single tick (or a catch-up after the app was closed)
 * will settle. The clock's own catch-up is capped in village hours
 * (`ClockSettings.catchUpVillageHours`), so this is only a backstop
 * against a pathological jump, not a rule the owner should ever notice.
 */
export const MAX_DAYS_PER_TICK = 7;

/** The last village day whose systems have run, or `null` for a village that's never run one. */
export function lastSettledDay(state: VillageState): number | null {
  // Every settled day draws exactly one day of weather, so the weather
  // history already records which days have run - no extra state needed.
  return state.weatherHistory.at(-1)?.day ?? null;
}

export interface TickResult {
  state: VillageState;
  /** One per day settled by this tick, oldest first - what a scheduler reacts to. */
  settled: readonly DayReport[];
}

/**
 * Settles every village day the clock has reached but whose systems
 * haven't run yet, each at its own first minute (so its ledger and
 * chronicle entries land on the right day), then puts the clock back
 * where it was. A day's systems run as the day begins, so its weather,
 * work and happenings are known all day long.
 *
 * Settling a whole day at once is the sim's current granularity - work
 * stints, schedules and villagers' positions within a day are later work,
 * and can hang off the clock minute this leaves untouched.
 */
export function settleDueDays(state: VillageState): TickResult {
  const today = Math.floor(state.clock.minute / MINUTES_PER_DAY);
  const last = lastSettledDay(state);
  const first = last === null ? today : Math.max(last + 1, today - MAX_DAYS_PER_TICK + 1);

  let next = state;
  const settled: DayReport[] = [];
  for (let day = first; day <= today; day++) {
    const atDayStart = { ...next, clock: { ...next.clock, minute: day * MINUTES_PER_DAY } };
    const result = settleDay(atDayStart);
    next = result.state;
    settled.push(result.report);
  }
  return { state: { ...next, clock: state.clock }, settled };
}

/** One live tick: real time passes on the village clock, then any day it reached is settled. */
export function tickLiveClock(
  state: VillageState,
  realMsElapsed: number,
  settings: ClockSettings,
): TickResult {
  const advanced = { ...state, clock: advanceClock(state.clock, realMsElapsed, settings) };
  return settleDueDays(advanced);
}

/**
 * Catches up for time the app was closed (spec section 5: rules only,
 * capped at `catchUpVillageHours`, at speed 1), settling any day that
 * crossed. Model turns are never replayed here.
 */
export function catchUpLiveClock(
  state: VillageState,
  realMsAway: number,
  settings: ClockSettings,
): TickResult {
  const advanced = { ...state, clock: catchUpClock(state.clock, realMsAway, settings) };
  return settleDueDays(advanced);
}
