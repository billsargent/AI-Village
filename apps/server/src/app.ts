import {
  defaultBudgetSettings,
  facts,
  runVillagerChat,
  type ChatLine,
  type ModelClient,
} from '@ai-village/agent';
import {
  appendMeter,
  closeDatabase,
  getSettings,
  loadMeterSince,
  migrationsFolderPath,
  openAndMigrate,
  saveSettings,
  type Settings,
} from '@ai-village/db';
import { createDeepSeekClient } from '@ai-village/integrations';
import { clockSpeedSchema, createVillage, type VillageState } from '@ai-village/sim';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { LiveVillage } from './live-village.js';
import { MayorScheduler } from './mayor-scheduler.js';

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

const updateSettingsSchema = z
  .object({
    deepseekApiKey: z.string().trim().min(1, 'deepseekApiKey must be a non-empty string'),
    mayorAutonomy: z.boolean(),
    // A small, local village: a ceiling above $1000 a month is surely a typo.
    monthlyCeilingUsd: z.number().positive().max(1000),
  })
  .partial()
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, 'Nothing to save');

/** Spec section 16's monthly ceiling is checked over the last 30 days of calls. */
const BUDGET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const setSpeedSchema = z.object({ speed: clockSpeedSchema });
const decideSchema = z.object({ decision: z.enum(['approved', 'declined']) });
/** How many past decisions the inbox shows alongside what's pending. */
const RECENT_DECISIONS = 10;
/** A chat message from the owner: long enough for a real question, short enough to stay cheap. */
const chatMessageSchema = z.object({ message: z.string().trim().min(1).max(1000) });
/** How many lines of each villager's chat the server keeps (the prompt sends only the last 10). */
const CHAT_LINES_KEPT = 50;

export interface CreateAppOptions {
  /** Overridable for tests, so each test instance gets its own SQLite file. */
  dbPath?: string;
  /** Wall-clock milliseconds - injectable so tests can drive the village clock. */
  now?: () => number;
  /** Builds a model client for the owner's key - a scripted fake in tests, DeepSeek otherwise. */
  makeModelClient?: (apiKey: string) => ModelClient;
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
  const now = options.now ?? Date.now;
  const village = await LiveVillage.open({ db, bootstrap: bootstrapVillage, now });
  const mayor = new MayorScheduler({
    village,
    db,
    now,
    makeClient: options.makeModelClient ?? ((apiKey) => createDeepSeekClient({ apiKey })),
  });
  const stopMayor = mayor.start();

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
   * Each villager's chat with the owner, kept while the server runs. Not
   * saved to the database yet: a restart starts every conversation fresh.
   */
  const chats = new Map<string, ChatLine[]>();
  const villagerExists = (id: string) =>
    village.state.villagers.some((villager) => villager.villagerId === id);

  app.get('/api/villagers/:id/chat', (c) => {
    const id = c.req.param('id');
    if (!villagerExists(id)) {
      return c.json({ error: `No villager "${id}"` }, 404);
    }
    return c.json({ lines: chats.get(id) ?? [] });
  });

  /**
   * Spec section 11's "Chat with the owner": `{ message }` in, the
   * villager's reply out. Needs only a key - the owner's own chats are
   * never stopped by the monthly ceiling (spec section 16). The village
   * holds still while the villager answers, and the call is metered.
   */
  app.post('/api/villagers/:id/chat', async (c) => {
    const id = c.req.param('id');
    if (!villagerExists(id)) {
      return c.json({ error: `No villager "${id}"` }, 404);
    }
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = chatMessageSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'message must be 1 to 1000 characters' }, 400);
    }
    const settings = await getSettings(db);
    if (settings.deepseekApiKey === null) {
      return c.json({ error: 'Save a DeepSeek API key in Settings to chat' }, 400);
    }

    const history = chats.get(id) ?? [];
    const ownerLine: ChatLine = { from: 'owner', text: parsed.data.message, at: now() };
    const meter = await loadMeterSince(db, now() - BUDGET_WINDOW_MS);
    const client = (options.makeModelClient ?? ((apiKey) => createDeepSeekClient({ apiKey })))(
      settings.deepseekApiKey,
    );
    const budget = defaultBudgetSettings(settings.monthlyCeilingUsd ?? Number.POSITIVE_INFINITY);

    // Filled in by the turn; an object so TS sees the writes made inside the callback.
    const outcome = { reply: null as ChatLine | null, approvalRequested: false };
    try {
      await village.takeTurn(async (state, inbox) => {
        const result = await runVillagerChat(
          client,
          state,
          inbox,
          id,
          parsed.data.message,
          history,
          meter,
          budget,
        );
        await appendMeter(db, result.meter.slice(meter.length));
        outcome.reply = { from: 'villager', text: result.reply, at: now() };
        outcome.approvalRequested = result.approvalRequested ?? false;
        return { state: result.state, inbox: result.inbox };
      });
    } catch (error) {
      console.error('AI-Village: a chat turn failed', error);
      return c.json({ error: "Couldn't reach the model just now - try again in a moment." }, 502);
    }
    const lines = [...history, ownerLine, ...(outcome.reply ? [outcome.reply] : [])].slice(
      -CHAT_LINES_KEPT,
    );
    chats.set(id, lines);
    return c.json({ lines, approvalRequested: outcome.approvalRequested });
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

  /**
   * What the browser may know about the settings: never the key itself,
   * only whether one is set - plus the Mayor's switch, the monthly
   * ceiling, what's been spent against it, and the Mayor's last attempt.
   */
  const settingsStatus = async (settings: Settings) => {
    const meter = await loadMeterSince(db, now() - BUDGET_WINDOW_MS);
    return {
      hasDeepseekApiKey: settings.deepseekApiKey !== null,
      mayorAutonomy: settings.mayorAutonomy,
      monthlyCeilingUsd: settings.monthlyCeilingUsd,
      spentThisMonthUsd: meter.reduce((sum, call) => sum + call.costUsd, 0),
      mayorLastTurn: mayor.last,
    };
  };

  app.get('/api/settings', async (c) => {
    return c.json(await settingsStatus(await getSettings(db)));
  });

  /**
   * Saves any of: the key, the Mayor's switch, the monthly ceiling. The
   * Mayor can only be switched on once there's a key and a ceiling - it
   * spends real money on the owner's key.
   */
  app.post('/api/settings', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, 400);
    }
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    ) as Partial<Settings>;
    const next = { ...(await getSettings(db)), ...changes };
    if (next.mayorAutonomy && (next.deepseekApiKey === null || next.monthlyCeilingUsd === null)) {
      return c.json(
        { error: 'Set a DeepSeek API key and a monthly ceiling before turning the Mayor on' },
        400,
      );
    }
    return c.json(await settingsStatus(await saveSettings(db, changes)));
  });

  /** Clears the key - which also switches the Mayor off, since it can't run without one. */
  app.delete('/api/settings', async (c) => {
    return c.json(
      await settingsStatus(await saveSettings(db, { deepseekApiKey: null, mayorAutonomy: false })),
    );
  });

  return {
    app,
    village,
    mayor,
    stopMayor,
    getState: () => village.state,
    /** Waits for any save in flight, then closes the database. */
    closeDb: async () => {
      stopMayor();
      await mayor.idle();
      await village.flush();
      closeDatabase(client);
    },
  };
}
