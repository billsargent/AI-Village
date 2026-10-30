import { describe, expect, it } from 'vitest';
import { chargeUpkeep } from './upkeep.js';
import { createLedger, getBalance, MARKET_ACCOUNT, recordMovement } from './ledger.js';

describe('chargeUpkeep', () => {
  it('charges 1 coin per built building from the treasury', () => {
    const funded = recordMovement(createLedger(), {
      minute: 0,
      from: MARKET_ACCOUNT,
      to: 'treasury',
      item: 'coins',
      qty: 10,
      reason: 'test setup',
    });
    const next = chargeUpkeep(funded, 0, ['town-hall', 'inn', 'cottage']);
    expect(getBalance(next, 'treasury', 'coins')).toBe(7);
  });

  it('does nothing when there are no buildings yet', () => {
    const ledger = createLedger();
    const next = chargeUpkeep(ledger, 0, []);
    expect(next).toBe(ledger);
  });
});
