import type { HappeningCard } from '@ai-village/content';
import { describe, expect, it } from 'vitest';
import { createLedger, getBalance, MARKET_ACCOUNT, recordMovement } from './ledger.js';
import { createNeeds } from './needs.js';
import {
  applyHappeningEffect,
  createVillage,
  runVillageDay,
  runVillageDays,
  SYSTEM_ORDER,
  type VillageState,
} from './systems.js';

function happeningCard(id: string): HappeningCard {
  return {
    id,
    title: id,
    condition: { kind: 'always' },
    weight: 1,
    effect: '',
    chronicleLine: '',
    isDamageOrIllness: false,
    decisionFor: null,
  };
}

describe('SYSTEM_ORDER', () => {
  it('runs clock before weather before everything else, chronicle last', () => {
    expect(SYSTEM_ORDER[0]).toBe('clock');
    expect(SYSTEM_ORDER[1]).toBe('weather');
    expect(SYSTEM_ORDER.at(-1)).toBe('chronicle');
  });
});

describe('createVillage', () => {
  it('defaults a villager with no role to villager', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
    });
    expect(village.villagers[0]?.role).toBe('villager');
  });

  it('keeps an explicitly given role', () => {
    const village = createVillage(1, {
      villagers: [
        {
          villagerId: 'hesper',
          tradeId: 'mayor',
          skillLevel: 1,
          hasTool: false,
          moodFactor: 1,
          role: 'mayor',
        },
      ],
    });
    expect(village.villagers[0]?.role).toBe('mayor');
  });

  it('rejects a village with more than one Mayor', () => {
    const villagerOf = (id: string) => ({
      villagerId: id,
      tradeId: 'mayor',
      skillLevel: 1,
      hasTool: false,
      moodFactor: 1,
      role: 'mayor' as const,
    });
    expect(() =>
      createVillage(1, { villagers: [villagerOf('hesper'), villagerOf('ada')] }),
    ).toThrow(/only one Mayor/);
  });
});

describe('runVillageDay', () => {
  it('advances the clock by exactly one day', () => {
    const { state } = runVillageDay(createVillage(1));
    expect(state.clock.minute).toBe(24 * 60);
  });

  it('records one weather day per village day', () => {
    const { state } = runVillageDay(createVillage(1));
    expect(state.weatherHistory).toHaveLength(1);
  });

  it("runs each villager's stint and charges upkeep for each built building", () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      builtBuildingIds: ['town-hall', 'fields'],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 20 }],
    });
    const { state, report } = runVillageDay(village);
    expect(report.waiting).toEqual([]);
    expect(getBalance(state.ledger, 'village', 'wheat')).toBeGreaterThan(0);
    // 20 starting - 2 stints x 3 wage - 2 upkeep = 12
    expect(getBalance(state.ledger, 'treasury', 'coins')).toBe(12);
  });

  it('reports why a villager is waiting, without stopping the day, once per stint', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 20 }],
    });
    const { report } = runVillageDay(village);
    expect(report.waiting).toEqual([
      'No flour: the bakery needs flour',
      'No flour: the bakery needs flour',
    ]);
  });

  it('logs a chronicle entry for a wait, and for a happening when one fires', () => {
    const village = createVillage(1, {
      villagers: [
        { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 20 }],
    });
    const { state, report } = runVillageDay(village);
    expect(state.chronicle.some((entry) => entry.kind === 'work-wait')).toBe(true);
    if (report.happening) {
      expect(state.chronicle.some((entry) => entry.kind === 'happening')).toBe(true);
    }
  });

  it('resets the days-since-happening counter only when one fires', () => {
    const village = createVillage(1, { storytellerStyle: 'eventful' });
    const { state, report } = runVillageDay(village);
    expect(state.daysSinceLastHappening).toBe(report.happening ? 0 : 1);
  });
});

describe('applyHappeningEffect', () => {
  it('adds half the current wheat stock on a bumper harvest', () => {
    const ledger = recordMovement(createLedger(), {
      minute: 0,
      from: MARKET_ACCOUNT,
      to: 'village',
      item: 'wheat',
      qty: 20,
      reason: 'opening stock',
    });

    const result = applyHappeningEffect(happeningCard('bumper-harvest'), ledger, 0, {});

    expect(getBalance(result.ledger, 'village', 'wheat')).toBe(30);
  });

  it('does nothing on a bumper harvest with no wheat in store', () => {
    const ledger = createLedger();
    const result = applyHappeningEffect(happeningCard('bumper-harvest'), ledger, 0, {});
    expect(getBalance(result.ledger, 'village', 'wheat')).toBe(0);
  });

  it("raises every villager's fun on a visiting bard, capped at the maximum", () => {
    const villagerNeeds = {
      ada: { ...createNeeds(), fun: 50 },
      tobin: { ...createNeeds(), fun: 90 },
    };

    const result = applyHappeningEffect(
      happeningCard('visiting-bard'),
      createLedger(),
      0,
      villagerNeeds,
    );

    expect(result.villagerNeeds['ada']?.fun).toBe(80);
    expect(result.villagerNeeds['tobin']?.fun).toBe(100);
  });

  it('leaves the ledger and needs unchanged for an unrelated happening, or none at all', () => {
    const ledger = createLedger();
    const villagerNeeds = { ada: createNeeds() };

    const forOther = applyHappeningEffect(happeningCard('stray-cat'), ledger, 0, villagerNeeds);
    expect(forOther).toEqual({ ledger, villagerNeeds });

    const forNone = applyHappeningEffect(null, ledger, 0, villagerNeeds);
    expect(forNone).toEqual({ ledger, villagerNeeds });
  });
});

describe('runVillageDays', () => {
  it('runs 100 days quickly and deterministically for a given seed', () => {
    const start = performance.now();
    const a = runVillageDays(42, 100);
    const elapsedMs = performance.now() - start;

    expect(a.reports).toHaveLength(100);
    expect(elapsedMs).toBeLessThan(2000);

    const b = runVillageDays(42, 100);
    expect(a.reports.map((r) => r.weather.kind)).toEqual(b.reports.map((r) => r.weather.kind));
  });

  it('posts and eventually delivers downriver orders over enough days', () => {
    const { state } = runVillageDays(7, 60, {
      builtBuildingIds: ['town-hall', 'fields'],
      startingStock: [
        { account: 'treasury', item: 'coins', qty: 1000 },
        { account: 'village', item: 'wheat', qty: 500 },
        { account: 'village', item: 'bread', qty: 500 },
        { account: 'village', item: 'planks', qty: 500 },
        { account: 'village', item: 'stone', qty: 500 },
        { account: 'village', item: 'fish', qty: 500 },
      ],
    });

    expect(state.orders.orders.length).toBeGreaterThan(0);
    expect(state.chronicle.some((entry) => entry.kind === 'order-posted')).toBe(true);
  });

  it('archives a board post once it is past its retention window', () => {
    const village = createVillage(1);
    const withPost: VillageState = {
      ...village,
      board: { posts: [{ id: 1, author: 'ada', text: 'Hello.', postedDay: 0 }], nextId: 2 },
    };

    let state = withPost;
    for (let i = 0; i < 15; i++) {
      state = runVillageDay(state).state;
    }

    expect(state.board.posts).toEqual([]);
  });
});
