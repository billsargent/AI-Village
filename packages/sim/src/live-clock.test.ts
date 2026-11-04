import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from './calendar.js';
import { clockSettingsSchema, pauseClock } from './clock.js';
import { getBalance } from './ledger.js';
import {
  catchUpLiveClock,
  lastSettledDay,
  MAX_DAYS_PER_TICK,
  settleDueDays,
  tickLiveClock,
} from './live-clock.js';
import { createVillage, runVillageDay, settleDay } from './systems.js';

const SETTINGS = clockSettingsSchema.parse({}); // 10 real minutes per village hour
const REAL_MS_PER_VILLAGE_HOUR = 10 * 60_000;

function village() {
  return createVillage(3, {
    villagers: [
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
    ],
    builtBuildingIds: ['fields'],
    startingStock: [{ account: 'treasury', item: 'coins', qty: 100 }],
  });
}

describe('settleDay', () => {
  it('runs the day without moving the clock', () => {
    const start = village();
    const { state } = settleDay(start);
    expect(state.clock.minute).toBe(start.clock.minute);
    expect(state.weatherHistory).toHaveLength(1);
  });

  it("matches runVillageDay's systems exactly, apart from the clock", () => {
    const start = village();
    const settled = settleDay(start).state;
    const ran = runVillageDay(start).state;
    expect(ran.clock.minute).toBe(start.clock.minute + MINUTES_PER_DAY);
    expect({ ...ran, clock: settled.clock }).toEqual(settled);
  });
});

describe('settleDueDays', () => {
  it("settles today straight away for a village that's never run a day", () => {
    const { state, settled } = settleDueDays(village());
    expect(settled.map((r) => r.day)).toEqual([0]);
    expect(lastSettledDay(state)).toBe(0);
  });

  it('does nothing when today is already settled', () => {
    const once = settleDueDays(village()).state;
    const twice = settleDueDays(once);
    expect(twice.settled).toEqual([]);
    expect(twice.state.ledger).toBe(once.ledger);
    expect(twice.state.weatherHistory).toBe(once.weatherHistory);
  });

  it('settles every day the clock skipped over, each on its own day, and keeps the clock', () => {
    const start = settleDueDays(village()).state;
    const jumped = { ...start, clock: { ...start.clock, minute: 3 * MINUTES_PER_DAY + 600 } };
    const { state, settled } = settleDueDays(jumped);
    expect(settled.map((r) => r.day)).toEqual([1, 2, 3]);
    expect(state.clock.minute).toBe(3 * MINUTES_PER_DAY + 600);
    // Day 2's wages are stamped with day 2's first minute.
    expect(
      state.ledger.entries.some((e) => e.reason === 'wage' && e.minute === 2 * MINUTES_PER_DAY),
    ).toBe(true);
  });

  it('never settles more than a week in one go', () => {
    const start = settleDueDays(village()).state;
    const farAhead = { ...start, clock: { ...start.clock, minute: 100 * MINUTES_PER_DAY } };
    expect(settleDueDays(farAhead).settled).toHaveLength(MAX_DAYS_PER_TICK);
  });
});

describe('tickLiveClock', () => {
  it('moves the clock by real time and settles a day as the clock reaches it', () => {
    let state = settleDueDays(village()).state;
    // 23 village hours: still day 0.
    let tick = tickLiveClock(state, 23 * REAL_MS_PER_VILLAGE_HOUR, SETTINGS);
    expect(tick.settled).toEqual([]);
    state = tick.state;
    // One more hour: day 1 begins and settles.
    tick = tickLiveClock(state, REAL_MS_PER_VILLAGE_HOUR, SETTINGS);
    expect(tick.settled.map((r) => r.day)).toEqual([1]);
    expect(tick.state.clock.minute).toBeCloseTo(MINUTES_PER_DAY);
  });

  it('leaves a paused village alone', () => {
    const start = settleDueDays(village()).state;
    const paused = { ...start, clock: pauseClock(start.clock) };
    const tick = tickLiveClock(paused, 48 * REAL_MS_PER_VILLAGE_HOUR, SETTINGS);
    expect(tick.state.clock.minute).toBe(paused.clock.minute);
    expect(tick.settled).toEqual([]);
  });
});

describe('catchUpLiveClock', () => {
  it('catches up at most the settings allow, settling what it crosses', () => {
    const start = settleDueDays(village()).state; // day 0, 00:00
    // A whole real week away, but catch-up is capped at 6 village hours by default.
    const tick = catchUpLiveClock(start, 7 * 24 * 3_600_000, SETTINGS);
    expect(tick.state.clock.minute).toBe(start.clock.minute + 6 * 60);
    expect(tick.settled).toEqual([]);
  });
});

describe('an empty treasury', () => {
  it("doesn't crash the day: work goes unpaid and the chronicle says so", () => {
    const broke = createVillage(3, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      builtBuildingIds: ['fields'],
    });
    const { state } = settleDay(broke);
    expect(getBalance(state.ledger, 'villager:ada', 'coins')).toBe(0);
    expect(state.chronicle.some((e) => e.kind === 'unpaid-wages' && e.public)).toBe(true);
    expect(state.chronicle.some((e) => e.kind === 'unpaid-upkeep')).toBe(true);
    // The fields still grew wheat.
    expect(getBalance(state.ledger, 'village', 'wheat')).toBeGreaterThan(0);
  });
});
