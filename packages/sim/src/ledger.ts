/**
 * Every good and coin movement is one ledger row, with balances updated in
 * the same transaction (spec section 4 and 6). Accounts never go negative,
 * except `market`, which stands for the outside world and has no balance of
 * its own to run out of.
 */

export const MARKET_ACCOUNT = 'market';

export interface LedgerMovement {
  minute: number;
  from: string;
  to: string;
  item: string;
  qty: number;
  reason: string;
  ref?: string;
}

export interface LedgerEntry extends LedgerMovement {
  id: number;
}

export interface LedgerState {
  entries: readonly LedgerEntry[];
  balances: Readonly<Record<string, number>>;
  nextId: number;
}

export class InsufficientBalanceError extends Error {}

function balanceKey(account: string, item: string): string {
  return `${account}::${item}`;
}

export function createLedger(): LedgerState {
  return { entries: [], balances: {}, nextId: 1 };
}

export function getBalance(ledger: LedgerState, account: string, item: string): number {
  return ledger.balances[balanceKey(account, item)] ?? 0;
}

/** Records one movement, checking first that it won't take a real account negative. */
export function recordMovement(ledger: LedgerState, movement: LedgerMovement): LedgerState {
  if (movement.qty <= 0) {
    throw new Error('Ledger movement qty must be positive');
  }

  if (movement.from !== MARKET_ACCOUNT) {
    const available = getBalance(ledger, movement.from, movement.item);
    if (available < movement.qty) {
      throw new InsufficientBalanceError(
        `${movement.from} has ${available} ${movement.item}, needs ${movement.qty} (${movement.reason})`,
      );
    }
  }

  const entry: LedgerEntry = { ...movement, id: ledger.nextId };
  const balances = { ...ledger.balances };

  if (movement.from !== MARKET_ACCOUNT) {
    balances[balanceKey(movement.from, movement.item)] =
      getBalance(ledger, movement.from, movement.item) - movement.qty;
  }
  if (movement.to !== MARKET_ACCOUNT) {
    balances[balanceKey(movement.to, movement.item)] =
      getBalance(ledger, movement.to, movement.item) + movement.qty;
  }

  return { entries: [...ledger.entries, entry], balances, nextId: ledger.nextId + 1 };
}

/** Replays the ledger from scratch; used by the nightly drift check (spec section 4). */
export function rebuildBalances(entries: readonly LedgerEntry[]): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.from !== MARKET_ACCOUNT) {
      const key = balanceKey(entry.from, entry.item);
      balances[key] = (balances[key] ?? 0) - entry.qty;
    }
    if (entry.to !== MARKET_ACCOUNT) {
      const key = balanceKey(entry.to, entry.item);
      balances[key] = (balances[key] ?? 0) + entry.qty;
    }
  }
  return balances;
}

export function balancesMatchLedger(ledger: LedgerState): boolean {
  const rebuilt = rebuildBalances(ledger.entries);
  const keys = new Set([...Object.keys(ledger.balances), ...Object.keys(rebuilt)]);
  for (const key of keys) {
    if ((ledger.balances[key] ?? 0) !== (rebuilt[key] ?? 0)) {
      return false;
    }
  }
  return true;
}
