import { describe, expect, it } from 'vitest';
import { checkBudget, defaultBudgetSettings, type BudgetSettings } from './budget.js';
import type { Meter, MeterRecord } from './meter.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function record(overrides: Partial<MeterRecord> = {}): MeterRecord {
  return {
    at: 0,
    purpose: 'work',
    villagerId: 'ada',
    model: 'deepseek-chat',
    tokensIn: 0,
    tokensCached: 0,
    tokensOut: 0,
    tokensReasoning: 0,
    costUsd: 0,
    ms: 0,
    ...overrides,
  };
}

describe('defaultBudgetSettings', () => {
  it('starts with no per-villager cap and limits on', () => {
    const settings = defaultBudgetSettings(10);
    expect(settings).toEqual({
      monthlyCeilingUsd: 10,
      perVillagerPerDayUsd: null,
      noLimits: false,
    });
  });
});

describe('checkBudget', () => {
  it('allows a call under the monthly ceiling', () => {
    const settings = defaultBudgetSettings(10);
    const meter: Meter = [record({ at: 0, costUsd: 5 })];
    expect(checkBudget(meter, settings, 'work', 'ada', DAY_MS)).toEqual({ ok: true });
  });

  it('blocks a non-chat purpose once the monthly ceiling is reached', () => {
    const settings = defaultBudgetSettings(10);
    const meter: Meter = [record({ at: 0, costUsd: 10 })];
    expect(checkBudget(meter, settings, 'work', 'ada', DAY_MS)).toEqual({
      ok: false,
      reason: 'monthly-ceiling',
    });
  });

  it("never blocks the owner's own chat for the monthly ceiling", () => {
    const settings = defaultBudgetSettings(10);
    const meter: Meter = [record({ at: 0, costUsd: 1000 })];
    expect(checkBudget(meter, settings, 'chat', 'ada', DAY_MS)).toEqual({ ok: true });
  });

  it('ignores spend older than a month for the monthly ceiling', () => {
    const settings = defaultBudgetSettings(10);
    const twoMonthsMs = 60 * DAY_MS;
    const meter: Meter = [record({ at: 0, costUsd: 10 })];
    expect(checkBudget(meter, settings, 'work', 'ada', twoMonthsMs)).toEqual({ ok: true });
  });

  it('is off by default for per-villager-per-day', () => {
    const settings = defaultBudgetSettings(1000);
    const meter: Meter = [record({ at: 0, costUsd: 500, villagerId: 'ada' })];
    expect(checkBudget(meter, settings, 'work', 'ada', DAY_MS)).toEqual({ ok: true });
  });

  it('blocks a villager over their per-day cap once set', () => {
    const settings: BudgetSettings = { ...defaultBudgetSettings(1000), perVillagerPerDayUsd: 1 };
    const meter: Meter = [record({ at: 0, costUsd: 1, villagerId: 'ada' })];
    expect(checkBudget(meter, settings, 'work', 'ada', DAY_MS)).toEqual({
      ok: false,
      reason: 'per-villager-per-day',
    });
  });

  it("doesn't count another villager's spend against this one's per-day cap", () => {
    const settings: BudgetSettings = { ...defaultBudgetSettings(1000), perVillagerPerDayUsd: 1 };
    const meter: Meter = [record({ at: 0, costUsd: 1, villagerId: 'tobin' })];
    expect(checkBudget(meter, settings, 'work', 'ada', DAY_MS)).toEqual({ ok: true });
  });

  it('removes every limit except the monthly ceiling when noLimits is set', () => {
    const settings: BudgetSettings = {
      monthlyCeilingUsd: 10,
      perVillagerPerDayUsd: 0.01,
      noLimits: true,
    };
    const meter: Meter = [record({ at: 0, costUsd: 5, villagerId: 'ada' })];
    expect(checkBudget(meter, settings, 'work', 'ada', DAY_MS)).toEqual({ ok: true });

    const overCeiling: Meter = [record({ at: 0, costUsd: 10 })];
    expect(checkBudget(overCeiling, settings, 'work', 'ada', DAY_MS)).toEqual({
      ok: false,
      reason: 'monthly-ceiling',
    });
  });
});
