import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, migrationsFolderPath, openAndMigrate, type Database } from './client.js';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from './settings-repository.js';

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
      // after close() returns, especially on Windows; a leftover temp dir
      // is harmless, so a cleanup failure here shouldn't fail the test.
    }
    tempDir = undefined;
  }
});

async function freshDatabase(): Promise<Database> {
  tempDir = mkdtempSync(join(tmpdir(), 'ai-village-settings-test-'));
  const { db, client } = await openAndMigrate(join(tempDir, 'village.db'), migrationsFolderPath());
  openClient = client;
  return db;
}

describe('getSettings / saveSettings', () => {
  it('returns a null API key before anything has been saved', async () => {
    const db = await freshDatabase();
    expect(await getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, deepseekApiKey: null });
  });

  it('round-trips a saved API key', async () => {
    const db = await freshDatabase();
    await saveSettings(db, { deepseekApiKey: 'sk-test-123' });
    expect(await getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, deepseekApiKey: 'sk-test-123' });
  });

  it('replaces the previous value rather than appending to it', async () => {
    const db = await freshDatabase();
    await saveSettings(db, { deepseekApiKey: 'sk-first' });
    await saveSettings(db, { deepseekApiKey: 'sk-second' });
    expect(await getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, deepseekApiKey: 'sk-second' });
  });

  it('can clear a saved key back to null', async () => {
    const db = await freshDatabase();
    await saveSettings(db, { deepseekApiKey: 'sk-test-123' });
    await saveSettings(db, { deepseekApiKey: null });
    expect(await getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, deepseekApiKey: null });
  });
});

describe('the Mayor and budget settings', () => {
  it('starts with the Mayor off and no monthly ceiling', async () => {
    const db = await freshDatabase();
    expect(await getSettings(db)).toEqual({
      deepseekApiKey: null,
      mayorAutonomy: false,
      monthlyCeilingUsd: null,
    });
  });

  it('saves one setting without touching the others', async () => {
    const db = await freshDatabase();
    await saveSettings(db, { deepseekApiKey: 'sk-test-123' });
    await saveSettings(db, { mayorAutonomy: true, monthlyCeilingUsd: 1.5 });
    expect(await getSettings(db)).toEqual({
      deepseekApiKey: 'sk-test-123',
      mayorAutonomy: true,
      monthlyCeilingUsd: 1.5,
    });
  });
});
