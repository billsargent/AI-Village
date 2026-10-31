import { facts } from '@ai-village/agent';
import { createVillage, type VillageState } from '@ai-village/sim';
import { Hono } from 'hono';

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

/**
 * Builds the Hono app, separate from the HTTP listener so tests can call
 * `app.request()` directly without binding a port. Holds one in-memory
 * village per process - persisting it to the db package's repository is a
 * follow-up once there's a reason for the client to see more than one
 * village (spec section 3's server owns the one Node process; this app is
 * the part of it that answers HTTP requests).
 */
export function createApp() {
  const state: VillageState = bootstrapVillage();

  const app = new Hono();

  app.get('/api/village', (c) => {
    return c.json(facts(state, 'owner', 'web'));
  });

  return { app, getState: () => state };
}
