import { describe, expect, it } from 'vitest';
import { appendMeterRecord, computeCostUsd, costSince, totalCostUsd, type Meter } from './meter.js';

const RECORD = {
  at: 0,
  purpose: 'chat',
  villagerId: 'ada',
  model: 'deepseek-chat',
  tokensIn: 100,
  tokensCached: 0,
  tokensOut: 20,
  tokensReasoning: 0,
  costUsd: 0.001,
  ms: 500,
};

describe('appendMeterRecord', () => {
  it('keeps prior records and adds the new one', () => {
    const meter: Meter = [RECORD];
    const next = appendMeterRecord(meter, { ...RECORD, purpose: 'work' });
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(RECORD);
    expect(next[1]?.purpose).toBe('work');
  });
});

describe('totalCostUsd', () => {
  it("sums every record's cost", () => {
    const meter: Meter = [RECORD, { ...RECORD, costUsd: 0.002 }];
    expect(totalCostUsd(meter)).toBeCloseTo(0.003, 6);
  });

  it('is 0 for an empty meter', () => {
    expect(totalCostUsd([])).toBe(0);
  });
});

describe('costSince', () => {
  it('only sums records at or after the given time', () => {
    const meter: Meter = [
      { ...RECORD, at: 100, costUsd: 0.001 },
      { ...RECORD, at: 200, costUsd: 0.002 },
      { ...RECORD, at: 300, costUsd: 0.004 },
    ];
    expect(costSince(meter, 200)).toBeCloseTo(0.006, 6);
    expect(costSince(meter, 1000)).toBe(0);
  });
});

describe('computeCostUsd', () => {
  it('prices input, cached-input and output/reasoning tokens by their own rate', () => {
    const cost = computeCostUsd('deepseek-chat', 1_000_000, 1_000_000, 500_000, 500_000);
    // deepseek-chat: $0.28/$0.028/$0.42 per million (input/cached/output).
    expect(cost).toBeCloseTo(0.28 + 0.028 + 0.42, 6);
  });

  it('is 0 for a model with no price on file', () => {
    expect(computeCostUsd('nonexistent-model', 1000, 0, 100, 0)).toBe(0);
  });

  it('is 0 for zero tokens', () => {
    expect(computeCostUsd('deepseek-chat', 0, 0, 0, 0)).toBe(0);
  });
});
