import { describe, expect, it } from 'vitest';
import { getModelPrice, isPriceTableStale, PRICES_AS_OF } from './prices.js';

describe('getModelPrice', () => {
  it('finds a known model', () => {
    expect(getModelPrice('deepseek-chat')).toMatchObject({ model: 'deepseek-chat' });
  });

  it('is undefined for an unknown model', () => {
    expect(getModelPrice('nonexistent-model')).toBeUndefined();
  });
});

describe('isPriceTableStale', () => {
  it('is not stale right at the as-of date', () => {
    expect(isPriceTableStale(new Date(PRICES_AS_OF))).toBe(false);
  });

  it('is not stale 59 days after the as-of date', () => {
    const asOf = new Date(PRICES_AS_OF);
    const almostStale = new Date(asOf.getTime() + 59 * 24 * 60 * 60 * 1000);
    expect(isPriceTableStale(almostStale)).toBe(false);
  });

  it('is stale more than 60 days after the as-of date', () => {
    const asOf = new Date(PRICES_AS_OF);
    const stale = new Date(asOf.getTime() + 61 * 24 * 60 * 60 * 1000);
    expect(isPriceTableStale(stale)).toBe(true);
  });
});
