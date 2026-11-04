// HTTP API, sign-in, server-sent events, scheduler and sim ticks
// (spec section 2-3). One Node process; heavy jobs run in worker threads.

import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3000);
/** How often the village clock is ticked against real time. */
const TICK_MS = 1000;

const { app, village, closeDb } = await createApp();

// Spec section 16: "the server listens on 127.0.0.1 only" - it holds the
// owner's key and can spend money on it, so it's never on the network.
serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`AI-Village server listening on http://localhost:${info.port}`);
});

const timer = setInterval(() => {
  village.tick().catch((error: unknown) => {
    console.error('AI-Village: a village tick failed', error);
  });
}, TICK_MS);

// Save on the way out, so a restart loses nothing and catches up from now.
async function shutdown() {
  clearInterval(timer);
  try {
    await village.save();
    await closeDb();
  } finally {
    process.exit(0);
  }
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
