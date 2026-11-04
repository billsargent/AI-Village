import { getBalance, MARKET_ACCOUNT, recordMovement, type LedgerState } from './ledger.js';

const UPKEEP_PER_BUILDING_PER_DAY = 1;

/** The coins a day's upkeep comes to for these buildings. */
export function upkeepDue(builtBuildingIds: readonly string[]): number {
  return builtBuildingIds.length * UPKEEP_PER_BUILDING_PER_DAY;
}

/**
 * Charges 1 coin a day from the treasury for each built building (spec
 * section 6), run once per village day as nightly housekeeping. The coin
 * leaves to `market`, the outside-world account, standing for upkeep paid
 * out rather than moved to another in-village account. A treasury that
 * can't cover it pays what it has; the caller notes the shortfall. What
 * unpaid upkeep does to a building (spec section 6's "condition") isn't
 * modelled yet.
 */
export function chargeUpkeep(
  ledger: LedgerState,
  minute: number,
  builtBuildingIds: readonly string[],
): LedgerState {
  const qty = Math.min(upkeepDue(builtBuildingIds), getBalance(ledger, 'treasury', 'coins'));
  if (qty <= 0) {
    return ledger;
  }
  return recordMovement(ledger, {
    minute,
    from: 'treasury',
    to: MARKET_ACCOUNT,
    item: 'coins',
    qty,
    reason: `upkeep for ${builtBuildingIds.length} building(s)`,
  });
}
