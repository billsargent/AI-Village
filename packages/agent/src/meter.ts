/**
 * Every model and tool call goes through one meter (spec section 16).
 * In-memory for now - a `meter` db table lands once this is wired to a
 * real call path and budgets need to check it before spending.
 */

export interface MeterRecord {
  at: number;
  purpose: string;
  villagerId: string | null;
  model: string;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  tokensReasoning: number;
  costUsd: number;
  ms: number;
}

export type Meter = readonly MeterRecord[];

export function appendMeterRecord(meter: Meter, record: MeterRecord): Meter {
  return [...meter, record];
}

export function totalCostUsd(meter: Meter): number {
  return meter.reduce((sum, record) => sum + record.costUsd, 0);
}
