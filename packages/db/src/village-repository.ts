import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

/**
 * Plain row shapes for everything the sim simulates (spec section 4,
 * scoped down). These mirror `packages/sim`'s in-memory types but are
 * defined independently, since `db` may only import `content` (spec
 * section 3) and must never import `sim`. The mapping between the two
 * lives in `apps/server`.
 */

export interface ClockRow {
  villageSeed: number;
  minute: number;
  speed: number;
  paused: boolean;
  storytellerStyle: string;
  daysSinceLastHappening: number;
}

export interface VillagerRow {
  id: string;
  tradeId: string;
  skillLevel: number;
  hasTool: boolean;
  role: string;
}

export interface NeedsRow {
  villagerId: string;
  hunger: number;
  energy: number;
  social: number;
  fun: number;
  comfort: number;
  purpose: number;
}

export interface RelationshipRow {
  pairKey: string;
  a: string;
  b: string;
  affinity: number;
  familiarity: number;
  sweetheartSinceDay: number | null;
}

export interface LedgerEntryRow {
  minute: number;
  fromAccount: string;
  toAccount: string;
  item: string;
  qty: number;
  reason: string;
  ref: string | null;
}

export interface BalanceRow {
  account: string;
  item: string;
  qty: number;
}

export interface WeatherDayRow {
  day: number;
  kind: string;
}

export interface ChronicleEntryRow {
  minute: number;
  kind: string;
  text: string;
  actors: readonly string[];
  importance: number;
  public: boolean;
}

export interface OrderRow {
  id: number;
  source: string;
  items: readonly { good: string; qty: number }[];
  reward: number;
  dueDay: number;
  status: string;
}

export interface BoardPostRow {
  id: number;
  author: string;
  text: string;
  postedDay: number;
}

export interface MemoryRow {
  id: number;
  villagerId: string;
  minute: number;
  text: string;
  importance: number;
  about: string | null;
  lastRecalledMinute: number | null;
}

export interface PromiseRow {
  id: number;
  villagerId: string;
  text: string;
  createdMinute: number;
  dueMinute: number;
  status: string;
}

export interface VillageSnapshot {
  clock: ClockRow;
  builtBuildingIds: readonly string[];
  villagers: readonly VillagerRow[];
  needs: readonly NeedsRow[];
  relationships: readonly RelationshipRow[];
  ledger: readonly LedgerEntryRow[];
  balances: readonly BalanceRow[];
  weatherDays: readonly WeatherDayRow[];
  chronicle: readonly ChronicleEntryRow[];
  orders: readonly OrderRow[];
  board: readonly BoardPostRow[];
  memories: readonly MemoryRow[];
  promises: readonly PromiseRow[];
}

const CLOCK_ROW_ID = 1;

/** Replaces the whole village snapshot in one transaction. */
export async function saveVillage(db: Database, snapshot: VillageSnapshot): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.clock);
    await tx.insert(schema.clock).values({ id: CLOCK_ROW_ID, ...snapshot.clock });

    await tx.delete(schema.builtBuildings);
    if (snapshot.builtBuildingIds.length > 0) {
      await tx
        .insert(schema.builtBuildings)
        .values(snapshot.builtBuildingIds.map((buildingId) => ({ buildingId })));
    }

    await tx.delete(schema.villagers);
    if (snapshot.villagers.length > 0) {
      await tx.insert(schema.villagers).values([...snapshot.villagers]);
    }

    await tx.delete(schema.needs);
    if (snapshot.needs.length > 0) {
      await tx.insert(schema.needs).values([...snapshot.needs]);
    }

    await tx.delete(schema.relationships);
    if (snapshot.relationships.length > 0) {
      await tx.insert(schema.relationships).values([...snapshot.relationships]);
    }

    await tx.delete(schema.ledger);
    if (snapshot.ledger.length > 0) {
      await tx.insert(schema.ledger).values([...snapshot.ledger]);
    }

    await tx.delete(schema.balances);
    if (snapshot.balances.length > 0) {
      await tx.insert(schema.balances).values([...snapshot.balances]);
    }

    await tx.delete(schema.weatherDays);
    if (snapshot.weatherDays.length > 0) {
      await tx.insert(schema.weatherDays).values([...snapshot.weatherDays]);
    }

    await tx.delete(schema.chronicle);
    if (snapshot.chronicle.length > 0) {
      await tx
        .insert(schema.chronicle)
        .values(
          snapshot.chronicle.map((entry) => ({ ...entry, actors: JSON.stringify(entry.actors) })),
        );
    }

    await tx.delete(schema.orders);
    if (snapshot.orders.length > 0) {
      await tx
        .insert(schema.orders)
        .values(snapshot.orders.map((order) => ({ ...order, items: JSON.stringify(order.items) })));
    }

    await tx.delete(schema.board);
    if (snapshot.board.length > 0) {
      await tx.insert(schema.board).values([...snapshot.board]);
    }

    await tx.delete(schema.memories);
    if (snapshot.memories.length > 0) {
      await tx.insert(schema.memories).values([...snapshot.memories]);
    }

    await tx.delete(schema.promises);
    if (snapshot.promises.length > 0) {
      await tx.insert(schema.promises).values([...snapshot.promises]);
    }
  });
}

/** Loads the whole village snapshot, or null if none has been saved yet. */
export async function loadVillage(db: Database): Promise<VillageSnapshot | null> {
  const clockRow = await db
    .select()
    .from(schema.clock)
    .where(eq(schema.clock.id, CLOCK_ROW_ID))
    .get();
  if (!clockRow) {
    return null;
  }

  const builtBuildingRows = await db.select().from(schema.builtBuildings).all();
  const villagerRows = await db.select().from(schema.villagers).all();
  const needsRows = await db.select().from(schema.needs).all();
  const relationshipRows = await db.select().from(schema.relationships).all();
  const ledgerRows = await db.select().from(schema.ledger).all();
  const balanceRows = await db.select().from(schema.balances).all();
  const weatherRows = await db.select().from(schema.weatherDays).all();
  const chronicleRows = await db.select().from(schema.chronicle).all();
  const orderRows = await db.select().from(schema.orders).all();
  const boardRows = await db.select().from(schema.board).all();
  const memoryRows = await db.select().from(schema.memories).all();
  const promiseRows = await db.select().from(schema.promises).all();

  return {
    clock: {
      villageSeed: clockRow.villageSeed,
      minute: clockRow.minute,
      speed: clockRow.speed,
      paused: clockRow.paused,
      storytellerStyle: clockRow.storytellerStyle,
      daysSinceLastHappening: clockRow.daysSinceLastHappening,
    },
    builtBuildingIds: builtBuildingRows.map((row) => row.buildingId),
    villagers: villagerRows,
    needs: needsRows,
    relationships: relationshipRows,
    ledger: ledgerRows.map((row) => ({
      minute: row.minute,
      fromAccount: row.fromAccount,
      toAccount: row.toAccount,
      item: row.item,
      qty: row.qty,
      reason: row.reason,
      ref: row.ref,
    })),
    balances: balanceRows,
    weatherDays: weatherRows,
    chronicle: chronicleRows.map((row) => ({
      minute: row.minute,
      kind: row.kind,
      text: row.text,
      actors: JSON.parse(row.actors) as string[],
      importance: row.importance,
      public: row.public,
    })),
    orders: orderRows.map((row) => ({
      id: row.id,
      source: row.source,
      items: JSON.parse(row.items) as { good: string; qty: number }[],
      reward: row.reward,
      dueDay: row.dueDay,
      status: row.status,
    })),
    board: boardRows,
    memories: memoryRows,
    promises: promiseRows,
  };
}
