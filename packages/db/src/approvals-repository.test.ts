import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { loadApprovals, saveApprovals, type ApprovalRow } from './approvals-repository.js';
import { closeDatabase, migrationsFolderPath, openAndMigrate, type Database } from './client.js';

let tempDir: string | undefined;
let openClient: Client | undefined;

afterEach(() => {
  if (openClient) {
    closeDatabase(openClient);
    openClient = undefined;
  }
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // The native libsql binding can release its file handle a moment
      // after close() returns, especially on Windows; harmless.
    }
    tempDir = undefined;
  }
});

async function freshDatabase(): Promise<Database> {
  tempDir = mkdtempSync(join(tmpdir(), 'ai-village-approvals-test-'));
  const { db, client } = await openAndMigrate(join(tempDir, 'village.db'), migrationsFolderPath());
  openClient = client;
  return db;
}

const HIRE: ApprovalRow = {
  id: 1,
  toolId: 'propose_hire',
  args: { tradeId: 'fisher', reason: 'nobody fishes yet' },
  risk: 'medium',
  preview: 'Hire a fisher: nobody fishes yet',
  requestedBy: 'hesper',
  status: 'pending',
  createdAt: 1_800_000_000_000,
};

describe('saveApprovals / loadApprovals', () => {
  it('starts empty', async () => {
    expect(await loadApprovals(await freshDatabase())).toEqual([]);
  });

  it('round-trips approvals, args and all', async () => {
    const db = await freshDatabase();
    const declined = { ...HIRE, id: 2, status: 'declined', preview: null, args: 'not json' };
    await saveApprovals(db, [HIRE, declined]);
    expect(await loadApprovals(db)).toEqual([HIRE, declined]);
  });

  it('replaces what was there rather than appending', async () => {
    const db = await freshDatabase();
    await saveApprovals(db, [HIRE]);
    await saveApprovals(db, [{ ...HIRE, status: 'approved' }]);
    expect(await loadApprovals(db)).toEqual([{ ...HIRE, status: 'approved' }]);
  });
});
