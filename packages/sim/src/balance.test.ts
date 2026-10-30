import { describe, expect, it } from 'vitest';
import { getBalance } from './ledger.js';
import { runVillageDays } from './systems.js';

/**
 * A first pass at spec section 6's "balance targets", checked against what
 * the sim can actually simulate so far: work, wages, upkeep, and now needs
 * and eating (including relief baskets). The targets about treasury growth
 * still need the sales and market-day systems, which don't exist yet, so
 * this test checks what those later systems will need to stay true (no
 * negative balances, a bounded wage/upkeep/relief drain) rather than the
 * literal day-30 treasury-growth target.
 */
describe('a starting village (Mayor, farmer, innkeeper, carpenter)', () => {
  // Large enough that 30 days of wages, upkeep and relief baskets can't
  // run it dry - a village that can't afford its own upkeep is a separate
  // (and real) failure mode, not what this test is checking.
  const STARTING_TREASURY = 2000;

  function runStartingVillage(days: number) {
    return runVillageDays(7, days, {
      villagers: [
        { villagerId: 'mayor', tradeId: 'mayor', skillLevel: 1, hasTool: false, moodFactor: 1 },
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
        { villagerId: 'wren', tradeId: 'innkeeper', skillLevel: 1, hasTool: false, moodFactor: 1 },
        { villagerId: 'cole', tradeId: 'carpenter', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      builtBuildingIds: ['town-hall', 'inn', 'fields', 'workshop'],
      startingStock: [{ account: 'treasury', item: 'coins', qty: STARTING_TREASURY }],
    });
  }

  it('never takes a real account negative over 30 days', () => {
    // runVillageDays would throw InsufficientBalanceError if any movement
    // tried to take an account negative; completing without throwing is
    // itself the "balances never negative" guarantee from spec section 4.
    expect(() => runStartingVillage(30)).not.toThrow();
  });

  it("grows the village's wheat stock by day 3 (the farmer feeds the village its raw goods)", () => {
    const { state } = runStartingVillage(3);
    expect(getBalance(state.ledger, 'village', 'wheat')).toBeGreaterThan(0);
  });

  it('logs a wait for the carpenter, who has no woodcutter to supply logs', () => {
    const { reports } = runStartingVillage(1);
    expect(reports[0]?.waiting).toContain('No logs: the workshop needs logs');
  });

  it('drains the treasury by at least 3 wages (the carpenter waits unpaid) + 4 upkeep a day, plus any relief baskets', () => {
    const { state } = runStartingVillage(10);
    const wagesPerDay = 3 * 3;
    const upkeepPerDay = 4 * 1;
    const treasury = getBalance(state.ledger, 'treasury', 'coins');
    expect(treasury).toBeLessThanOrEqual(STARTING_TREASURY - (wagesPerDay + upkeepPerDay) * 10);
    expect(treasury).toBeGreaterThanOrEqual(0);
  });
});
