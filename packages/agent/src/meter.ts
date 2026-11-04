/**
 * Every model and tool call goes through one meter (spec section 16).
 * The live server persists it (the db's `meter` table) and checks
 * budgets against it before every call.
 */

import { getModelPrice, isPeakTime } from '@ai-village/content';

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

/** Total cost for records at or after `sinceMs` (spec section 16's budget windows). */
export function costSince(meter: Meter, sinceMs: number): number {
  return meter
    .filter((record) => record.at >= sinceMs)
    .reduce((sum, record) => sum + record.costUsd, 0);
}

const USD_PER_TOKEN_UNIT = 1_000_000;

/**
 * The real $ cost of one call, from its token counts and the model's
 * price (spec section 16). Reasoning tokens are billed the same as
 * output tokens - the spec doesn't give them their own rate. Unknown
 * models (no price on file) cost $0 rather than guessing a rate.
 */
export function computeCostUsd(
  model: string,
  tokensIn: number,
  tokensCached: number,
  tokensOut: number,
  tokensReasoning: number,
  /** When the call was made - the provider's peak hours cost more (`isPeakTime`). */
  atMs?: number,
): number {
  const price = getModelPrice(model);
  if (!price) {
    return 0;
  }
  const multiplier = atMs !== undefined && isPeakTime(atMs) ? price.peakMultiplier : 1;
  return (
    ((tokensIn * price.inputPerMillion +
      tokensCached * price.cachedInputPerMillion +
      (tokensOut + tokensReasoning) * price.outputPerMillion) *
      multiplier) /
    USD_PER_TOKEN_UNIT
  );
}
