import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, migrationsFolderPath, openAndMigrate, type Database } from './client.js';

let tempDir: string | undefined;
let openClients: Client[] = [];

afterEach(() => {
  for (const client of openClients) {
    closeDatabase(client);
  }
  openClients = [];
  if (tempDir) {
    // The native libsql binding can release its file handle a moment after
    // close() returns, especially on Windows; a leftover temp dir is
    // harmless, so a cleanup failure here shouldn't fail the test.
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    tempDir = undefined;
  }
});

async function trackedOpenAndMigrate(dbPath: string, migrationsFolder: string): Promise<Database> {
  const { db, client } = await openAndMigrate(dbPath, migrationsFolder);
  openClients.push(client);
  return db;
}

describe('openAndMigrate', () => {
  it('creates a fresh database and applies migrations', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ai-village-db-test-'));
    const dbPath = join(tempDir, 'village.db');

    const db = await trackedOpenAndMigrate(dbPath, migrationsFolderPath());
    expect(db).toBeDefined();
    expect(existsSync(dbPath)).toBe(true);
  });

  it('backs up an existing database before migrating again, and running it twice is a no-op', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ai-village-db-test-'));
    const dbPath = join(tempDir, 'village.db');

    await trackedOpenAndMigrate(dbPath, migrationsFolderPath());
    const first = openClients.pop();
    if (first) closeDatabase(first);
    const second = await trackedOpenAndMigrate(dbPath, migrationsFolderPath());

    expect(existsSync(`${dbPath}.bak`)).toBe(true);
    // The schema is still intact and queryable after a second migration run
    // that has nothing new to apply.
    const { loadVillage } = await import('./village-repository.js');
    expect(await loadVillage(second)).toBeNull();
  });
});
