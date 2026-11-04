import { z } from 'zod';

/**
 * Model token prices (spec section 16: "prices live in content/prices.ts
 * with a date. The Costs page warns when that table is more than 60
 * days old."). Checked against DeepSeek's Models & Pricing page on
 * PRICES_AS_OF. The base rates are off-peak; DeepSeek charges double in
 * its peak windows (`peakMultiplier`, `isPeakTime`).
 */

export const modelPriceSchema = z.object({
  model: z.string(),
  /** $ per 1,000,000 uncached input tokens. */
  inputPerMillion: z.number().nonnegative(),
  /** $ per 1,000,000 cached input tokens. */
  cachedInputPerMillion: z.number().nonnegative(),
  /** $ per 1,000,000 output tokens (reasoning tokens are billed the same as output). */
  outputPerMillion: z.number().nonnegative(),
  /** How many times the base rates apply at peak times (`isPeakTime`); 1 when there's no peak pricing. */
  peakMultiplier: z.number().positive(),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;

/** When this table was last checked against the provider's pricing page. */
export const PRICES_AS_OF = '2026-11-05';

export const MODEL_PRICES = [
  {
    // DeepSeek-V4.1-Flash: the talk model (spec section 11).
    model: 'deepseek-flash',
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.003,
    outputPerMillion: 0.6,
    peakMultiplier: 2,
  },
  {
    // DeepSeek-V4-Pro: priced here for the work model, not used yet.
    model: 'deepseek-v4-pro',
    inputPerMillion: 0.66,
    cachedInputPerMillion: 0.022,
    outputPerMillion: 1.98,
    peakMultiplier: 2,
  },
] as const satisfies readonly ModelPrice[];

export const modelPricesTableSchema = z.array(modelPriceSchema);
modelPricesTableSchema.parse(MODEL_PRICES);

export type PricedModelId = (typeof MODEL_PRICES)[number]['model'];

const PRICES_BY_MODEL = new Map<string, ModelPrice>(
  MODEL_PRICES.map((price) => [price.model, price]),
);

export function getModelPrice(model: string): ModelPrice | undefined {
  return PRICES_BY_MODEL.get(model);
}

const STALE_AFTER_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** True once `PRICES_AS_OF` is more than 60 days behind `now` (spec section 16). */
export function isPriceTableStale(now: Date = new Date()): boolean {
  const asOf = new Date(PRICES_AS_OF);
  const daysSince = (now.getTime() - asOf.getTime()) / MS_PER_DAY;
  return daysSince > STALE_AFTER_DAYS;
}

/**
 * DeepSeek's peak windows: 01:00-04:00 and 06:00-10:00 UTC, Monday to
 * Friday, "excluding Chinese public holidays". Those holidays aren't
 * modelled, so a holiday is treated as peak - the budget errs on the
 * side of over-counting, never under.
 */
const PEAK_WINDOWS_UTC: readonly (readonly [number, number])[] = [
  [1, 4],
  [6, 10],
];

export function isPeakTime(atMs: number): boolean {
  const at = new Date(atMs);
  const day = at.getUTCDay();
  if (day === 0 || day === 6) {
    return false;
  }
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
  return PEAK_WINDOWS_UTC.some(([start, end]) => hour >= start && hour < end);
}
