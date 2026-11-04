import { facts } from '@ai-village/agent';
import {
  closeDatabase,
  getSettings,
  migrationsFolderPath,
  openAndMigrate,
  saveSettings,
} from '@ai-village/db';
import { createVillage, type VillageState } from '@ai-village/sim';
import { Hono } from 'hono';
import { z } from 'zod';

/** The default location for the owner's one SQLite database (spec section 2's "one folder"), overridable for tests. */
const DEFAULT_DB_PATH = process.env.AIVILLAGE_DB_PATH ?? './village.db';

/** The seed for the one in-memory village this process bootstraps (spec section 3). */
const BOOTSTRAP_SEED = 1;

/** 09:00 - a work-first-stint hour, so the starting scenario's mayor shows up at work. */
const BOOTSTRAP_MINUTE = 9 * 60;

/**
 * A small starting scenario so there's a real village to look at, not an
 * empty shell: a Mayor at the town hall, a farmer (whose fields aren't
 * built yet, so they won't show as "at work" until the Mayor builds some),
 * and a cottage. All real, simulated state - not display-only fixtures.
 */
function bootstrapVillage(): VillageState {
  const state = createVillage(BOOTSTRAP_SEED, {
    villagers: [
      {
        villagerId: 'hesper',
        tradeId: 'mayor',
        skillLevel: 1,
        hasTool: false,
        moodFactor: 1,
        role: 'mayor',
      },
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
    ],
    builtBuildingIds: ['town-hall', 'cottage'],
  });
  return { ...state, clock: { ...state.clock, minute: BOOTSTRAP_MINUTE } };
}

const saveApiKeySchema = z.object({ deepseekApiKey: z.string().trim().min(1) });

export interface CreateAppOptions {
  /** Overridable for tests, so each test instance gets its own SQLite file. */
  dbPath?: string;
}

/**
 * Builds the Hono app, separate from the HTTP listener so tests can call
 * `app.request()` directly without binding a port. Holds one in-memory
 * village per process - persisting the village state itself to the db
 * package's repository is still a follow-up once there's a reason for
 * the client to see more than one village (spec section 3's server owns
 * the one Node process; this app is the part of it that answers HTTP
 * requests). Settings (the owner's API key) are the first thing this app
 * actually persists, below.
 */
export async function createApp(options: CreateAppOptions = {}) {
  const state: VillageState = bootstrapVillage();

  const { db, client } = await openAndMigrate(
    options.dbPath ?? DEFAULT_DB_PATH,
    migrationsFolderPath(),
  );

  const app = new Hono();

  app.get('/api/village', (c) => {
    return c.json(facts(state, 'owner', 'web'));
  });

  app.get('/api/settings', async (c) => {
    const settings = await getSettings(db);
    return c.json({ hasDeepseekApiKey: settings.deepseekApiKey !== null });
  });

  app.post('/api/settings', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = saveApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'deepseekApiKey must be a non-empty string' }, 400);
    }
    await saveSettings(db, { deepseekApiKey: parsed.data.deepseekApiKey });
    return c.json({ hasDeepseekApiKey: true });
  });

  app.delete('/api/settings', async (c) => {
    await saveSettings(db, { deepseekApiKey: null });
    return c.json({ hasDeepseekApiKey: false });
  });

  return {
    app,
    getState: () => state,
    closeDb: () => {
      closeDatabase(client);
    },
  };
}
