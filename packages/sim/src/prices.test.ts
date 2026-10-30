import { describe, expect, it } from 'vitest';
import { priceFor, scarcityFromStock, stockDaysOfDemand } from './prices.js';

describe('priceFor', () => {
  it('returns the base price at zero scarcity', () => {
    expect(priceFor(10, 0)).toBe(10);
  });

  it('rises with scarcity, clamped at double the base price', () => {
    expect(priceFor(10, 1)).toBe(15);
    expect(priceFor(10, 10)).toBe(20);
  });

  it('falls with a surplus, clamped at half the base price', () => {
    expect(priceFor(10, -1)).toBe(5);
    expect(priceFor(10, -10)).toBe(5);
  });
});

describe('scarcityFromStock', () => {
  it('is zero when stock exactly covers the target', () => {
    expect(scarcityFromStock(7, 7)).toBe(0);
  });

  it('is positive when stock is short of the target', () => {
    expect(scarcityFromStock(0, 7)).toBeGreaterThan(0);
  });

  it('is negative when stock exceeds the target', () => {
    expect(scarcityFromStock(21, 7)).toBeLessThan(0);
  });
});

describe('stockDaysOfDemand', () => {
  it('divides stock by daily demand', () => {
    expect(stockDaysOfDemand(20, 4)).toBe(5);
  });

  it("is infinite when there's no demand", () => {
    expect(stockDaysOfDemand(20, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
