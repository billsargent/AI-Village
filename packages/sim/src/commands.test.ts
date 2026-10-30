import { describe, expect, it } from 'vitest';
import { apply, CommandError } from './commands.js';
import { getBalance, InsufficientBalanceError } from './ledger.js';
import type { Order } from './orders.js';
import { getRelationship } from './relationships.js';
import { createVillage, type VillageState } from './systems.js';

function villageWithOrder(order: Partial<Order> = {}): VillageState {
  const village = createVillage(1);
  const fullOrder: Order = {
    id: 1,
    source: 'downriver',
    items: [{ good: 'bread', qty: 10 }],
    reward: 20,
    dueDay: 20,
    status: 'pending',
    ...order,
  };
  return { ...village, orders: { orders: [fullOrder], nextId: 2 } };
}

function villageWithTwo() {
  return createVillage(1, {
    villagers: [
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
    ],
    startingStock: [{ account: 'villager:ada', item: 'bread', qty: 3 }],
  });
}

describe('apply GiveGift', () => {
  it('moves the good between the two villagers and raises their affinity', () => {
    const village = villageWithTwo();
    const { state, events } = apply(village, {
      kind: 'GiveGift',
      from: 'ada',
      to: 'tobin',
      item: 'bread',
      qty: 2,
    });

    expect(getBalance(state.ledger, 'villager:ada', 'bread')).toBe(1);
    expect(getBalance(state.ledger, 'villager:tobin', 'bread')).toBe(2);
    expect(getRelationship(state.relationships, 'ada', 'tobin').affinity).toBeGreaterThan(0);
    expect(events).toEqual([
      { kind: 'GiftGiven', from: 'ada', to: 'tobin', item: 'bread', qty: 2 },
    ]);
  });

  it('appends a public chronicle entry', () => {
    const village = villageWithTwo();
    const { state } = apply(village, {
      kind: 'GiveGift',
      from: 'ada',
      to: 'tobin',
      item: 'bread',
      qty: 1,
    });
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'gift', public: true });
  });

  it('rejects a gift to self', () => {
    const village = villageWithTwo();
    expect(() =>
      apply(village, { kind: 'GiveGift', from: 'ada', to: 'ada', item: 'bread', qty: 1 }),
    ).toThrow(CommandError);
  });

  it('rejects an unknown villager', () => {
    const village = villageWithTwo();
    expect(() =>
      apply(village, { kind: 'GiveGift', from: 'ada', to: 'nobody', item: 'bread', qty: 1 }),
    ).toThrow(CommandError);
  });

  it('rejects an unknown good', () => {
    const village = villageWithTwo();
    expect(() =>
      apply(village, { kind: 'GiveGift', from: 'ada', to: 'tobin', item: 'dragons', qty: 1 }),
    ).toThrow(CommandError);
  });

  it("rejects a gift the giver can't afford, via the ledger's own balance check", () => {
    const village = villageWithTwo();
    expect(() =>
      apply(village, { kind: 'GiveGift', from: 'ada', to: 'tobin', item: 'bread', qty: 99 }),
    ).toThrow(InsufficientBalanceError);
  });
});

