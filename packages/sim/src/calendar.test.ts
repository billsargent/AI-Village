import { describe, expect, it } from 'vitest';
import { calendarDateFromMinute, FESTIVALS, WEEKDAYS } from './calendar.js';

const MINUTES_PER_DAY = 24 * 60;

describe('calendarDateFromMinute', () => {
  it('starts at Moonday, spring, day 1, year 0', () => {
    const date = calendarDateFromMinute(0);
    expect(date.absoluteDay).toBe(0);
    expect(date.weekday).toBe('Moonday');
    expect(date.season).toBe('spring');
    expect(date.seasonDay).toBe(1);
    expect(date.year).toBe(0);
  });

  it('cycles through all 7 weekdays over a week', () => {
    const seen = new Set<string>();
    for (let day = 0; day < 7; day++) {
      seen.add(calendarDateFromMinute(day * MINUTES_PER_DAY).weekday);
    }
    expect(seen).toEqual(new Set(WEEKDAYS));
  });

  it("rolls from winter day 14 into the next year's spring day 1", () => {
    const lastDayOfYear = 55; // 0-indexed absolute day: 4 seasons * 14 days - 1
    const date = calendarDateFromMinute(lastDayOfYear * MINUTES_PER_DAY);
    expect(date.season).toBe('winter');
    expect(date.seasonDay).toBe(14);
    expect(date.year).toBe(0);

    const nextDate = calendarDateFromMinute((lastDayOfYear + 1) * MINUTES_PER_DAY);
    expect(nextDate.season).toBe('spring');
    expect(nextDate.seasonDay).toBe(1);
    expect(nextDate.year).toBe(1);
  });

  it('flags every festival on its exact day and nowhere else', () => {
    for (const festival of FESTIVALS) {
      const seasonIndex = ['spring', 'summer', 'autumn', 'winter'].indexOf(festival.season);
      const absoluteDay = seasonIndex * 14 + (festival.seasonDay - 1);
      const date = calendarDateFromMinute(absoluteDay * MINUTES_PER_DAY);
      expect(date.festival?.name).toBe(festival.name);

      const dayBefore = calendarDateFromMinute((absoluteDay - 1) * MINUTES_PER_DAY);
      expect(dayBefore.festival).toBeNull();
    }
  });

  it('marks Fireday as market day and Restday as the rest day', () => {
    const fireday = calendarDateFromMinute(4 * MINUTES_PER_DAY);
    expect(fireday.weekday).toBe('Fireday');
    expect(fireday.isMarketDay).toBe(true);

    const restday = calendarDateFromMinute(6 * MINUTES_PER_DAY);
    expect(restday.weekday).toBe('Restday');
    expect(restday.isRestDay).toBe(true);
  });

  it("maps hours to the spec's day-shape phases", () => {
    expect(calendarDateFromMinute(5 * 60).phase).toBe('dawn');
    expect(calendarDateFromMinute(8 * 60).phase).toBe('work-first-stint');
    expect(calendarDateFromMinute(12 * 60).phase).toBe('lunch');
    expect(calendarDateFromMinute(14 * 60).phase).toBe('work-second-stint');
    expect(calendarDateFromMinute(18 * 60).phase).toBe('evening');
    expect(calendarDateFromMinute(23 * 60).phase).toBe('night');
    expect(calendarDateFromMinute(2 * 60).phase).toBe('night');
  });
});
