import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROPOSE_HIRE_TOOL, type ModelClient } from '@ai-village/agent';
import { createApp } from './app.js';
import { getBalance } from '@ai-village/sim';

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
    expect(await response.json()).toMatchObject({ hasDeepseekApiKey: false });
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
    expect(postBody).toMatchObject({ hasDeepseekApiKey: true });
    expect(JSON.stringify(postBody)).not.toContain('sk-test-123');

    const getResponse = await app.request('/api/settings');
    const getBody: unknown = await getResponse.json();
    expect(getBody).toMatchObject({ hasDeepseekApiKey: true });
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
    expect(await stillUnset.json()).toMatchObject({ hasDeepseekApiKey: false });
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
    expect(await deleteResponse.json()).toMatchObject({ hasDeepseekApiKey: false });
    const stillCleared = await app.request('/api/settings');
    expect(await stillCleared.json()).toMatchObject({ hasDeepseekApiKey: false });
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

    expect(await response.json()).toMatchObject({ hasDeepseekApiKey: true });
  });
});

/** A fake wall clock the test moves by hand. */
// Starts at the real time: the runner stamps meter records with Date.now(), so a
// fake clock far from it would put every call outside the budget window.
function fakeClock(start = Date.now()) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const REAL_MS_PER_VILLAGE_HOUR = 10 * 60_000;

