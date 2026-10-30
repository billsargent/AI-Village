/**
 * Needs and mood (spec section 7). Hunger and energy have decay/restore
 * rates the spec states exactly; social, fun, comfort and purpose are
 * event-driven in the spec's own wording ("falls with hours alone", "falls
 * with work hours", ...) rather than given a numeric rate, so their rates
 * here are a first pass to be tuned once schedules/visits/festivals exist.
 */

export const MAX_NEED = 100;
export const MIN_NEED = 0;

export interface Needs {
  hunger: number;
  energy: number;
  social: number;
  fun: number;
  comfort: number;
  purpose: number;
}

export function createNeeds(): Needs {
  return {
    hunger: MAX_NEED,
    energy: MAX_NEED,
    social: MAX_NEED,
    fun: MAX_NEED,
    comfort: MAX_NEED,
    purpose: MAX_NEED,
  };
}

function clampNeed(value: number): number {
  return Math.min(MAX_NEED, Math.max(MIN_NEED, value));
}

const HUNGER_DECAY_PER_HOUR = 1;
const ENERGY_DECAY_PER_WAKING_HOUR = 1;
const SOCIAL_DECAY_PER_ALONE_HOUR = 1;
const FUN_DECAY_PER_WORK_HOUR = 1;
const COMFORT_DECAY_PER_UNSHELTERED_HOUR = 1;
const PURPOSE_CHANGE_PER_DAY_WORKED = 10;
const PURPOSE_CHANGE_PER_DAY_IDLE = -5;

export interface DecayInputs {
  villageHours: number;
  isWorking: boolean;
  isAlone: boolean;
  hasShelter: boolean;
}

/** Decays hunger, energy, social, fun and comfort over `inputs.villageHours`. Purpose decays per day, not per hour - see `applyPurposeForDay`. */
export function decayNeeds(needs: Needs, inputs: DecayInputs): Needs {
  return {
    ...needs,
    hunger: clampNeed(needs.hunger - HUNGER_DECAY_PER_HOUR * inputs.villageHours),
    energy: clampNeed(needs.energy - ENERGY_DECAY_PER_WAKING_HOUR * inputs.villageHours),
    social: clampNeed(
      needs.social - (inputs.isAlone ? SOCIAL_DECAY_PER_ALONE_HOUR * inputs.villageHours : 0),
    ),
    fun: clampNeed(
      needs.fun - (inputs.isWorking ? FUN_DECAY_PER_WORK_HOUR * inputs.villageHours : 0),
    ),
    comfort: clampNeed(
      needs.comfort -
        (inputs.hasShelter ? 0 : COMFORT_DECAY_PER_UNSHELTERED_HOUR * inputs.villageHours),
    ),
  };
}

/** Purpose rises on a day worked and falls on a day idle (spec section 7). */
export function applyPurposeForDay(needs: Needs, workedToday: boolean): Needs {
  return {
    ...needs,
    purpose: clampNeed(
      needs.purpose + (workedToday ? PURPOSE_CHANGE_PER_DAY_WORKED : PURPOSE_CHANGE_PER_DAY_IDLE),
    ),
  };
}

/** How much each food restores hunger by (spec section 7). */
export const HUNGER_RESTORE_BY_GOOD: Readonly<Record<string, number>> = {
  bread: 40,
  fish: 40,
  vegetables: 25,
  apples: 15,
};

export function restoreHunger(needs: Needs, good: string): Needs {
  const restore = HUNGER_RESTORE_BY_GOOD[good];
  if (restore === undefined) {
    return needs;
  }
  return { ...needs, hunger: clampNeed(needs.hunger + restore) };
}

const ENERGY_RESTORE_PER_SLEEP_HOUR = 12;

export function restoreEnergyFromSleep(needs: Needs, sleepHours: number): Needs {
  return { ...needs, energy: clampNeed(needs.energy + ENERGY_RESTORE_PER_SLEEP_HOUR * sleepHours) };
}

/** Mood as a weighted sum of needs (spec section 7), 0-100. */
const MOOD_WEIGHTS = {
  hunger: 0.3,
  energy: 0.2,
  social: 0.15,
  fun: 0.15,
  comfort: 0.1,
  purpose: 0.1,
};

export function moodFromNeeds(needs: Needs): number {
  return (
    needs.hunger * MOOD_WEIGHTS.hunger +
    needs.energy * MOOD_WEIGHTS.energy +
    needs.social * MOOD_WEIGHTS.social +
    needs.fun * MOOD_WEIGHTS.fun +
    needs.comfort * MOOD_WEIGHTS.comfort +
    needs.purpose * MOOD_WEIGHTS.purpose
  );
}

/**
 * Maps mood (0-100) to the work system's moodFactor (0.5-1.0): spec section
 * 6 - "hunger and low mood slow work down to 50%, but never stop it."
 */
export function moodFactorFromMood(mood: number): number {
  const clampedMood = Math.min(MAX_NEED, Math.max(MIN_NEED, mood));
  return 0.5 + 0.5 * (clampedMood / MAX_NEED);
}
