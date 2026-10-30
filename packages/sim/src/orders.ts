/**
 * Orders from the downriver town (spec section 6: "the downriver town
 * posts orders (goods, quantity, due day, reward). The Mayor accepts or
 * declines, and the boat delivers. Late orders pay half."). The spec
 * doesn't give a posting rate, lead time or reward formula, so this is a
 * documented first pass: a seeded daily chance of one new order, a lead
 * time window, and a reward scaled off the good's own base price.
 */

import { getGood, type GoodQuantity } from '@ai-village/content';
import { getBalance, MARKET_ACCOUNT, recordMovement, type LedgerState } from './ledger.js';
import { seededRandom, weightedPick } from './random.js';

export const ORDER_SOURCES = ['downriver', 'merchant', 'owner'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_STATUSES = ['pending', 'accepted', 'declined', 'delivered'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: number;
  source: OrderSource;
  items: readonly GoodQuantity[];
  reward: number;
  dueDay: number;
  status: OrderStatus;
}

export interface OrdersState {
  orders: readonly Order[];
  nextId: number;
}

export function createOrders(): OrdersState {
  return { orders: [], nextId: 1 };
}

const DOWNRIVER_ORDER_CHANCE = 0.2;
const ORDER_LEAD_DAYS_MIN = 5;
const ORDER_LEAD_DAYS_MAX = 10;
const ORDER_QTY_MIN = 5;
const ORDER_QTY_MAX = 20;
/** The reward per unit is this many times the good's base price - a markup to make fulfilling an order worthwhile. */
const ORDER_REWARD_MARKUP = 1.5;
/** Staples the downriver town might want - a first pass, not spec'd exactly. */
const ORDER_GOODS = ['wheat', 'bread', 'planks', 'stone', 'fish'] as const;

/** Maybe posts one new downriver order for the day, via a seeded roll. */
export function maybePostDownriverOrder(
  ordersState: OrdersState,
  villageSeed: number,
  day: number,
): OrdersState {
  const rng = seededRandom({ villageSeed, day, system: 'orders', entity: 'downriver' });
  if (rng() >= DOWNRIVER_ORDER_CHANCE) {
    return ordersState;
  }

  const good = weightedPick(
    ORDER_GOODS,
    ORDER_GOODS.map(() => 1),
    rng,
  );
  const qty = ORDER_QTY_MIN + Math.floor(rng() * (ORDER_QTY_MAX - ORDER_QTY_MIN + 1));
  const basePrice = getGood(good)?.basePrice ?? 1;
  const reward = Math.round(basePrice * qty * ORDER_REWARD_MARKUP);
  const leadDays =
    ORDER_LEAD_DAYS_MIN + Math.floor(rng() * (ORDER_LEAD_DAYS_MAX - ORDER_LEAD_DAYS_MIN + 1));

  const order: Order = {
    id: ordersState.nextId,
    source: 'downriver',
    items: [{ good, qty }],
    reward,
    dueDay: day + leadDays,
    status: 'pending',
  };

  return { orders: [...ordersState.orders, order], nextId: ordersState.nextId + 1 };
}

const LATE_REWARD_FRACTION = 0.5;

/** Delivers every accepted order the village now has the stock for, paying full reward on time and half once past its due day. */
export function deliverReadyOrders(
  ordersState: OrdersState,
  ledger: LedgerState,
  minute: number,
  day: number,
): { ordersState: OrdersState; ledger: LedgerState } {
  let nextLedger = ledger;

  const nextOrders = ordersState.orders.map((order) => {
    if (order.status !== 'accepted') {
      return order;
    }
    const hasStock = order.items.every(
      (item) => getBalance(nextLedger, 'village', item.good) >= item.qty,
    );
    if (!hasStock) {
      return order;
    }

    for (const item of order.items) {
      nextLedger = recordMovement(nextLedger, {
        minute,
        from: 'village',
        to: MARKET_ACCOUNT,
        item: item.good,
        qty: item.qty,
        reason: `order ${order.id} delivered`,
      });
    }

    const reward =
      day > order.dueDay ? Math.round(order.reward * LATE_REWARD_FRACTION) : order.reward;
    if (reward > 0) {
      nextLedger = recordMovement(nextLedger, {
        minute,
        from: MARKET_ACCOUNT,
        to: 'treasury',
        item: 'coins',
        qty: reward,
        reason: `order ${order.id} reward`,
      });
    }

    return { ...order, status: 'delivered' as const };
  });

  return { ordersState: { ...ordersState, orders: nextOrders }, ledger: nextLedger };
}
