import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  catchUpClock,
  createClock,
  pauseClock,
  resumeClock,
  setClockSpeed,
} from './clock.js';

const SETTINGS = { realMinutesPerVillageHour: 10, catchUpVillageHours: 6 };

describe('advanceClock', () => {
  it('advances one village hour per 10 real minutes at 1x (the default)', () => {
    const clock = createClock();
    const next = advanceClock(clock, 10 * 60_000, SETTINGS);
    expect(next.minute).toBeCloseTo(60, 5);
  });

  it('scales with speed', () => {
    const clock = setClockSpeed(createClock(), 4);
    const next = advanceClock(clock, 10 * 60_000, SETTINGS);
    expect(next.minute).toBeCloseTo(240, 5);
  });

  it('does not advance while paused', () => {
    const clock = pauseClock(createClock());
    const next = advanceClock(clock, 10 * 60_000, SETTINGS);
    expect(next.minute).toBe(0);
  });

  it('resumes at a real speed, never 0', () => {
    const clock = resumeClock(pauseClock(createClock()));
    expect(clock.paused).toBe(false);
    expect(clock.speed).toBe(1);
  });
});

describe('catchUpClock', () => {
  it('advances by the real time away, converted to village minutes', () => {
    const clock = createClock();
    // 10 real minutes away = 1 village hour = 60 village minutes, well under the 6-hour cap.
    const next = catchUpClock(clock, 10 * 60_000, SETTINGS);
    expect(next.minute).toBeCloseTo(60, 5);
  });

  it('caps catch-up at catchUpVillageHours', () => {
    const clock = createClock();
    // A whole real day away would be 24 village hours; capped to 6.
    const next = catchUpClock(clock, 24 * 60 * 60_000, SETTINGS);
    expect(next.minute).toBeCloseTo(6 * 60, 5);
  });

  it('does nothing for zero or negative time away', () => {
    const clock = createClock();
    expect(catchUpClock(clock, 0, SETTINGS).minute).toBe(0);
    expect(catchUpClock(clock, -1, SETTINGS).minute).toBe(0);
  });
});
