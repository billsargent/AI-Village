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
  /** Wall-clock ms when this village was last saved, for catch-up on the next start. */
  savedAtRealMs: real('saved_at_real_ms'),
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

/**
 * A single row: the owner's settings, including the DeepSeek API key.
 * Spec section 3/4 says secrets belong in the OS keychain, never the
 * database - this project's owner explicitly chose to store it here
 * instead (session decision, not a spec change), so it's called out
 * plainly rather than silently matching the spec's own stated design.
 * Defense in depth still applies: `apps/server`'s routes never echo
 * this value back to the browser, only whether one is set.
 */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  deepseekApiKey: text('deepseek_api_key'),
  /** Whether the Mayor takes a model turn each village morning. Off until the owner turns it on. */
  mayorAutonomy: integer('mayor_autonomy', { mode: 'boolean' }).notNull().default(false),
  /** Spec section 16's monthly ceiling: "Set at first run" - so unset until the owner sets it. */
  monthlyCeilingUsd: real('monthly_ceiling_usd'),
});

/** Spec section 16's meter: every model call's purpose, villager, tokens, cost and time. */
export const meter = sqliteTable('meter', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: real('at').notNull(),
  purpose: text('purpose').notNull(),
  villagerId: text('villager_id'),
  model: text('model').notNull(),
  tokensIn: integer('tokens_in').notNull(),
  tokensCached: integer('tokens_cached').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  tokensReasoning: integer('tokens_reasoning').notNull(),
  costUsd: real('cost_usd').notNull(),
  ms: real('ms').notNull(),
});

/** Spec section 4's `approvals` table: tool calls waiting on, or decided by, the owner. */
export const approvals = sqliteTable('approvals', {
  id: integer('id').primaryKey(),
  toolId: text('tool_id').notNull(),
  /** JSON-encoded tool arguments, exactly as the model sent them. */
  args: text('args').notNull(),
  risk: text('risk').notNull(),
  preview: text('preview'),
  requestedBy: text('requested_by').notNull(),
  status: text('status').notNull(),
  createdAt: real('created_at').notNull(),
});

export const workRequests = sqliteTable('work_requests', {
  id: integer('id').primaryKey(),
  villagerId: text('villager_id').notNull(),
  description: text('description').notNull(),
  requestedMinute: real('requested_minute').notNull(),
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
