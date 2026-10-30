import { describe, expect, it } from 'vitest';
import { runVillageDay, runVillageDays, SYSTEM_ORDER } from './systems.js';

describe('SYSTEM_ORDER', () => {
  it('runs clock before weather before everything else, chronicle last', () => {
    expect(SYSTEM_ORDER[0]).toBe('clock');
    expect(SYSTEM_ORDER[1]).toBe('weather');
    expect(SYSTEM_ORDER.at(-1)).toBe('chronicle');
  });
});

describe('runVillageDay', () => {
  it('advances the clock by exactly one day', () => {
    const { state } = runVillageDay({
      villageSeed: 1,
      clock: { minute: 0, speed: 1, paused: false },
      ledger: { entries: [], balances: {}, nextId: 1 },
      weatherHistory: [],
    });
    expect(state.clock.minute).toBe(24 * 60);
  });

  it('records one weather day per village day', () => {
    const { state } = runVillageDay({
      villageSeed: 1,
      clock: { minute: 0, speed: 1, paused: false },
      ledger: { entries: [], balances: {}, nextId: 1 },
      weatherHistory: [],
    });
    expect(state.weatherHistory).toHaveLength(1);
  });
});

describe('runVillageDays', () => {
  it('runs 100 days quickly and deterministically for a given seed', () => {
    const start = performance.now();
    const a = runVillageDays(42, 100);
    const elapsedMs = performance.now() - start;

    expect(a.reports).toHaveLength(100);
    expect(elapsedMs).toBeLessThan(2000);

    const b = runVillageDays(42, 100);
    expect(a.reports.map((r) => r.weather.kind)).toEqual(b.reports.map((r) => r.weather.kind));
  });
});
