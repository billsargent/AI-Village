import { facts } from '@ai-village/agent';
import {
  closeDatabase,
  getSettings,
  migrationsFolderPath,
  openAndMigrate,
  saveSettings,
} from '@ai-village/db';
import { clockSpeedSchema, createVillage, type VillageState } from '@ai-village/sim';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { LiveVillage } from './live-village.js';

/** The default location for the owner's one SQLite database (spec section 2's "one folder"), overridable for tests. */
const DEFAULT_DB_PATH = process.env.AIVILLAGE_DB_PATH ?? './village.db';

/** The seed for the one in-memory village this process bootstraps (spec section 3). */
const BOOTSTRAP_SEED = 1;

/** 09:00 - a work-first-stint hour, so the starting scenario's mayor shows up at work. */
const BOOTSTRAP_MINUTE = 9 * 60;

/**
 * The starting treasury. The spec doesn't name one; this is this
 * scenario's own pick - a few weeks of the bootstrap village's wages and
 * upkeep, so a live village isn't broke on its first morning.
 */
const BOOTSTRAP_TREASURY = 200;

/** How often the live updates stream sends a keep-alive, so proxies don't drop an idle connection. */
const EVENTS_KEEPALIVE_MS = 15_000;

/**
 * A small starting scenario so there's a real village to look at, not an
 * empty shell: a Mayor at the town hall, a farmer (whose fields aren't
 * built yet, so they won't show as "at work" until the Mayor builds some),
 * and a cottage. All real, simulated state - not display-only fixtures.
 * Used only the first time, when the database holds no village yet.
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
    startingStock: [{ account: 'treasury', item: 'coins', qty: BOOTSTRAP_TREASURY }],
  });
  return { ...state, clock: { ...state.clock, minute: BOOTSTRAP_MINUTE } };
}

const saveApiKeySchema = z.object({ deepseekApiKey: z.string().trim().min(1) });
const setSpeedSchema = z.object({ speed: clockSpeedSchema });
const decideSchema = z.object({ decision: z.enum(['approved', 'declined']) });
/** How many past decisions the inbox shows alongside what's pending. */
const RECENT_DECISIONS = 10;

export interface CreateAppOptions {
  /** Overridable for tests, so each test instance gets its own SQLite file. */
  dbPath?: string;
  /** Wall-clock milliseconds - injectable so tests can drive the village clock. */
  now?: () => number;
}

/**
 * Builds the Hono app, separate from the HTTP listener so tests can call
 * `app.request()` directly without binding a port. Holds the one live
 * village (spec section 3's server owns the one Node process; this app is
 * the part of it that answers HTTP requests), loaded from and saved to
 * the database. The caller drives its clock with `village.tick()`.
 */
export async function createApp(options: CreateAppOptions = {}) {
  const { db, client } = await openAndMigrate(
    options.dbPath ?? DEFAULT_DB_PATH,
    migrationsFolderPath(),
  );
  const village = await LiveVillage.open({
    db,
    bootstrap: bootstrapVillage,
    ...(options.now ? { now: options.now } : {}),
  });

  const villageFacts = () => facts(village.state, 'owner', 'web');
  const clockStatus = () => ({
    speed: village.state.clock.speed,
    paused: village.state.clock.paused,
  });
  const approvalsStatus = () => ({
    pending: village.inbox.requests.filter((request) => request.status === 'pending').length,
  });

  const app = new Hono();

  app.get('/api/village', (c) => {
    return c.json(villageFacts());
  });

  app.get('/api/clock', (c) => {
    return c.json(clockStatus());
  });

  /** Spec section 14's speed controls: `{ speed: 0 | 1 | 2 | 4 }`, 0 pausing the village. */
  app.post('/api/clock', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = setSpeedSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'speed must be 0, 1, 2 or 4' }, 400);
    }
    await village.setSpeed(parsed.data.speed);
    return c.json(clockStatus());
  });

  /**
   * Spec section 12's approvals inbox: everything waiting on the owner,
   * newest first, plus the last few decisions for context.
   */
  app.get('/api/approvals', (c) => {
    const requests = [...village.inbox.requests].reverse();
    const pending = requests.filter((request) => request.status === 'pending');
    const decided = requests
      .filter((request) => request.status !== 'pending')
      .slice(0, RECENT_DECISIONS);
    return c.json({ pending, decided });
  });

  /** The owner's decision on one request: `{ decision: 'approved' | 'declined' }`. */
  app.post('/api/approvals/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = decideSchema.safeParse(body);
    if (!Number.isInteger(id) || !parsed.success) {
      return c.json({ error: "decision must be 'approved' or 'declined'" }, 400);
    }
    const request = village.inbox.requests.find((candidate) => candidate.id === id);
    if (!request) {
      return c.json({ error: `No approval #${id}` }, 404);
    }
    if (request.status !== 'pending') {
      return c.json({ error: `Approval #${id} was already ${request.status}` }, 409);
    }
    try {
      return c.json(await village.decide(id, parsed.data.decision));
    } catch (error) {
      // The tool itself refused (e.g. no free names left to hire): nothing
      // changed, and the request is still pending for the owner to decline.
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
  });

  /**
   * Live updates (spec section 2's server-sent events): a `village` event
   * with the facts and the clock straight away, then again every time a
   * village minute passes, a day settles or the speed changes. Villager
   * positions aren't streamed (spec section 2) - the browser works them
   * out from these facts.
   */
  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      // An object, not a plain `let`: it's cleared from the onAbort callback,
      // which TS's control-flow analysis can't see from the loop below.
      const open = { current: true };
      let id = 0;
      const send = () =>
        stream.writeSSE({
          event: 'village',
          id: String(id++),
          data: JSON.stringify({
            facts: villageFacts(),
            clock: clockStatus(),
            approvals: approvalsStatus(),
          }),
        });
      const unsubscribe = village.subscribe(() => {
        if (open.current) {
          void send();
        }
      });
      stream.onAbort(() => {
        open.current = false;
        unsubscribe();
      });
      await send();
      while (open.current) {
        await stream.sleep(EVENTS_KEEPALIVE_MS);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- onAbort may clear it during the sleep
        if (open.current) {
          await stream.writeSSE({ event: 'ping', data: '' });
        }
      }
    }),
  );

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
    village,
    getState: () => village.state,
    /** Waits for any save in flight, then closes the database. */
    closeDb: async () => {
      await village.flush();
      closeDatabase(client);
    },
  };
}
