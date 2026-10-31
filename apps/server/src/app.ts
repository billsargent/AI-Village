import { facts } from '@ai-village/agent';
import { createVillage, type VillageState } from '@ai-village/sim';
import { Hono } from 'hono';

/** The seed for the one in-memory village this process bootstraps (spec section 3). */
const BOOTSTRAP_SEED = 1;

/**
 * Builds the Hono app, separate from the HTTP listener so tests can call
 * `app.request()` directly without binding a port. Holds one in-memory
 * village per process - persisting it to the db package's repository is a
 * follow-up once there's a reason for the client to see more than one
 * village (spec section 3's server owns the one Node process; this app is
 * the part of it that answers HTTP requests).
 */
export function createApp() {
  const state: VillageState = createVillage(BOOTSTRAP_SEED);

  const app = new Hono();

  app.get('/api/village', (c) => {
    return c.json(facts(state, 'owner', 'web'));
  });

  return { app, getState: () => state };
}
