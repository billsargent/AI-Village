import { describe, expect, it } from 'vitest';
import { getModelPrice, isPeakTime, isPriceTableStale, PRICES_AS_OF } from './prices.js';

describe('getModelPrice', () => {
  it('finds a known model', () => {
    expect(getModelPrice('deepseek-flash')).toMatchObject({ model: 'deepseek-flash' });
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

describe('isPeakTime', () => {
  it("is peak in DeepSeek's weekday windows, 01:00-04:00 and 06:00-10:00 UTC", () => {
    // Monday 9 Nov 2026.
    expect(isPeakTime(Date.UTC(2026, 10, 9, 1, 0))).toBe(true);
    expect(isPeakTime(Date.UTC(2026, 10, 9, 3, 59))).toBe(true);
    expect(isPeakTime(Date.UTC(2026, 10, 9, 7, 30))).toBe(true);
  });

  it('is off-peak between and after the windows', () => {
    expect(isPeakTime(Date.UTC(2026, 10, 9, 0, 59))).toBe(false);
    expect(isPeakTime(Date.UTC(2026, 10, 9, 4, 0))).toBe(false);
    expect(isPeakTime(Date.UTC(2026, 10, 9, 10, 0))).toBe(false);
    expect(isPeakTime(Date.UTC(2026, 10, 9, 15, 0))).toBe(false);
  });

  it('is never peak at the weekend', () => {
    expect(isPeakTime(Date.UTC(2026, 10, 7, 7, 0))).toBe(false);
    expect(isPeakTime(Date.UTC(2026, 10, 8, 2, 0))).toBe(false);
  });
});
