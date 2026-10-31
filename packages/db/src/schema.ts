import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle schema for what the sim already simulates (spec section 4,
 * scoped down): the clock, built buildings, villagers, their needs and
 * relationships, the ledger and its balance cache, weather history and
 * the chronicle. The agent/owner tables (turns, approvals, meter,
 * settings, ...) are added once the agent layer needs them.
 *
 * This package may only import `content` (spec section 3's package
 * table): it never imports `sim`, so these tables are defined in their
 * own plain shapes rather than the sim's in-memory types. Mapping between
 * the two lives in `apps/server`, which may import both.
 */

/** A single row: there is one village per database. */
export const clock = sqliteTable('clock', {
  id: integer('id').primaryKey(),
  villageSeed: integer('village_seed').notNull(),
  minute: real('minute').notNull(),
  speed: integer('speed').notNull(),
  paused: integer('paused', { mode: 'boolean' }).notNull(),
  storytellerStyle: text('storyteller_style').notNull(),
  daysSinceLastHappening: integer('days_since_last_happening').notNull(),
});

export const builtBuildings = sqliteTable('built_buildings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  buildingId: text('building_id').notNull(),
});

export const villagers = sqliteTable('villagers', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id').notNull(),
  skillLevel: integer('skill_level').notNull(),
  hasTool: integer('has_tool', { mode: 'boolean' }).notNull(),
  role: text('role').notNull().default('villager'),
});

export const needs = sqliteTable('needs', {
  villagerId: text('villager_id').primaryKey(),
  hunger: real('hunger').notNull(),
  energy: real('energy').notNull(),
  social: real('social').notNull(),
  fun: real('fun').notNull(),
  comfort: real('comfort').notNull(),
  purpose: real('purpose').notNull(),
});

export const relationships = sqliteTable('relationships', {
  pairKey: text('pair_key').primaryKey(),
  a: text('a').notNull(),
  b: text('b').notNull(),
  affinity: real('affinity').notNull(),
  familiarity: real('familiarity').notNull(),
  sweetheartSinceDay: integer('sweetheart_since_day'),
});

export const ledger = sqliteTable('ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  minute: real('minute').notNull(),
  fromAccount: text('from_account').notNull(),
  toAccount: text('to_account').notNull(),
  item: text('item').notNull(),
  qty: real('qty').notNull(),
  reason: text('reason').notNull(),
  ref: text('ref'),
});

export const balances = sqliteTable(
  'balances',
  {
    account: text('account').notNull(),
    item: text('item').notNull(),
    qty: real('qty').notNull(),
  },
  (table) => [primaryKey({ columns: [table.account, table.item] })],
);

export const weatherDays = sqliteTable('weather_days', {
  day: integer('day').primaryKey(),
  kind: text('kind').notNull(),
});

export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey(),
  source: text('source').notNull(),
  /** JSON-encoded array of { good, qty }. */
  items: text('items').notNull(),
  reward: real('reward').notNull(),
  dueDay: integer('due_day').notNull(),
  status: text('status').notNull(),
});

export const board = sqliteTable('board', {
  id: integer('id').primaryKey(),
  author: text('author').notNull(),
  text: text('text').notNull(),
  postedDay: integer('posted_day').notNull(),
});

export const memories = sqliteTable('memories', {
  id: integer('id').primaryKey(),
  villagerId: text('villager_id').notNull(),
  minute: real('minute').notNull(),
  text: text('text').notNull(),
  importance: integer('importance').notNull(),
  about: text('about'),
  lastRecalledMinute: real('last_recalled_minute'),
});

export const promises = sqliteTable('promises', {
  id: integer('id').primaryKey(),
  villagerId: text('villager_id').notNull(),
  text: text('text').notNull(),
  createdMinute: real('created_minute').notNull(),
  dueMinute: real('due_minute').notNull(),
  status: text('status').notNull(),
});

export const chronicle = sqliteTable('chronicle', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  minute: real('minute').notNull(),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  /** JSON-encoded array of villager ids. */
  actors: text('actors').notNull(),
  importance: integer('importance').notNull(),
  public: integer('public', { mode: 'boolean' }).notNull(),
});
