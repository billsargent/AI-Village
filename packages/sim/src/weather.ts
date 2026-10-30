import type { Season } from './calendar.js';
import { seededRandom, weightedPick } from './random.js';

export const WEATHER_KINDS = ['clear', 'rain', 'storm', 'snow', 'wind', 'fog', 'heat'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

interface WeatherOption {
  kind: WeatherKind;
  weight: number;
}

/**
 * Base weights per season (spec section 5's "seasons" column, with weights
 * chosen to keep clear/wind common and storm/heat/fog occasional - tuned
 * further once the headless sim's balance checks land).
 */
const SEASON_WEATHER: Record<Season, readonly WeatherOption[]> = {
  spring: [
    { kind: 'clear', weight: 50 },
    { kind: 'rain', weight: 30 },
    { kind: 'wind', weight: 20 },
  ],
  summer: [
    { kind: 'clear', weight: 45 },
    { kind: 'heat', weight: 20 },
    { kind: 'storm', weight: 10 },
    { kind: 'wind', weight: 15 },
    { kind: 'rain', weight: 10 },
  ],
  autumn: [
    { kind: 'clear', weight: 35 },
    { kind: 'rain', weight: 20 },
    { kind: 'storm', weight: 10 },
    { kind: 'wind', weight: 15 },
    { kind: 'fog', weight: 20 },
  ],
  winter: [
    { kind: 'clear', weight: 35 },
    { kind: 'snow', weight: 30 },
    { kind: 'wind', weight: 15 },
    { kind: 'fog', weight: 20 },
  ],
};

/** How much a storm's weight is scaled down when yesterday was also a storm. */
const STORM_REPEAT_DAMPING = 0.15;

export interface WeatherDay {
  day: number;
  kind: WeatherKind;
}

/**
 * Draws one deterministic weather value for `day`, given the village seed,
 * the season and yesterday's weather (spec section 5: "a Markov step from
 * yesterday - a storm rarely follows a storm").
 */
export function drawWeather(
  villageSeed: number,
  day: number,
  season: Season,
  yesterday: WeatherKind | null,
): WeatherDay {
  const options = SEASON_WEATHER[season];
  const weights = options.map((option) =>
    option.kind === 'storm' && yesterday === 'storm'
      ? option.weight * STORM_REPEAT_DAMPING
      : option.weight,
  );
  const rng = seededRandom({ villageSeed, day, system: 'weather', entity: 'village' });
  const kind = weightedPick(options, weights, rng).kind;
  return { day, kind };
}

/**
 * The almanac's forecast for `day`, right 80% of the time (spec section 5),
 * deterministic for a given seed and day so the same village always sees
 * the same forecast history.
 */
export function almanacForecast(
  villageSeed: number,
  day: number,
  actual: WeatherKind,
  season: Season,
): WeatherKind {
  const rng = seededRandom({ villageSeed, day, system: 'almanac', entity: 'village' });
  if (rng() < 0.8) {
    return actual;
  }
  const options = SEASON_WEATHER[season].filter((option) => option.kind !== actual);
  if (options.length === 0) {
    return actual;
  }
  return weightedPick(
    options,
    options.map((option) => option.weight),
    rng,
  ).kind;
}
