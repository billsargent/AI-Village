import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { appendMeter, loadMeterSince, type MeterRow } from './meter-repository.js';
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
  tempDir = mkdtempSync(join(tmpdir(), 'ai-village-meter-test-'));
  const { db, client } = await openAndMigrate(join(tempDir, 'village.db'), migrationsFolderPath());
  openClient = client;
  return db;
}

function call(at: number, costUsd: number): MeterRow {
  return {
    at,
    purpose: 'mayor-duties',
    villagerId: 'hesper',
    model: 'deepseek-chat',
    tokensIn: 1200,
    tokensCached: 0,
    tokensOut: 80,
    tokensReasoning: 0,
    costUsd,
    ms: 900,
  };
}

describe('appendMeter / loadMeterSince', () => {
  it('starts empty', async () => {
    expect(await loadMeterSince(await freshDatabase(), 0)).toEqual([]);
  });

  it('only ever adds, oldest first', async () => {
    const db = await freshDatabase();
    await appendMeter(db, [call(100, 0.001)]);
    await appendMeter(db, [call(200, 0.002), call(300, 0.003)]);
    expect(await loadMeterSince(db, 0)).toEqual([
      call(100, 0.001),
      call(200, 0.002),
      call(300, 0.003),
    ]);
  });

  it('loads only calls since a time, for checking a budget', async () => {
    const db = await freshDatabase();
    await appendMeter(db, [call(100, 0.001), call(200, 0.002)]);
    expect(await loadMeterSince(db, 150)).toEqual([call(200, 0.002)]);
  });
});
