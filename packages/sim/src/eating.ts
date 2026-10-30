import { getGood } from '@ai-village/content';
import { getBalance, MARKET_ACCOUNT, recordMovement, type LedgerState } from './ledger.js';
import { HUNGER_RESTORE_BY_GOOD, restoreHunger, type Needs } from './needs.js';

/** Hungry enough to look for food (a first pass; tuned once schedules exist). */
const HUNGRY_THRESHOLD = 50;

export interface FeedResult {
  ledger: LedgerState;
  needs: Needs;
  /** The good eaten from village stores, "relief" if a relief basket was granted, or null if nothing happened. */
  ate: string | null;
}

/**
 * Feeds a villager if they're hungry enough: first from the village's own
 * stores, consuming one unit of whichever listed food is available (spec
 * section 7). The food is consumed into `spoiled`, alongside goods that
 * spoil naturally, since eaten food is equally gone for good.
 */
export function tryEat(
  ledger: LedgerState,
  minute: number,
  villagerId: string,
  needs: Needs,
): FeedResult {
  if (needs.hunger >= HUNGRY_THRESHOLD) {
    return { ledger, needs, ate: null };
  }

  for (const good of Object.keys(HUNGER_RESTORE_BY_GOOD)) {
    if (getBalance(ledger, 'village', good) >= 1) {
      const nextLedger = recordMovement(ledger, {
        minute,
        from: 'village',
        to: 'spoiled',
        item: good,
        qty: 1,
        reason: `eaten by ${villagerId}`,
      });
      return { ledger: nextLedger, needs: restoreHunger(needs, good), ate: good };
    }
  }

  return { ledger, needs, ate: null };
}

const RELIEF_GOOD = 'bread';

/**
 * A villager with no food and no coins gets a relief basket from the
 * treasury: nobody starves (spec section 6). The treasury pays the
 * relief good's base price to `market` and a unit of it is given directly
 * to the villager, bypassing the village's own (empty) stores.
 */
export function grantReliefIfNeeded(
  ledger: LedgerState,
  minute: number,
  villagerId: string,
  needs: Needs,
  ateFromStores: string | null,
): FeedResult {
  if (needs.hunger >= HUNGRY_THRESHOLD || ateFromStores) {
    return { ledger, needs, ate: null };
  }
  const hasCoins = getBalance(ledger, `villager:${villagerId}`, 'coins') > 0;
  if (hasCoins) {
    return { ledger, needs, ate: null };
  }

  const good = getGood(RELIEF_GOOD);
  if (!good) {
    throw new Error(`Unknown relief good "${RELIEF_GOOD}"`);
  }

  let nextLedger = ledger;
  const treasuryCoins = getBalance(nextLedger, 'treasury', 'coins');
  if (good.basePrice > 0 && treasuryCoins >= good.basePrice) {
    // Nobody starves (spec section 6): if the treasury can't cover even a
    // relief basket, the basket is still given - the village absorbs the
    // cost rather than leaving a villager with no food and no coins.
    nextLedger = recordMovement(nextLedger, {
      minute,
      from: 'treasury',
      to: MARKET_ACCOUNT,
      item: 'coins',
      qty: good.basePrice,
      reason: `relief basket for ${villagerId}`,
    });
  }
  nextLedger = recordMovement(nextLedger, {
    minute,
    from: MARKET_ACCOUNT,
    to: 'spoiled',
    item: RELIEF_GOOD,
    qty: 1,
    reason: `relief basket for ${villagerId}, eaten`,
  });

  return { ledger: nextLedger, needs: restoreHunger(needs, RELIEF_GOOD), ate: 'relief' };
}
