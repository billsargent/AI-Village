import type { VillageSnapshot } from '@ai-village/db';
import type {
  ClockState,
  LedgerState,
  Order,
  OrdersState,
  Relationships,
  VillageState,
  WeatherDay,
} from '@ai-village/sim';

/**
 * Maps between the sim's in-memory `VillageState` and the db package's
 * plain `VillageSnapshot` rows. This lives in `apps/server` because `db`
 * may only import `content` (spec section 3's package table) and must
 * never import `sim`; `server` may import everything, so the mapping has
 * to live on this side of the boundary.
 */

export function toSnapshot(state: VillageState): VillageSnapshot {
  return {
    clock: {
      villageSeed: state.villageSeed,
      minute: state.clock.minute,
      speed: state.clock.speed,
      paused: state.clock.paused,
      storytellerStyle: state.storytellerStyle,
      daysSinceLastHappening: state.daysSinceLastHappening,
    },
    builtBuildingIds: state.builtBuildingIds,
    villagers: state.villagers.map((villager) => ({
      id: villager.villagerId,
      tradeId: villager.tradeId,
      skillLevel: villager.skillLevel,
      hasTool: villager.hasTool,
    })),
    needs: Object.entries(state.villagerNeeds).map(([villagerId, needs]) => ({
      villagerId,
      ...needs,
    })),
    relationships: Object.entries(state.relationships).map(([pairKey, relationship]) => {
      const [a, b] = pairKey.split('::') as [string, string];
      return { pairKey, a, b, ...relationship };
    }),
    ledger: state.ledger.entries.map((entry) => ({
      minute: entry.minute,
      fromAccount: entry.from,
      toAccount: entry.to,
      item: entry.item,
      qty: entry.qty,
      reason: entry.reason,
      ref: entry.ref ?? null,
    })),
    balances: Object.entries(state.ledger.balances).map(([key, qty]) => {
      const [account, item] = key.split('::') as [string, string];
      return { account, item, qty };
    }),
    weatherDays: state.weatherHistory.map((day) => ({ day: day.day, kind: day.kind })),
    chronicle: state.chronicle.map((entry) => ({
      minute: entry.minute,
      kind: entry.kind,
      text: entry.text,
      actors: entry.actors,
      importance: entry.importance,
      public: entry.public,
    })),
    orders: state.orders.orders.map((order) => ({
      id: order.id,
      source: order.source,
      items: order.items,
      reward: order.reward,
      dueDay: order.dueDay,
      status: order.status,
    })),
  };
}

export function fromSnapshot(snapshot: VillageSnapshot): VillageState {
  const clock: ClockState = {
    minute: snapshot.clock.minute,
    speed: snapshot.clock.speed as ClockState['speed'],
    paused: snapshot.clock.paused,
  };

  let nextId = 1;
  const entries = snapshot.ledger.map((row) => {
    const id = nextId;
    nextId += 1;
    return {
      id,
      minute: row.minute,
      from: row.fromAccount,
      to: row.toAccount,
      item: row.item,
      qty: row.qty,
      reason: row.reason,
      ...(row.ref !== null ? { ref: row.ref } : {}),
    };
  });
  const balances: Record<string, number> = {};
  for (const balance of snapshot.balances) {
    balances[`${balance.account}::${balance.item}`] = balance.qty;
  }
  const ledger: LedgerState = { entries, balances, nextId };

  const weatherHistory: WeatherDay[] = snapshot.weatherDays.map((row) => ({
    day: row.day,
    kind: row.kind as WeatherDay['kind'],
  }));

  const relationships: Relationships = Object.fromEntries(
    snapshot.relationships.map((row) => [
      row.pairKey,
      {
        affinity: row.affinity,
        familiarity: row.familiarity,
        sweetheartSinceDay: row.sweetheartSinceDay,
      },
    ]),
  );

  const orderRows: readonly Order[] = snapshot.orders.map((row) => ({
    id: row.id,
    source: row.source as Order['source'],
    items: row.items,
    reward: row.reward,
    dueDay: row.dueDay,
    status: row.status as Order['status'],
  }));
  const orders: OrdersState = {
    orders: orderRows,
    nextId: orderRows.reduce((max, order) => Math.max(max, order.id + 1), 1),
  };

  return {
    villageSeed: snapshot.clock.villageSeed,
    clock,
    ledger,
    weatherHistory,
    villagers: snapshot.villagers.map((row) => ({
      villagerId: row.id,
      tradeId: row.tradeId,
      skillLevel: row.skillLevel,
      hasTool: row.hasTool,
      moodFactor: 1,
    })),
    villagerNeeds: Object.fromEntries(
      snapshot.needs.map((row) => [
        row.villagerId,
        {
          hunger: row.hunger,
          energy: row.energy,
          social: row.social,
          fun: row.fun,
          comfort: row.comfort,
          purpose: row.purpose,
        },
      ]),
    ),
    builtBuildingIds: snapshot.builtBuildingIds,
    storytellerStyle: snapshot.clock.storytellerStyle as VillageState['storytellerStyle'],
    chronicle: snapshot.chronicle.map((entry) => ({
      minute: entry.minute,
      kind: entry.kind,
      text: entry.text,
      actors: entry.actors,
      importance: entry.importance,
      public: entry.public,
    })),
    daysSinceLastHappening: snapshot.clock.daysSinceLastHappening,
    relationships,
    orders,
  };
}
