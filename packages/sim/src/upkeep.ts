import { MARKET_ACCOUNT, recordMovement, type LedgerState } from './ledger.js';

const UPKEEP_PER_BUILDING_PER_DAY = 1;

/**
 * Charges 1 coin a day from the treasury for each built building (spec
 * section 6), run once per village day as nightly housekeeping. The coin
 * leaves to `market`, the outside-world account, standing for upkeep paid
 * out rather than moved to another in-village account.
 */
export function chargeUpkeep(
  ledger: LedgerState,
  minute: number,
  builtBuildingIds: readonly string[],
): LedgerState {
  if (builtBuildingIds.length === 0) {
    return ledger;
  }
  return recordMovement(ledger, {
    minute,
    from: 'treasury',
    to: MARKET_ACCOUNT,
    item: 'coins',
    qty: builtBuildingIds.length * UPKEEP_PER_BUILDING_PER_DAY,
    reason: `upkeep for ${builtBuildingIds.length} building(s)`,
  });
}
