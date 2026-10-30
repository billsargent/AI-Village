/**
 * `price = basePrice * (1 + 0.5 * scarcity)`, clamped between half and
 * double the base price (spec section 6).
 */
export function priceFor(basePrice: number, scarcity: number): number {
  const raw = basePrice * (1 + 0.5 * scarcity);
  return Math.min(basePrice * 2, Math.max(basePrice * 0.5, raw));
}

/**
 * Scarcity is measured in days of demand the current stock covers (spec
 * section 6): 0 at a healthy `targetDaysOfDemand` of stock, rising above 0
 * as stock runs short of that target and falling below 0 when there's a
 * surplus.
 */
export function scarcityFromStock(stockDaysOfDemand: number, targetDaysOfDemand = 7): number {
  return (targetDaysOfDemand - stockDaysOfDemand) / targetDaysOfDemand;
}

/** Days of demand the current stock covers, for feeding into `scarcityFromStock`. */
export function stockDaysOfDemand(stockQty: number, demandPerDay: number): number {
  if (demandPerDay <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return stockQty / demandPerDay;
}
