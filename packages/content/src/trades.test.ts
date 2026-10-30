import { describe, expect, it } from 'vitest';
import { getGood } from './goods.js';
import { getTrade, TRADES } from './trades.js';

describe('trades table', () => {
  it('has the 13 version 1 trades', () => {
    expect(TRADES).toHaveLength(13);
    expect(getTrade('baker')).toBeDefined();
    expect(getTrade('mayor')).toBeDefined();
  });

  it('only references goods that exist', () => {
    for (const trade of TRADES) {
      for (const quantity of [...trade.inputs, ...trade.outputs]) {
        expect(
          getGood(quantity.good),
          `trade "${trade.id}" -> good "${quantity.good}"`,
        ).toBeDefined();
      }
    }
  });

  it('gives the fisher a 25% bonus-catch chance', () => {
    const fisher = getTrade('fisher');
    expect(fisher?.outputs[0]?.bonusChance).toBe(0.25);
  });
});
