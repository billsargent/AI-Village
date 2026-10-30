import { createVillage, recordMovement, runVillageDay, type VillageState } from '@ai-village/sim';
import { describe, expect, it } from 'vitest';
import { facts, renderFacts } from './facts.js';

function villageWithStock(): VillageState {
  const village = createVillage(1, {
    villagers: [
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
    ],
    builtBuildingIds: ['town-hall', 'fields'],
    startingStock: [{ account: 'treasury', item: 'coins', qty: 100 }],
  });
  return village;
}

describe('facts', () => {
  it('reports the clock, weather and population', () => {
    const snapshot = facts(villageWithStock(), 'owner', 'chat');
    expect(snapshot.population).toBe(1);
    expect(snapshot.villagers).toEqual([{ id: 'ada', tradeId: 'farmer', role: 'villager' }]);
    expect(snapshot.weekday).toBe('Moonday');
    expect(snapshot.season).toBe('spring');
    expect(snapshot.weather).toBe('clear');
  });

  it('reports built buildings and treasury', () => {
    const snapshot = facts(villageWithStock(), 'owner', 'chat');
    expect(snapshot.builtBuildingIds).toEqual(['town-hall', 'fields']);
    expect(snapshot.treasuryCoins).toBe(100);
  });

  it("reports village stores from the ledger, not the owner's or a villager's purse", () => {
    let village = villageWithStock();
    village = {
      ...village,
      ledger: recordMovement(village.ledger, {
        minute: 0,
        from: 'market',
        to: 'village',
        item: 'wheat',
        qty: 12,
        reason: 'test setup',
      }),
    };
    const snapshot = facts(village, 'owner', 'chat');
    expect(snapshot.stores).toEqual({ wheat: 12 });
  });

  it("computes the treasury's change over the last village day", () => {
    // Run two days: day 1's ledger entries share a minute with the
    // starting-stock funding (both land at minute 0), so only day 2's
    // entries cleanly isolate what a day actually costs.
    const day1 = runVillageDay(villageWithStock());
    const day2 = runVillageDay(day1.state);
    const snapshot = facts(day2.state, 'owner', 'chat');
    // The farmer's wage for 2 stints (2 x 3 coins) and 2 coins of upkeep for 2 buildings.
    expect(snapshot.treasuryDeltaYesterday).toBe(-8);
  });

  it('surfaces recent public chronicle entries, most recent first', () => {
    const village = villageWithStock();
    const withChronicle: VillageState = {
      ...village,
      chronicle: [
        { minute: 0, kind: 'happening', text: 'first', actors: [], importance: 1, public: true },
        { minute: 60, kind: 'happening', text: 'second', actors: [], importance: 1, public: true },
        {
          minute: 120,
          kind: 'work-wait',
          text: 'private',
          actors: [],
          importance: 1,
          public: false,
        },
      ],
    };
    const snapshot = facts(withChronicle, 'owner', 'chat');
    expect(snapshot.recentChronicle.map((entry) => entry.text)).toEqual(['second', 'first']);
  });
});

describe('renderFacts', () => {
  it('renders a labelled block, capped at 40 lines, ending with the facts-win framing', () => {
    const snapshot = facts(villageWithStock(), 'owner', 'chat');
    const text = renderFacts(snapshot);
    const lines = text.split('\n');
    expect(lines.length).toBeLessThanOrEqual(40);
    expect(lines[0]).toContain('THE VILLAGE TODAY');
    expect(lines.at(-1)).toContain('These are the facts');
  });

  it("never invents stores or buildings that don't exist", () => {
    const empty = createVillage(1);
    const text = renderFacts(facts(empty, 'owner', 'chat'));
    expect(text).toContain('none built yet');
    expect(text).toContain('empty');
  });

  it('shows a non-default role instead of trade, like the spec facts block does for the Mayor', () => {
    const village = createVillage(1, {
      villagers: [
        {
          villagerId: 'hesper',
          tradeId: 'farmer',
          skillLevel: 1,
          hasTool: false,
          moodFactor: 1,
          role: 'mayor',
        },
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
    });
    const text = renderFacts(facts(village, 'owner', 'chat'));
    expect(text).toContain('hesper (mayor)');
    expect(text).toContain('ada (farmer)');
  });
});
