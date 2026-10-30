import { describe, expect, it } from 'vitest';
import { grantReliefIfNeeded, tryEat } from './eating.js';
import { createLedger, getBalance, MARKET_ACCOUNT, recordMovement } from './ledger.js';
import { createNeeds } from './needs.js';

function fund(account: string, item: string, qty: number) {
  return recordMovement(createLedger(), {
    minute: 0,
    from: MARKET_ACCOUNT,
    to: account,
    item,
    qty,
    reason: 'test setup',
  });
}

describe('tryEat', () => {
  it('does nothing when not hungry', () => {
    const ledger = fund('village', 'bread', 5);
    const result = tryEat(ledger, 0, 'ada', createNeeds());
    expect(result.ate).toBeNull();
  });

  it('eats bread from village stores and restores hunger', () => {
    const ledger = fund('village', 'bread', 5);
    const needs = { ...createNeeds(), hunger: 10 };
    const result = tryEat(ledger, 0, 'ada', needs);
    expect(result.ate).toBe('bread');
    expect(result.needs.hunger).toBe(50);
    expect(getBalance(result.ledger, 'village', 'bread')).toBe(4);
    expect(getBalance(result.ledger, 'spoiled', 'bread')).toBe(1);
  });

  it('does nothing when hungry but no food is in stock', () => {
    const needs = { ...createNeeds(), hunger: 10 };
    const result = tryEat(createLedger(), 0, 'ada', needs);
    expect(result.ate).toBeNull();
    expect(result.needs.hunger).toBe(10);
  });
});

describe('grantReliefIfNeeded', () => {
  it("grants a relief basket when there's no food and no coins", () => {
    const ledger = fund('treasury', 'coins', 10);
    const needs = { ...createNeeds(), hunger: 10 };
    const result = grantReliefIfNeeded(ledger, 0, 'ada', needs, null);
    expect(result.ate).toBe('relief');
    expect(result.needs.hunger).toBe(50);
    expect(getBalance(result.ledger, 'spoiled', 'bread')).toBe(1);
  });

  it('does nothing if the villager already ate from stores', () => {
    const ledger = fund('treasury', 'coins', 10);
    const needs = { ...createNeeds(), hunger: 10 };
    const result = grantReliefIfNeeded(ledger, 0, 'ada', needs, 'fish');
    expect(result.ate).toBeNull();
  });

  it('does nothing if the villager has their own coins', () => {
    let ledger = fund('treasury', 'coins', 10);
    ledger = recordMovement(ledger, {
      minute: 0,
      from: 'treasury',
      to: 'villager:ada',
      item: 'coins',
      qty: 3,
      reason: 'wage',
    });
    const needs = { ...createNeeds(), hunger: 10 };
    const result = grantReliefIfNeeded(ledger, 0, 'ada', needs, null);
    expect(result.ate).toBeNull();
  });

  it('does nothing when not hungry', () => {
    const ledger = fund('treasury', 'coins', 10);
    const result = grantReliefIfNeeded(ledger, 0, 'ada', createNeeds(), null);
    expect(result.ate).toBeNull();
  });
});
