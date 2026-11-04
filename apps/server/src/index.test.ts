import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROPOSE_HIRE_TOOL } from '@ai-village/agent';
import { createApp } from './app.js';

const tempDirs: string[] = [];
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    await close();
  }
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // The native libsql binding can release its file handle a moment
      // after close() returns, especially on Windows; a leftover temp dir
      // is harmless, so a cleanup failure here shouldn't fail the test.
    }
  }
});

async function createTestApp() {
  const dir = mkdtempSync(join(tmpdir(), 'ai-village-server-test-'));
  tempDirs.push(dir);
  const created = await createApp({ dbPath: join(dir, 'village.db') });
  closers.push(created.closeDb);
  return created;
}

describe('GET /api/village', () => {
  it('returns the bootstrapped village as a facts snapshot', async () => {
    const { app } = await createTestApp();

    const response = await app.request('/api/village');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      population: 2,
      builtBuildingIds: ['town-hall', 'cottage'],
      villagers: [
        { id: 'hesper', tradeId: 'mayor', role: 'mayor' },
        { id: 'ada', tradeId: 'farmer', role: 'villager' },
      ],
    });
  });

  it('bootstraps a fresh village per app instance', async () => {
    const { app: appA } = await createTestApp();
    const { app: appB } = await createTestApp();

    const responseA = await appA.request('/api/village');
    const responseB = await appB.request('/api/village');
    const [bodyA, bodyB] = await Promise.all([responseA.json(), responseB.json()]);

    expect(bodyA).toEqual(bodyB);
  });
});

describe('/api/settings', () => {
  it('reports no API key before anything has been saved', async () => {
    const { app } = await createTestApp();

    const response = await app.request('/api/settings');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasDeepseekApiKey: false });
  });

  it('saves a key with POST, never echoing its value back', async () => {
    const { app } = await createTestApp();

    const postResponse = await app.request('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deepseekApiKey: 'sk-test-123' }),
    });
    expect(postResponse.status).toBe(200);
    const postBody: unknown = await postResponse.json();
    expect(postBody).toEqual({ hasDeepseekApiKey: true });
    expect(JSON.stringify(postBody)).not.toContain('sk-test-123');

    const getResponse = await app.request('/api/settings');
    const getBody: unknown = await getResponse.json();
    expect(getBody).toEqual({ hasDeepseekApiKey: true });
    expect(JSON.stringify(getBody)).not.toContain('sk-test-123');
  });

  it('rejects an empty key', async () => {
    const { app } = await createTestApp();

    const response = await app.request('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deepseekApiKey: '   ' }),
    });

    expect(response.status).toBe(400);
    const stillUnset = await app.request('/api/settings');
    expect(await stillUnset.json()).toEqual({ hasDeepseekApiKey: false });
  });

  it('clears a saved key with DELETE', async () => {
    const { app } = await createTestApp();
    await app.request('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deepseekApiKey: 'sk-test-123' }),
    });

    const deleteResponse = await app.request('/api/settings', { method: 'DELETE' });

    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ hasDeepseekApiKey: false });
    const stillCleared = await app.request('/api/settings');
    expect(await stillCleared.json()).toEqual({ hasDeepseekApiKey: false });
  });

  it('persists the key across app instances sharing the same database file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-village-server-test-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'village.db');

    const first = await createApp({ dbPath });
    closers.push(first.closeDb);
    await first.app.request('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deepseekApiKey: 'sk-test-123' }),
    });

    const second = await createApp({ dbPath });
    closers.push(second.closeDb);
    const response = await second.app.request('/api/settings');

    expect(await response.json()).toEqual({ hasDeepseekApiKey: true });
  });
});

/** A fake wall clock the test moves by hand. */
function fakeClock(start = 1_800_000_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const REAL_MS_PER_VILLAGE_HOUR = 10 * 60_000;

async function createLiveTestApp(dbPath?: string, clock = fakeClock()) {
  let path = dbPath;
  if (!path) {
    const dir = mkdtempSync(join(tmpdir(), 'ai-village-server-test-'));
    tempDirs.push(dir);
    path = join(dir, 'village.db');
  }
  const created = await createApp({ dbPath: path, now: clock.now });
  closers.push(created.closeDb);
  return { ...created, clock, dbPath: path };
}

describe('the live village', () => {
  it("settles the first day's systems as soon as it starts", async () => {
    const { getState } = await createLiveTestApp();
    expect(getState().weatherHistory.map((d) => d.day)).toEqual([0]);
  });

  it('moves the village clock with real time on every tick', async () => {
    const { village, getState, clock } = await createLiveTestApp();
    const before = getState().clock.minute;
    clock.advance(REAL_MS_PER_VILLAGE_HOUR);
    await village.tick();
    expect(getState().clock.minute).toBeCloseTo(before + 60);
  });

  it('settles the next day when the clock reaches it', async () => {
    const { village, getState, clock } = await createLiveTestApp();
    // Bootstrap starts at 09:00 on day 0; 15 village hours later it's day 1.
    clock.advance(15 * REAL_MS_PER_VILLAGE_HOUR);
    const change = await village.tick();
    expect(change.settled.map((r) => r.day)).toEqual([1]);
    expect(getState().weatherHistory.map((d) => d.day)).toEqual([0, 1]);
  });

  it('survives a restart, catching up for the time it was closed', async () => {
    const clock = fakeClock();
    const first = await createLiveTestApp(undefined, clock);
    clock.advance(2 * REAL_MS_PER_VILLAGE_HOUR);
    await first.village.tick();
    const minuteAtClose = first.getState().clock.minute;
    await first.village.save();
    await first.closeDb();
    closers.splice(closers.indexOf(first.closeDb), 1);

    // Closed for one real village hour's worth of time.
    clock.advance(REAL_MS_PER_VILLAGE_HOUR);
    const second = await createLiveTestApp(first.dbPath, clock);
    expect(second.getState().clock.minute).toBeCloseTo(minuteAtClose + 60);
  });
});

describe('/api/clock', () => {
  it('reports the clock running at 1x to start with', async () => {
    const { app } = await createLiveTestApp();
    const response = await app.request('/api/clock');
    expect(await response.json()).toEqual({ speed: 1, paused: false });
  });

  it('pauses the village, which then stays put however much time passes', async () => {
    const { app, village, getState, clock } = await createLiveTestApp();
    const response = await app.request('/api/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed: 0 }),
    });
    expect(await response.json()).toEqual({ speed: 0, paused: true });

    const minute = getState().clock.minute;
    clock.advance(10 * REAL_MS_PER_VILLAGE_HOUR);
    await village.tick();
    expect(getState().clock.minute).toBe(minute);
  });

  it('runs 4x faster at speed 4', async () => {
    const { app, village, getState, clock } = await createLiveTestApp();
    await app.request('/api/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed: 4 }),
    });
    const minute = getState().clock.minute;
    clock.advance(REAL_MS_PER_VILLAGE_HOUR);
    await village.tick();
    expect(getState().clock.minute).toBeCloseTo(minute + 240);
  });

  it('rejects a speed the spec has no button for', async () => {
    const { app } = await createLiveTestApp();
    const response = await app.request('/api/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed: 3 }),
    });
    expect(response.status).toBe(400);
  });
});

