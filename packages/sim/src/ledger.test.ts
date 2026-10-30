import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  balancesMatchLedger,
  createLedger,
  getBalance,
  InsufficientBalanceError,
  MARKET_ACCOUNT,
  rebuildBalances,
  recordMovement,
} from './ledger.js';

describe('recordMovement', () => {
  it('moves goods from one account to another', () => {
    let ledger = createLedger();
    ledger = recordMovement(ledger, {
      minute: 0,
      from: MARKET_ACCOUNT,
      to: 'village',
      item: 'wheat',
      qty: 10,
      reason: 'opening stock',
    });
    ledger = recordMovement(ledger, {
      minute: 60,
      from: 'village',
      to: 'villager:ada',
      item: 'wheat',
      qty: 4,
      reason: 'wage in kind',
    });

    expect(getBalance(ledger, 'village', 'wheat')).toBe(6);
    expect(getBalance(ledger, 'villager:ada', 'wheat')).toBe(4);
  });

  it('refuses to take a real account negative', () => {
    const ledger = createLedger();
    expect(() =>
      recordMovement(ledger, {
        minute: 0,
        from: 'village',
        to: 'villager:ada',
        item: 'wheat',
        qty: 1,
        reason: 'no stock yet',
      }),
    ).toThrow(InsufficientBalanceError);
  });

  it("never checks the market account's balance", () => {
    let ledger = createLedger();
    ledger = recordMovement(ledger, {
      minute: 0,
      from: MARKET_ACCOUNT,
      to: 'village',
      item: 'iron',
      qty: 1000,
      reason: 'the outside world has no stock limit',
    });
    expect(getBalance(ledger, 'village', 'iron')).toBe(1000);
    expect(getBalance(ledger, MARKET_ACCOUNT, 'iron')).toBe(0);
  });

  it('rejects a non-positive quantity', () => {
    const ledger = createLedger();
    expect(() =>
      recordMovement(ledger, {
        minute: 0,
        from: MARKET_ACCOUNT,
        to: 'village',
        item: 'wheat',
        qty: 0,
        reason: '',
      }),
    ).toThrow();
  });
});

describe('ledger invariants', () => {
  it('balances never go negative and always match a replay of the ledger', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            toMarket: fc.boolean(),
            item: fc.constantFrom('wheat', 'flour', 'bread'),
            qty: fc.integer({ min: 1, max: 20 }),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (steps) => {
          let ledger = createLedger();
          const accounts = ['village', 'villager:ada', 'villager:tobin'];
          let minute = 0;
          for (const step of steps) {
            minute += 1;
            if (step.toMarket) {
              // Stock the village from the market so later moves have something to spend.
              ledger = recordMovement(ledger, {
                minute,
                from: MARKET_ACCOUNT,
                to: 'village',
                item: step.item,
                qty: step.qty,
                reason: 'restock',
              });
            } else {
              const from = accounts[0] as string;
              const to = accounts[1] as string;
              const available = getBalance(ledger, from, step.item);
              if (available >= step.qty) {
                ledger = recordMovement(ledger, {
                  minute,
                  from,
                  to,
                  item: step.item,
                  qty: step.qty,
                  reason: 'transfer',
                });
              }
            }
          }

          for (const account of accounts) {
            for (const item of ['wheat', 'flour', 'bread']) {
              expect(getBalance(ledger, account, item)).toBeGreaterThanOrEqual(0);
            }
          }
          expect(balancesMatchLedger(ledger)).toBe(true);
        },
      ),
    );
  });

  it('rebuildBalances from an empty ledger is empty', () => {
    expect(rebuildBalances([])).toEqual({});
  });
});
