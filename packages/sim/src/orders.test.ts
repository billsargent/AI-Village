import { describe, expect, it } from 'vitest';
import { createLedger, getBalance, MARKET_ACCOUNT, recordMovement } from './ledger.js';
import {
  createOrders,
  deliverReadyOrders,
  maybePostDownriverOrder,
  type Order,
  type OrdersState,
} from './orders.js';

describe('maybePostDownriverOrder', () => {
  it('posts at most one order a day, deterministically for a given seed/day', () => {
    const a = maybePostDownriverOrder(createOrders(), 1, 0);
    const b = maybePostDownriverOrder(createOrders(), 1, 0);
    expect(a).toEqual(b);
  });

  it('posts a pending order with a positive qty, reward and a due day after today', () => {
    let state = createOrders();
    let posted: Order | undefined;
    let postedOnDay = -1;
    for (let day = 0; day < 100 && !posted; day++) {
      state = maybePostDownriverOrder(state, 1, day);
      posted = state.orders.at(-1);
      postedOnDay = day;
    }
    expect(posted).toBeDefined();
    expect(posted?.status).toBe('pending');
    expect(posted?.source).toBe('downriver');
    expect(posted?.items.length).toBeGreaterThan(0);
    expect(posted?.items[0]?.qty).toBeGreaterThan(0);
    expect(posted?.reward).toBeGreaterThan(0);
    expect(posted?.dueDay).toBeGreaterThan(postedOnDay);
  });

  it('assigns increasing ids and never posts twice into the same state in one call', () => {
    let state = createOrders();
    for (let day = 0; day < 50; day++) {
      state = maybePostDownriverOrder(state, 1, day);
    }
    const ids = state.orders.map((order) => order.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.nextId).toBe(Math.max(0, ...ids) + 1);
  });
});

describe('deliverReadyOrders', () => {
  function stateWithAcceptedOrder(qty: number, stock: number, dueDay: number): OrdersState {
    const order: Order = {
      id: 1,
      source: 'downriver',
      items: [{ good: 'bread', qty }],
      reward: 20,
      dueDay,
      status: 'accepted',
    };
    return { orders: [order], nextId: 2 };
  }

  it('delivers an accepted order once the village has the stock, paying the full reward on time', () => {
    const ledger = recordMovement(createLedger(), {
      minute: 0,
      from: MARKET_ACCOUNT,
      to: 'village',
      item: 'bread',
      qty: 10,
      reason: 'opening stock',
    });
    const ordersState = stateWithAcceptedOrder(10, 10, 20);

    const result = deliverReadyOrders(ordersState, ledger, 0, 5);

    expect(result.ordersState.orders[0]?.status).toBe('delivered');
    expect(getBalance(result.ledger, 'village', 'bread')).toBe(0);
    expect(getBalance(result.ledger, 'treasury', 'coins')).toBe(20);
  });

  it('pays half the reward once delivered past the due day', () => {
    const ledger = recordMovement(createLedger(), {
      minute: 0,
      from: MARKET_ACCOUNT,
      to: 'village',
      item: 'bread',
      qty: 10,
      reason: 'opening stock',
    });
    const ordersState = stateWithAcceptedOrder(10, 10, 5);

    const result = deliverReadyOrders(ordersState, ledger, 0, 10);

    expect(getBalance(result.ledger, 'treasury', 'coins')).toBe(10);
  });

  it('leaves an accepted order waiting when the village lacks the stock', () => {
    const ledger = createLedger();
    const ordersState = stateWithAcceptedOrder(10, 0, 20);

    const result = deliverReadyOrders(ordersState, ledger, 0, 5);

    expect(result.ordersState.orders[0]?.status).toBe('accepted');
  });

  it('leaves pending and declined orders untouched', () => {
    const ledger = createLedger();
    const pending: Order = {
      id: 1,
      source: 'downriver',
      items: [{ good: 'bread', qty: 1 }],
      reward: 5,
      dueDay: 20,
      status: 'pending',
    };
    const declined: Order = { ...pending, id: 2, status: 'declined' };
    const ordersState: OrdersState = { orders: [pending, declined], nextId: 3 };

    const result = deliverReadyOrders(ordersState, ledger, 0, 5);

    expect(result.ordersState.orders).toEqual([pending, declined]);
  });
});
