import type { Database } from './client.js';
import * as schema from './schema.js';

/**
 * One approval as stored (spec section 4's `approvals` table). Mirrors
 * `@ai-village/agent`'s `ApprovalRequest`, restated in plain shapes since
 * `db` may only import `content` (spec section 3); the mapping lives in
 * `apps/server`.
 */
export interface ApprovalRow {
  id: number;
  toolId: string;
  args: unknown;
  risk: string;
  preview: string | null;
  requestedBy: string;
  status: string;
  createdAt: number;
}

/** Replaces every stored approval in one transaction. */
export async function saveApprovals(db: Database, rows: readonly ApprovalRow[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.approvals);
    if (rows.length > 0) {
      await tx
        .insert(schema.approvals)
        .values(rows.map((row) => ({ ...row, args: JSON.stringify(row.args) })));
    }
  });
}

/** Every stored approval, oldest first. */
export async function loadApprovals(db: Database): Promise<ApprovalRow[]> {
  const rows = await db.select().from(schema.approvals).orderBy(schema.approvals.id).all();
  return rows.map((row) => ({ ...row, args: JSON.parse(row.args) as unknown }));
}
