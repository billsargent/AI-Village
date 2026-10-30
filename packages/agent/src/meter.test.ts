import { describe, expect, it } from 'vitest';
import { appendMeterRecord, totalCostUsd, type Meter } from './meter.js';

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