describe('GET /api/events', () => {
  async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    return text;
  }

  it('sends the village straight away, then again when a village minute passes', async () => {
    const { app, village, clock } = await createLiveTestApp();
    const response = await app.request('/api/events');
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    if (!reader) return;

    const first = await readEvent(reader);
    expect(first).toContain('event: village');
    const payload = JSON.parse(/data: (.*)/.exec(first)?.[1] ?? '{}') as {
      facts: { hour: number };
      clock: { speed: number };
    };
    expect(payload.facts.hour).toBe(9);
    expect(payload.clock.speed).toBe(1);

    clock.advance(REAL_MS_PER_VILLAGE_HOUR);
    await village.tick();
    const second = await readEvent(reader);
    expect(second).toContain('"hour":10');

    await reader.cancel();
  });
});

describe('/api/approvals', () => {
  async function post(
    app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
    id: number,
    decision: string,
  ) {
    return app.request(`/api/approvals/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
  }

  it('starts with nothing waiting', async () => {
    const { app } = await createLiveTestApp();
    const response = await app.request('/api/approvals');
    expect(await response.json()).toEqual({ pending: [], decided: [] });
  });

  it("lists a Mayor's hire request, and approving it actually hires someone", async () => {
    const { app, village, getState } = await createLiveTestApp();
    const request = await village.requestApproval(
      PROPOSE_HIRE_TOOL,
      { tradeId: 'fisher', reason: 'nobody fishes yet' },
      'hesper',
    );

    const listed = (await (await app.request('/api/approvals')).json()) as {
      pending: { id: number; preview: string }[];
    };
    expect(listed.pending).toHaveLength(1);
    expect(listed.pending[0]?.preview).toBe('Hire a fisher: nobody fishes yet');

    const before = getState().villagers.length;
    const response = await post(app, request.id, 'approved');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: request.id, status: 'approved' });
    expect(getState().villagers).toHaveLength(before + 1);
    expect(getState().villagers.some((v) => v.tradeId === 'fisher')).toBe(true);
  });

  it('declining changes nothing in the village', async () => {
    const { app, village, getState } = await createLiveTestApp();
    const request = await village.requestApproval(
      PROPOSE_HIRE_TOOL,
      { tradeId: 'fisher', reason: 'why not' },
      'hesper',
    );
    const before = getState().villagers.length;
    expect((await post(app, request.id, 'declined')).status).toBe(200);
    expect(getState().villagers).toHaveLength(before);
    const listed = (await (await app.request('/api/approvals')).json()) as {
      pending: unknown[];
      decided: { status: string }[];
    };
    expect(listed.pending).toEqual([]);
    expect(listed.decided[0]?.status).toBe('declined');
  });

  it("won't decide the same request twice, or one that doesn't exist", async () => {
    const { app, village } = await createLiveTestApp();
    const request = await village.requestApproval(
      PROPOSE_HIRE_TOOL,
      { tradeId: 'fisher', reason: 'why not' },
      'hesper',
    );
    await post(app, request.id, 'declined');
    expect((await post(app, request.id, 'approved')).status).toBe(409);
    expect((await post(app, 999, 'approved')).status).toBe(404);
    expect((await post(app, request.id, 'maybe')).status).toBe(400);
  });

  it('keeps a request pending when the tool itself refuses', async () => {
    const { app, village } = await createLiveTestApp();
    const request = await village.requestApproval(
      PROPOSE_HIRE_TOOL,
      { tradeId: 'astronaut', reason: 'space' },
      'hesper',
    );
    const response = await post(app, request.id, 'approved');
    expect(response.status).toBe(409);
    expect(village.inbox.requests[0]?.status).toBe('pending');
  });

  it('survives a restart', async () => {
    const clock = fakeClock();
    const first = await createLiveTestApp(undefined, clock);
    await first.village.requestApproval(
      PROPOSE_HIRE_TOOL,
      { tradeId: 'fisher', reason: 'why not' },
      'hesper',
    );
    await first.closeDb();
    closers.splice(closers.indexOf(first.closeDb), 1);

    const second = await createLiveTestApp(first.dbPath, clock);
    expect(second.village.inbox.requests).toHaveLength(1);
    expect(second.village.inbox.nextId).toBe(2);
  });
});
