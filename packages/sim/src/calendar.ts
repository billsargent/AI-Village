const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
const DAYS_PER_WEEK = 7;
const DAYS_PER_SEASON = 14;
const SEASONS_PER_YEAR = 4;
const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;

export const WEEKDAYS = [
  'Moonday',
  'Tillday',
  'Wellday',
  'Thornday',
  'Fireday',
  'Starday',
  'Restday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const DAY_PHASES = [
  'dawn',
  'work-first-stint',
  'lunch',
  'work-second-stint',
  'evening',
  'night',
] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

export interface Festival {
  name: string;
  season: Season;
  /** 1-indexed day within the season. */
  seasonDay: number;
}

/** The four seasonal festivals (spec section 5). */
export const FESTIVALS: readonly Festival[] = [
  { name: 'Sowing Fair', season: 'spring', seasonDay: 7 },
  { name: 'Midsummer Night', season: 'summer', seasonDay: 14 },
  { name: 'Harvest Festival', season: 'autumn', seasonDay: 10 },
  { name: 'Lantern Night', season: 'winter', seasonDay: 14 },
];

export interface CalendarDate {
  /** Absolute village day since founding, 0-indexed. */
  absoluteDay: number;
  weekday: Weekday;
  year: number;
  season: Season;
  /** 1-indexed day within the season (1-14). */
  seasonDay: number;
  hour: number;
  minuteOfHour: number;
  phase: DayPhase;
  festival: Festival | null;
  /** True on Fireday, the village's market day. */
  isMarketDay: boolean;
  /** True on Restday, when nobody does trade work. */
  isRestDay: boolean;
}

function phaseForHour(hour: number): DayPhase {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'work-first-stint';
  if (hour >= 12 && hour < 13) return 'lunch';
  if (hour >= 13 && hour < 17) return 'work-second-stint';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Converts a village-minute clock reading into a full calendar date. */
export function calendarDateFromMinute(minute: number): CalendarDate {
  const absoluteDay = Math.floor(minute / MINUTES_PER_DAY);
  const minuteOfDay = minute - absoluteDay * MINUTES_PER_DAY;
  const hour = Math.floor(minuteOfDay / MINUTES_PER_HOUR);
  const minuteOfHour = Math.floor(minuteOfDay - hour * MINUTES_PER_HOUR);

  const weekday = WEEKDAYS[
    ((absoluteDay % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK
  ] as Weekday;

  const yearDay = ((absoluteDay % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const year = Math.floor(absoluteDay / DAYS_PER_YEAR);
  const seasonIndex = Math.floor(yearDay / DAYS_PER_SEASON);
  const season = SEASONS[seasonIndex] as Season;
  const seasonDay = (yearDay % DAYS_PER_SEASON) + 1;

  const festival = FESTIVALS.find((f) => f.season === season && f.seasonDay === seasonDay) ?? null;

  return {
    absoluteDay,
    weekday,
    year,
    season,
    seasonDay,
    hour,
    minuteOfHour,
    phase: phaseForHour(hour),
    festival,
    isMarketDay: weekday === 'Fireday',
    isRestDay: weekday === 'Restday',
  };
}
