// HTTP API, sign-in, server-sent events, scheduler and sim ticks
// (spec section 2-3). One Node process; heavy jobs run in worker threads.

import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3000);

const { app } = createApp();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`AI-Village server listening on http://localhost:${info.port}`);
});
