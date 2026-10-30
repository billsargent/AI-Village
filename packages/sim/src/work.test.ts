import { describe, expect, it } from 'vitest';
import { createLedger, getBalance, MARKET_ACCOUNT, recordMovement } from './ledger.js';
import { runStint, type WorkContext } from './work.js';

const BASE_CONTEXT: WorkContext = {
  minute: 0,
  day: 0,
  villageSeed: 1,
  season: 'spring',
  weather: 'clear',
};

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

describe('runStint', () => {
  it("produces a farmer's wheat and vegetables with no inputs, and pays the wage", () => {
    const ledger = fund('treasury', 'coins', 10);
    const result = runStint(
      ledger,
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      BASE_CONTEXT,
    );
    expect(result.waiting).toBeNull();
    expect(result.produced.wheat).toBe(6);
    expect(result.produced.vegetables).toBe(2);
    expect(getBalance(result.ledger, 'villager:ada', 'coins')).toBe(3);
    expect(getBalance(result.ledger, 'treasury', 'coins')).toBe(7);
  });

  it('waits with a plain reason when an input is missing', () => {
    const ledger = fund('treasury', 'coins', 10);
    const result = runStint(
      ledger,
      { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
      BASE_CONTEXT,
    );
    expect(result.waiting).toBe('No flour: the bakery needs flour');
    expect(result.produced).toEqual({});
    // No wage for a stint that didn't run.
    expect(getBalance(result.ledger, 'villager:tobin', 'coins')).toBe(0);
  });

  it("consumes inputs and produces outputs when they're in stock", () => {
    let ledger = fund('treasury', 'coins', 10);
    ledger = recordMovement(ledger, {
      minute: 0,
      from: MARKET_ACCOUNT,
      to: 'village',
      item: 'flour',
      qty: 2,
      reason: 'test setup',
    });
    const result = runStint(
      ledger,
      { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
      BASE_CONTEXT,
    );
    expect(result.waiting).toBeNull();
    expect(result.produced.bread).toBe(8);
    expect(getBalance(result.ledger, 'village', 'flour')).toBe(0);
  });

  it("applies the farmer's autumn season bonus", () => {
    const ledger = fund('treasury', 'coins', 10);
    const result = runStint(
      ledger,
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      { ...BASE_CONTEXT, season: 'autumn' },
    );
    expect(result.produced.wheat).toBe(9); // 6 * 1.5
  });

  it('blocks the fisher entirely during a storm', () => {
    const ledger = fund('treasury', 'coins', 10);
    const result = runStint(
      ledger,
      { villagerId: 'finn', tradeId: 'fisher', skillLevel: 1, hasTool: false, moodFactor: 1 },
      { ...BASE_CONTEXT, weather: 'storm' },
    );
    expect(result.waiting).toContain('fisher');
    expect(result.produced).toEqual({});
  });

  it('boosts output with skill level and a tool', () => {
    const ledger = fund('treasury', 'coins', 10);
    const result = runStint(
      ledger,
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 5, hasTool: true, moodFactor: 1 },
      BASE_CONTEXT,
    );
    // 6 * (1 + 0.05*4) * 1.2 = 6 * 1.2 * 1.2 = 8.64 -> rounds to 9
    expect(result.produced.wheat).toBe(9);
  });

  it('slows output to as low as 50% for low mood, but never produces nothing', () => {
    const ledger = fund('treasury', 'coins', 10);
    const result = runStint(
      ledger,
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 0.5 },
      BASE_CONTEXT,
    );
    expect(result.produced.wheat).toBe(3);
    expect(result.waiting).toBeNull();
  });
});