describe('apply ProposeBuilding', () => {
  it('charges coins and materials and adds the building once built', () => {
    const village = createVillage(1, {
      startingStock: [
        { account: 'treasury', item: 'coins', qty: 100 },
        { account: 'village', item: 'planks', qty: 20 },
      ],
    });

    const { state, events } = apply(village, { kind: 'ProposeBuilding', buildingId: 'cottage' });

    expect(state.builtBuildingIds).toContain('cottage');
    expect(getBalance(state.ledger, 'treasury', 'coins')).toBe(60);
    expect(getBalance(state.ledger, 'village', 'planks')).toBe(0);
    expect(events).toEqual([{ kind: 'BuildingFinished', buildingId: 'cottage' }]);
  });

  it('rejects an unknown building', () => {
    const village = createVillage(1);
    expect(() => apply(village, { kind: 'ProposeBuilding', buildingId: 'castle' })).toThrow(
      CommandError,
    );
  });

  it('rejects a building that is already built', () => {
    const village = createVillage(1, { builtBuildingIds: ['town-hall'] });
    expect(() => apply(village, { kind: 'ProposeBuilding', buildingId: 'town-hall' })).toThrow(
      CommandError,
    );
  });

  it('allows a second instance of a multi-instance building, like fields', () => {
    const village = createVillage(1, {
      builtBuildingIds: ['fields'],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 100 }],
    });
    const { state } = apply(village, { kind: 'ProposeBuilding', buildingId: 'fields' });
    expect(state.builtBuildingIds).toEqual(['fields', 'fields']);
  });

  it('rejects a building whose population requirement is not met', () => {
    const village = createVillage(1, {
      startingStock: [{ account: 'treasury', item: 'coins', qty: 1000 }],
    });
    expect(() => apply(village, { kind: 'ProposeBuilding', buildingId: 'bakery' })).toThrow(
      /population/,
    );
  });

  it("rejects a building the treasury can't afford, via the ledger's own balance check", () => {
    const village = createVillage(1);
    expect(() => apply(village, { kind: 'ProposeBuilding', buildingId: 'cottage' })).toThrow(
      InsufficientBalanceError,
    );
  });
});

describe('apply AcceptOrder / DeclineOrder', () => {
  it('accepts a pending order', () => {
    const village = villageWithOrder();
    const { state, events } = apply(village, { kind: 'AcceptOrder', orderId: 1 });
    expect(state.orders.orders[0]?.status).toBe('accepted');
    expect(events).toEqual([{ kind: 'OrderAccepted', orderId: 1 }]);
  });

  it('declines a pending order', () => {
    const village = villageWithOrder();
    const { state, events } = apply(village, { kind: 'DeclineOrder', orderId: 1 });
    expect(state.orders.orders[0]?.status).toBe('declined');
    expect(events).toEqual([{ kind: 'OrderDeclined', orderId: 1 }]);
  });

  it('appends a public chronicle entry', () => {
    const village = villageWithOrder();
    const { state } = apply(village, { kind: 'AcceptOrder', orderId: 1 });
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'order-decision', public: true });
  });

  it('rejects an unknown order', () => {
    const village = createVillage(1);
    expect(() => apply(village, { kind: 'AcceptOrder', orderId: 99 })).toThrow(CommandError);
  });

  it('rejects deciding on an order that is not pending', () => {
    const village = villageWithOrder({ status: 'accepted' });
    expect(() => apply(village, { kind: 'AcceptOrder', orderId: 1 })).toThrow(CommandError);
    expect(() => apply(village, { kind: 'DeclineOrder', orderId: 1 })).toThrow(CommandError);
  });
});

describe('apply PostOnBoard', () => {
  it('appends a post to the board', () => {
    const village = villageWithTwo();
    const { state, events } = apply(village, {
      kind: 'PostOnBoard',
      author: 'ada',
      text: 'Meeting Starday at noon.',
    });
    expect(state.board.posts).toEqual([
      { id: 1, author: 'ada', text: 'Meeting Starday at noon.', postedDay: 0 },
    ]);
    expect(events).toEqual([{ kind: 'PostedOnBoard', postId: 1 }]);
  });

  it('appends a public chronicle entry', () => {
    const village = villageWithTwo();
    const { state } = apply(village, { kind: 'PostOnBoard', author: 'ada', text: 'Hello.' });
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'board-post', public: true });
  });

  it('rejects an unknown villager', () => {
    const village = villageWithTwo();
    expect(() => apply(village, { kind: 'PostOnBoard', author: 'nobody', text: 'Hello.' })).toThrow(
      CommandError,
    );
  });

  it('rejects an empty post', () => {
    const village = villageWithTwo();
    expect(() => apply(village, { kind: 'PostOnBoard', author: 'ada', text: '   ' })).toThrow(
      CommandError,
    );
  });
});
