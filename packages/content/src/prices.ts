import { z } from 'zod';

/**
 * Model token prices (spec section 16: "prices live in content/prices.ts
 * with a date. The Costs page warns when that table is more than 60
 * days old."). These rates are illustrative - there's no live pricing
 * lookup here, so they haven't been verified against DeepSeek's current
 * pricing page. Treat them as a placeholder to replace with the real
 * published rate before relying on this for an actual budget.
 */

export const modelPriceSchema = z.object({
  model: z.string(),
  /** $ per 1,000,000 uncached input tokens. */
  inputPerMillion: z.number().nonnegative(),
  /** $ per 1,000,000 cached input tokens. */
  cachedInputPerMillion: z.number().nonnegative(),
  /** $ per 1,000,000 output tokens (reasoning tokens are billed the same as output). */
  outputPerMillion: z.number().nonnegative(),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;

/** When this table was last checked against the provider's pricing page. */
export const PRICES_AS_OF = '2026-10-31';

export const MODEL_PRICES = [
  {
    model: 'deepseek-chat',
    inputPerMillion: 0.28,
    cachedInputPerMillion: 0.028,
    outputPerMillion: 0.42,
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