async function createLiveTestApp(
  dbPath?: string,
  clock = fakeClock(),
  makeModelClient?: (apiKey: string) => ModelClient,
) {
  let path = dbPath;
  if (!path) {
    const dir = mkdtempSync(join(tmpdir(), 'ai-village-server-test-'));
    tempDirs.push(dir);
    path = join(dir, 'village.db');
  }
  const created = await createApp({
    dbPath: path,
    now: clock.now,
    ...(makeModelClient ? { makeModelClient } : {}),
  });
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

describe("the Mayor's mornings", () => {
  /** A fake model: one propose_hire call, then a plain reply. Counts its calls. */
  function hiringModel() {
    let calls = 0;
    const keys: string[] = [];
    const make = (apiKey: string): ModelClient => {
      keys.push(apiKey);
      return {
        chatCompletion() {
          calls++;
          return Promise.resolve(
            calls % 2 === 1
              ? {
                  text: '',
                  usage: { promptTokens: 1000, completionTokens: 50, totalTokens: 1050 },
                  toolCalls: [
                    {
                      id: `call_${calls}`,
                      name: 'propose_hire',
                      arguments: JSON.stringify({ tradeId: 'baker', reason: 'no bread yet' }),
                    },
                  ],
                }
              : {
                  text: 'Done.',
                  usage: { promptTokens: 1000, completionTokens: 5, totalTokens: 1005 },
                },
          );
        },
      };
    };
    return { make, calls: () => calls, keys };
  }

  async function saveSettingsVia(
    app: { request: (p: string, i?: RequestInit) => Response | Promise<Response> },
    body: object,
  ) {
    return app.request('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function reachNextMorning(
    village: { tick: () => Promise<unknown> },
    clock: { advance: (ms: number) => void },
  ) {
    // Bootstrap starts at 09:00 on day 0; 15 village hours later day 1 begins.
    clock.advance(15 * REAL_MS_PER_VILLAGE_HOUR);
    await village.tick();
  }

  it('stays off - and calls no model - until the owner turns it on', async () => {
    const model = hiringModel();
    const { app, village, mayor, clock } = await createLiveTestApp(
      undefined,
      fakeClock(),
      model.make,
    );
    await saveSettingsVia(app, { deepseekApiKey: 'sk-test', monthlyCeilingUsd: 1 });
    await reachNextMorning(village, clock);
    await village.flush();
    expect(model.calls()).toBe(0);
    expect(await mayor.runOnce()).toBe('off');
  });

  it("won't switch on without a key and a monthly ceiling", async () => {
    const { app } = await createLiveTestApp();
    const response = await saveSettingsVia(app, { mayorAutonomy: true });
    expect(response.status).toBe(400);
    await saveSettingsVia(app, { deepseekApiKey: 'sk-test' });
    expect((await saveSettingsVia(app, { mayorAutonomy: true })).status).toBe(400);
    await saveSettingsVia(app, { monthlyCeilingUsd: 1 });
    expect((await saveSettingsVia(app, { mayorAutonomy: true })).status).toBe(200);
  });

  it('when on, takes a turn as a new day begins - a hire lands in the inbox and the call is metered', async () => {
    const model = hiringModel();
    const { app, village, clock } = await createLiveTestApp(undefined, fakeClock(), model.make);
    await saveSettingsVia(app, {
      deepseekApiKey: 'sk-test',
      monthlyCeilingUsd: 1,
      mayorAutonomy: true,
    });

    await reachNextMorning(village, clock);
    // The turn runs off the tick; wait for it to land.
    await vi.waitFor(() => {
      expect(village.inbox.requests).toHaveLength(1);
    });
    expect(village.inbox.requests[0]).toMatchObject({
      toolId: 'propose_hire',
      requestedBy: 'hesper',
    });
    expect(model.keys).toEqual(['sk-test']);

    const settings = (await (await app.request('/api/settings')).json()) as {
      spentThisMonthUsd: number;
      mayorLastTurn: { outcome: string };
    };
    expect(settings.spentThisMonthUsd).toBeGreaterThan(0);
    expect(settings.mayorLastTurn.outcome).toBe('ran');
    // Never the key itself.
    expect(JSON.stringify(settings)).not.toContain('sk-test');
  });

  it('keeps what the Mayor said at the end of their morning, for the owner to read', async () => {
    const make = (): ModelClient => ({
      chatCompletion: () =>
        Promise.resolve({
          text: 'All quiet - nothing needed doing this morning.',
          usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
        }),
    });
    const { app, village, mayor, clock } = await createLiveTestApp(undefined, fakeClock(), make);
    await saveSettingsVia(app, {
      deepseekApiKey: 'sk-test',
      monthlyCeilingUsd: 1,
      mayorAutonomy: true,
    });

    await reachNextMorning(village, clock);
    await vi.waitFor(() => {
      expect(mayor.last?.outcome).toBe('ran');
    });
    const settings = (await (await app.request('/api/settings')).json()) as {
      mayorLastTurn: { outcome: string; reply?: string };
    };
    expect(settings.mayorLastTurn.reply).toBe('All quiet - nothing needed doing this morning.');
  });

  it('stops at the monthly ceiling', async () => {
    const model = hiringModel();
    const { app, mayor } = await createLiveTestApp(undefined, fakeClock(), model.make);
    // A ceiling far below one call's cost: the first call is allowed (nothing spent yet),
    // and every attempt after it stops before calling the model.
    await saveSettingsVia(app, {
      deepseekApiKey: 'sk-test',
      monthlyCeilingUsd: 0.000001,
      mayorAutonomy: true,
    });
    expect(await mayor.runOnce()).toBe('ran');
    const callsAfterFirst = model.calls();
    expect(await mayor.runOnce()).toBe('over-budget');
    expect(model.calls()).toBe(callsAfterFirst);
  });

  it('turning the key off switches the Mayor off too', async () => {
    const { app } = await createLiveTestApp();
    await saveSettingsVia(app, {
      deepseekApiKey: 'sk-test',
      monthlyCeilingUsd: 1,
      mayorAutonomy: true,
    });
    const response = await app.request('/api/settings', { method: 'DELETE' });
    expect(await response.json()).toMatchObject({ hasDeepseekApiKey: false, mayorAutonomy: false });
  });

  it('holds the village still during a turn, then applies the time that passed', async () => {
    let release: (() => void) | undefined;
    const slowModel = (): ModelClient => ({
      chatCompletion: () =>
        new Promise((resolve) => {
          release = () => {
            resolve({
              text: 'Done.',
              usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
            });
          };
        }),
    });
    const { app, village, mayor, getState, clock } = await createLiveTestApp(
      undefined,
      fakeClock(),
      slowModel,
    );
    await saveSettingsVia(app, {
      deepseekApiKey: 'sk-test',
      monthlyCeilingUsd: 1,
      mayorAutonomy: true,
    });

    const turn = mayor.runOnce();
    await vi.waitFor(() => {
      expect(release).toBeDefined();
    });
    const minute = getState().clock.minute;
    clock.advance(REAL_MS_PER_VILLAGE_HOUR);
    await village.tick();
    expect(getState().clock.minute).toBe(minute);

    release?.();
    await turn;
    await village.tick();
    expect(getState().clock.minute).toBeCloseTo(minute + 60);
  });
});

describe('/api/villagers/:id/chat', () => {
  function talkingModel(reply: string) {
    const sent: unknown[] = [];
    const make = (): ModelClient => ({
      chatCompletion(messages) {
        sent.push(messages);
        return Promise.resolve({
          text: reply,
          usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
        });
      },
    });
    return { make, sent };
  }

  function post(
    app: { request: (p: string, i?: RequestInit) => Response | Promise<Response> },
    path: string,
    body: object,
  ) {
    return app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('asks for a key before any model is called', async () => {
    const model = talkingModel('Hello!');
    const { app } = await createLiveTestApp(undefined, fakeClock(), model.make);
    const response = await post(app, '/api/villagers/ada/chat', { message: 'Hi Ada' });
    expect(response.status).toBe(400);
    expect(model.sent).toHaveLength(0);
  });

  it('is 404 for someone who does not live here, and 400 for an empty message', async () => {
    const { app } = await createLiveTestApp(undefined, fakeClock(), talkingModel('x').make);
    expect((await app.request('/api/villagers/nobody/chat')).status).toBe(404);
    await post(app, '/api/settings', { deepseekApiKey: 'test-key' });
    expect((await post(app, '/api/villagers/ada/chat', { message: '   ' })).status).toBe(400);
  });

  it("returns the villager's reply, keeps the conversation, meters the call - with no monthly ceiling set", async () => {
    const model = talkingModel('The fields are waiting to be built.');
    const { app } = await createLiveTestApp(undefined, fakeClock(), model.make);
    await post(app, '/api/settings', { deepseekApiKey: 'test-key' });

    const response = await post(app, '/api/villagers/ada/chat', { message: 'How is work?' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { lines: { from: string; text: string }[] };
    expect(body.lines.map((line) => [line.from, line.text])).toEqual([
      ['owner', 'How is work?'],
      ['villager', 'The fields are waiting to be built.'],
    ]);

    const history = (await (await app.request('/api/villagers/ada/chat')).json()) as {
      lines: unknown[];
    };
    expect(history.lines).toHaveLength(2);

    await post(app, '/api/villagers/ada/chat', { message: 'Thanks' });
    const secondPrompt = model.sent[1] as { role: string; content: string }[];
    expect(secondPrompt.slice(-3).map((m) => m.content)).toEqual([
      'How is work?',
      'The fields are waiting to be built.',
      'Thanks',
    ]);

    const settings = (await (await app.request('/api/settings')).json()) as {
      spentThisMonthUsd: number;
    };
    expect(settings.spentThisMonthUsd).toBeGreaterThan(0);
  });

  it('keeps the conversation through a restart', async () => {
    const model = talkingModel('Morning!');
    const first = await createLiveTestApp(undefined, fakeClock(), model.make);
    await post(first.app, '/api/settings', { deepseekApiKey: 'test-key' });
    await post(first.app, '/api/villagers/ada/chat', { message: 'Hello Ada' });
    await first.closeDb();

    const second = await createLiveTestApp(first.dbPath, fakeClock(), model.make);
    const history = (await (await second.app.request('/api/villagers/ada/chat')).json()) as {
      lines: { from: string; text: string }[];
    };
    expect(history.lines.map((line) => [line.from, line.text])).toEqual([
      ['owner', 'Hello Ada'],
      ['villager', 'Morning!'],
    ]);

    // And the next turn is given what was said before the restart.
    await post(second.app, '/api/villagers/ada/chat', { message: 'Still there?' });
    const prompt = model.sent.at(-1) as { content: string }[];
    expect(prompt.slice(-3).map((m) => m.content)).toEqual([
      'Hello Ada',
      'Morning!',
      'Still there?',
    ]);
  });

  it('answers 502, and keeps no half a conversation, when the model call fails', async () => {
    const make = (): ModelClient => ({
      chatCompletion: () => Promise.reject(new Error('network down')),
    });
    const { app } = await createLiveTestApp(undefined, fakeClock(), make);
    await post(app, '/api/settings', { deepseekApiKey: 'test-key' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await post(app, '/api/villagers/ada/chat', { message: 'Hi' });
    errorSpy.mockRestore();
    expect(response.status).toBe(502);
    const history = (await (await app.request('/api/villagers/ada/chat')).json()) as {
      lines: unknown[];
    };
    expect(history.lines).toHaveLength(0);
  });
});

describe('GET /api/villagers/:id', () => {
  it("returns a villager's card: trade, needs, mood, and nothing invented", async () => {
    const { app } = await createTestApp();
    const response = await app.request('/api/villagers/ada');
    expect(response.status).toBe(200);
    const card = (await response.json()) as {
      id: string;
      tradeId: string;
      needs: Record<string, number> | null;
      mood: number | null;
      relationships: unknown[];
      memories: unknown[];
      promises: unknown[];
    };
    expect(card).toMatchObject({ id: 'ada', tradeId: 'farmer', memories: [], promises: [] });
    expect(Object.keys(card.needs ?? {}).sort()).toEqual(
      ['comfort', 'energy', 'fun', 'hunger', 'purpose', 'social'].sort(),
    );
    expect(typeof card.mood).toBe('number');
  });

  it('is 404 for someone who does not live here', async () => {
    const { app } = await createTestApp();
    expect((await app.request('/api/villagers/nobody')).status).toBe(404);
  });
});

describe("the owner's own actions", () => {
  function postJson(
    app: { request: (p: string, i?: RequestInit) => Response | Promise<Response> },
    path: string,
    body: object = {},
  ) {
    return app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it("thanking a villager lifts their fun, they remember it, and it's saved", async () => {
    const { app, village } = await createLiveTestApp();
    const before = village.state.villagerNeeds.ada?.fun ?? 0;
    const response = await postJson(app, '/api/villagers/ada/thank');
    expect(response.status).toBe(200);
    const card = (await response.json()) as { memories: { text: string }[] };
    expect(card.memories.map((m) => m.text)).toContain('The owner thanked me.');
    expect(village.state.villagerNeeds.ada?.fun).toBeGreaterThanOrEqual(before);
    expect((await postJson(app, '/api/villagers/nobody/thank')).status).toBe(404);
    // Once a day.
    const again = await postJson(app, '/api/villagers/ada/thank');
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe(
      'ada has already been thanked today',
    );
  });

  it('lets the owner start a building, which goes up as a site, and refuses what it cannot build', async () => {
    const { app, village } = await createLiveTestApp();
    const coins = getBalance(village.state.ledger, 'treasury', 'coins');
    const response = await postJson(app, '/api/buildings', { buildingId: 'fields' });
    expect(response.status).toBe(200);
    const facts = (await (await app.request('/api/village')).json()) as {
      constructionSites: { buildingId: string; daysLeft: number }[];
      treasuryCoins: number;
    };
    expect(facts.constructionSites).toEqual([{ buildingId: 'fields', slot: 0, daysLeft: 1 }]);
    expect(facts.treasuryCoins).toBe(coins - 10);

    const refused = await postJson(app, '/api/buildings', { buildingId: 'town-hall' });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toContain('already built');
    expect((await postJson(app, '/api/buildings', {})).status).toBe(400);
  });

  it("lists every villager's card for the Villagers page", async () => {
    const { app } = await createLiveTestApp();
    const body = (await (await app.request('/api/villagers')).json()) as {
      villagers: { id: string; traits: string[] }[];
    };
    expect(body.villagers.map((card) => card.id)).toEqual(['hesper', 'ada']);
    expect(body.villagers[0]?.traits.length).toBeGreaterThan(0);
  });

  it('records a finished work-along session in the chronicle', async () => {
    const { app } = await createLiveTestApp();
    expect((await postJson(app, '/api/work-along', { minutes: 25 })).status).toBe(200);
    const facts = (await (await app.request('/api/village')).json()) as {
      recentChronicle: { text: string }[];
    };
    expect(facts.recentChronicle.map((entry) => entry.text)).toContain(
      'The owner finished 25 minutes of focused work, and the village cheered.',
    );
    expect((await postJson(app, '/api/work-along', { minutes: 7 })).status).toBe(400);
  });

  it("pins the owner's note on the board, where the facts and villagers see it", async () => {
    const { app } = await createLiveTestApp();
    const response = await postJson(app, '/api/board', { text: '  Harvest supper on Starday!  ' });
    expect(response.status).toBe(200);
    const facts = (await (await app.request('/api/village')).json()) as {
      boardPosts: { author: string; text: string }[];
    };
    expect(facts.boardPosts[0]).toMatchObject({
      author: 'owner',
      text: 'Harvest supper on Starday!',
    });
    expect((await postJson(app, '/api/board', { text: '   ' })).status).toBe(400);
    expect((await postJson(app, '/api/board', { text: 'x'.repeat(201) })).status).toBe(400);
  });

  it('marks a promise kept once, and refuses to decide it twice', async () => {
    const { app, village } = await createLiveTestApp();
    await village.act({
      kind: 'MakePromise',
      villagerId: 'ada',
      text: 'Mend the fence',
      dueInDays: 2,
    });
    const card = (await (await app.request('/api/villagers/ada')).json()) as {
      promises: { id: number; text: string }[];
    };
    const promiseId = card.promises[0]?.id ?? -1;

    expect((await postJson(app, `/api/promises/${promiseId}`, { decision: 'kept' })).status).toBe(
      200,
    );
    const after = (await (await app.request('/api/villagers/ada')).json()) as {
      promises: unknown[];
    };
    expect(after.promises).toEqual([]);
    expect((await postJson(app, `/api/promises/${promiseId}`, { decision: 'kept' })).status).toBe(
      409,
    );
    expect((await postJson(app, `/api/promises/${promiseId}`, { decision: 'maybe' })).status).toBe(
      400,
    );
  });
});
