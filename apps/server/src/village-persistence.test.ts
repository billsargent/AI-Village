import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import {
  closeDatabase,
  loadVillage,
  migrationsFolderPath,
  openAndMigrate,
  saveVillage,
} from '@ai-village/db';
import { apply, createVillage, pickTraits, runVillageDays } from '@ai-village/sim';
import { afterEach, describe, expect, it } from 'vitest';
import { fromSnapshot, toSnapshot } from './village-persistence.js';

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

describe('village persistence round trip', () => {
  it('survives save and reload after running a headless village for 30 days', async () => {
    const { state: ranState } = runVillageDays(42, 30, {
      villagers: [
        {
          villagerId: 'mayor',
          tradeId: 'mayor',
          skillLevel: 1,
          hasTool: false,
          moodFactor: 1,
          role: 'mayor',
        },
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 2, hasTool: true, moodFactor: 1 },
        { villagerId: 'wren', tradeId: 'innkeeper', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
      builtBuildingIds: ['town-hall', 'inn', 'fields', 'fields'],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 2000 }],
    });

    const remembered = apply(ranState, {
      kind: 'Remember',
      villagerId: 'ada',
      text: 'Met Tobin at the market.',
      importance: 6,
    }).state;
    const promised = apply(remembered, {
      kind: 'MakePromise',
      villagerId: 'ada',
      text: 'Finish the fence',
      dueInDays: 5,
    }).state;
    const state = apply(promised, {
      kind: 'RequestWork',
      villagerId: 'ada',
      description: 'Weed the north field',
    }).state;

    tempDir = mkdtempSync(join(tmpdir(), 'ai-village-persistence-test-'));
    const { db, client } = await openAndMigrate(
      join(tempDir, 'village.db'),
      migrationsFolderPath(),
    );
    openClient = client;

    await saveVillage(db, toSnapshot(state));
    const loadedSnapshot = await loadVillage(db);
    expect(loadedSnapshot).not.toBeNull();
    if (!loadedSnapshot) return;

    const reloaded = fromSnapshot(loadedSnapshot);

    expect(reloaded.clock.minute).toBe(state.clock.minute);
    expect(reloaded.villageSeed).toBe(state.villageSeed);
    expect(reloaded.ledger.balances).toEqual(state.ledger.balances);
    expect(reloaded.ledger.entries.map((e) => ({ ...e, id: undefined }))).toEqual(
      state.ledger.entries.map((e) => ({ ...e, id: undefined })),
    );
    expect(reloaded.weatherHistory).toEqual(state.weatherHistory);
    expect(reloaded.chronicle).toEqual(state.chronicle);
    expect(reloaded.relationships).toEqual(state.relationships);
    expect(reloaded.villagerNeeds).toEqual(state.villagerNeeds);
    expect(reloaded.builtBuildingIds).toEqual(state.builtBuildingIds);
    expect(reloaded.villagers).toEqual(state.villagers);
    expect(reloaded.memory.memories).toEqual(state.memory.memories);
    expect(reloaded.promises.promises).toEqual(state.promises.promises);
    expect(reloaded.workRequests.requests).toEqual(state.workRequests.requests);
  });

  it('keeps traits in the order given, and gives a villager saved before traits existed their own', async () => {
    const state = createVillage(9, {
      villagers: [
        {
          villagerId: 'tobin',
          tradeId: 'baker',
          skillLevel: 1,
          hasTool: false,
          moodFactor: 1,
          traits: ['tidy', 'grumpy', 'cheerful'],
        },
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
      ],
    });
    tempDir = mkdtempSync(join(tmpdir(), 'ai-village-persistence-test-'));
    const { db, client } = await openAndMigrate(
      join(tempDir, 'village.db'),
      migrationsFolderPath(),
    );
    openClient = client;

    const snapshot = toSnapshot(state);
    // Ada as an older save had her: no trait rows at all.
    await saveVillage(db, {
      ...snapshot,
      villagers: snapshot.villagers.map((v) => (v.id === 'ada' ? { ...v, traits: [] } : v)),
    });
    const loaded = await loadVillage(db);
    if (!loaded) throw new Error('nothing saved');
    const reloaded = fromSnapshot(loaded);

    expect(reloaded.villagers[0]?.traits).toEqual(['tidy', 'grumpy', 'cheerful']);
    expect(reloaded.villagers[1]?.traits).toEqual(pickTraits(9, 'ada'));
  });
});
