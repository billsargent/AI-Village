import { describe, expect, it } from 'vitest';
import { getBalance } from './ledger.js';
import { createVillage, runVillageDay, runVillageDays, SYSTEM_ORDER } from './systems.js';

describe('SYSTEM_ORDER', () => {
  it('runs clock before weather before everything else, chronicle last', () => {
    expect(SYSTEM_ORDER[0]).toBe('clock');
    expect(SYSTEM_ORDER[1]).toBe('weather');
    expect(SYSTEM_ORDER.at(-1)).toBe('chronicle');
  });
});

describe('runVillageDay', () => {
  it('advances the clock by exactly one day', () => {
    const { state } = runVillageDay(createVillage(1));
    expect(state.clock.minute).toBe(24 * 60);
  });

  it('records one weather day per village day', () => {
    const { state } = runVillageDay(createVillage(1));
    expect(state.weatherHistory).toHaveLength(1);
  });

  it("runs each villager's stint and charges upkeep for each built building", () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      builtBuildingIds: ['town-hall', 'fields'],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 20 }],
    });
    const { state, report } = runVillageDay(village);
    expect(report.waiting).toEqual([]);
    expect(getBalance(state.ledger, 'village', 'wheat')).toBeGreaterThan(0);
    // 20 starting - 3 wage - 2 upkeep = 15
    expect(getBalance(state.ledger, 'treasury', 'coins')).toBe(15);
  });

  it('reports why a villager is waiting, without stopping the day', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 20 }],
    });
    const { report } = runVillageDay(village);
    expect(report.waiting).toEqual(['No flour: the bakery needs flour']);
  });

  it('logs a chronicle entry for a wait, and for a happening when one fires', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 20 }],
    });
    const { state, report } = runVillageDay(village);
    expect(state.chronicle.some((entry) => entry.kind === 'work-wait')).toBe(true);
    if (report.happening) {
      expect(state.chronicle.some((entry) => entry.kind === 'happening')).toBe(true);
    }
  });

  it('resets the days-since-happening counter only when one fires', () => {
    const village = createVillage(1, { storytellerStyle: 'eventful' });
    const { state, report } = runVillageDay(village);
    expect(state.daysSinceLastHappening).toBe(report.happening ? 0 : 1);
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
