import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, migrationsFolderPath, openAndMigrate, type Database } from './client.js';
import { loadVillage, saveVillage, type VillageSnapshot } from './village-repository.js';

let tempDir: string | undefined;
let openClient: Client | undefined;

afterEach(() => {
  if (openClient) {
    closeDatabase(openClient);
    openClient = undefined;
  }
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

async function freshDatabase(): Promise<Database> {
  tempDir = mkdtempSync(join(tmpdir(), 'ai-village-db-test-'));
  const { db, client } = await openAndMigrate(join(tempDir, 'village.db'), migrationsFolderPath());
  openClient = client;
  return db;
}

const SAMPLE_SNAPSHOT: VillageSnapshot = {
  clock: {
    villageSeed: 7,
    minute: 1440,
    speed: 1,
    paused: false,
    storytellerStyle: 'lively',
    daysSinceLastHappening: 2,
  },
  builtBuildingIds: ['town-hall', 'fields', 'fields'],
  villagers: [{ id: 'ada', tradeId: 'farmer', skillLevel: 2, hasTool: true, role: 'villager' }],
  needs: [
    { villagerId: 'ada', hunger: 80, energy: 90, social: 70, fun: 60, comfort: 100, purpose: 50 },
  ],
  relationships: [
    {
      pairKey: 'ada::tobin',
      a: 'ada',
      b: 'tobin',
      affinity: 20,
      familiarity: 15,
      sweetheartSinceDay: null,
    },
  ],
  ledger: [
    {
      minute: 0,
      fromAccount: 'market',
      toAccount: 'village',
      item: 'wheat',
      qty: 10,
      reason: 'opening stock',
      ref: null,
    },
  ],
  balances: [{ account: 'village', item: 'wheat', qty: 10 }],
  weatherDays: [{ day: 0, kind: 'clear' }],
  chronicle: [
    {
      minute: 0,
      kind: 'happening',
      text: 'A cat napped on the green.',
      actors: ['ada'],
      importance: 2,
      public: true,
    },
  ],
  orders: [
    {
      id: 1,
      source: 'downriver',
      items: [{ good: 'bread', qty: 10 }],
      reward: 30,
      dueDay: 12,
      status: 'accepted',
    },
  ],
  board: [{ id: 1, author: 'ada', text: 'Lost a basket near the mill.', postedDay: 3 }],
  memories: [
    {
      id: 1,
      villagerId: 'ada',
      minute: 0,
      text: 'Met Tobin at the market.',
      importance: 6,
      about: null,
      lastRecalledMinute: null,
    },
  ],
  promises: [
    {
      id: 1,
      villagerId: 'ada',
      text: 'Finish the fence',
      createdMinute: 0,
      dueMinute: 7200,
      status: 'open',
    },
  ],
};

describe('saveVillage / loadVillage', () => {
  it('returns null before anything has been saved', async () => {
    const db = await freshDatabase();
    expect(await loadVillage(db)).toBeNull();
  });

  it('round-trips a full snapshot', async () => {
    const db = await freshDatabase();
    await saveVillage(db, SAMPLE_SNAPSHOT);
    const loaded = await loadVillage(db);
    expect(loaded).toEqual(SAMPLE_SNAPSHOT);
  });

  it('replaces the previous snapshot rather than appending to it', async () => {
    const db = await freshDatabase();
    await saveVillage(db, SAMPLE_SNAPSHOT);
    const second: VillageSnapshot = {
      ...SAMPLE_SNAPSHOT,
      clock: { ...SAMPLE_SNAPSHOT.clock, minute: 2880 },
      villagers: [],
      needs: [],
    };
    await saveVillage(db, second);
    const loaded = await loadVillage(db);
    expect(loaded?.clock.minute).toBe(2880);
    expect(loaded?.villagers).toEqual([]);
  });
});
