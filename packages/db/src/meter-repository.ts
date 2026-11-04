import { gte } from 'drizzle-orm';
import type { Database } from './client.js';
import * as schema from './schema.js';

/**
 * One metered model call (spec section 16). Mirrors `@ai-village/agent`'s
 * `MeterRecord`, restated since `db` may only import `content`.
 */
export interface MeterRow {
  at: number;
  purpose: string;
  villagerId: string | null;
  model: string;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  tokensReasoning: number;
  costUsd: number;
  ms: number;
}

/** Adds calls to the meter. The meter only ever grows - nothing is rewritten. */
export async function appendMeter(db: Database, rows: readonly MeterRow[]): Promise<void> {
  if (rows.length > 0) {
    await db.insert(schema.meter).values([...rows]);
  }
}

/** Every call made at or after `sinceMs`, oldest first - enough to check a budget. */
export async function loadMeterSince(db: Database, sinceMs: number): Promise<MeterRow[]> {
  const rows = await db
    .select()
    .from(schema.meter)
    .where(gte(schema.meter.at, sinceMs))
    .orderBy(schema.meter.id)
    .all();
  return rows.map(({ id: _id, ...row }) => row);
}
