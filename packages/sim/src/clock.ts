import { z } from 'zod';

const VILLAGE_MINUTES_PER_HOUR = 60;

export const clockSpeedSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]);
/** 0 means paused; 1/2/4 are the real-time multipliers from spec section 5. */
export type ClockSpeed = z.infer<typeof clockSpeedSchema>;

export const clockSettingsSchema = z.object({
  /** Real minutes per village hour: 2.5-60 (a village day of 1-24 real hours). */
  realMinutesPerVillageHour: z.number().min(2.5).max(60).default(10),
  /** Village hours to simulate on catch-up after the app was closed: 0-24. */
  catchUpVillageHours: z.number().min(0).max(24).default(6),
});
export type ClockSettings = z.infer<typeof clockSettingsSchema>;

export interface ClockState {
  /** Village minutes since founding. */
  minute: number;
  speed: ClockSpeed;
  paused: boolean;
}

export function createClock(startMinute = 0): ClockState {
  return { minute: startMinute, speed: 1, paused: false };
}

/** Advances the clock by the village minutes that `realMsElapsed` of wall-clock time covers. */
export function advanceClock(
  state: ClockState,
  realMsElapsed: number,
  settings: ClockSettings,
): ClockState {
  if (state.paused || state.speed === 0 || realMsElapsed <= 0) {
    return state;
  }
  const realMinutesElapsed = realMsElapsed / 60_000;
  const villageMinutes =
    (realMinutesElapsed / settings.realMinutesPerVillageHour) *
    VILLAGE_MINUTES_PER_HOUR *
    state.speed;
  return { ...state, minute: state.minute + villageMinutes };
}

/**
 * Advances the clock for time the app was closed, capped at
 * `settings.catchUpVillageHours` of village time, run at speed 1 regardless
 * of the clock's last speed (rules only; model turns are not replayed here).
 */
export function catchUpClock(
  state: ClockState,
  realMsAway: number,
  settings: ClockSettings,
): ClockState {
  if (realMsAway <= 0) {
    return state;
  }
  const realMinutesAway = realMsAway / 60_000;
  const villageMinutesAway =
    (realMinutesAway / settings.realMinutesPerVillageHour) * VILLAGE_MINUTES_PER_HOUR;
  const cappedVillageMinutes = Math.min(
    villageMinutesAway,
    settings.catchUpVillageHours * VILLAGE_MINUTES_PER_HOUR,
  );
  return { ...state, minute: state.minute + cappedVillageMinutes };
}

export function pauseClock(state: ClockState): ClockState {
  return { ...state, paused: true };
}

export function resumeClock(state: ClockState, speed: ClockSpeed = 1): ClockState {
  return { ...state, paused: false, speed: speed === 0 ? 1 : speed };
}

export function setClockSpeed(state: ClockState, speed: ClockSpeed): ClockState {
  return { ...state, speed, paused: speed === 0 };
}
