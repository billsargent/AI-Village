import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const tempDirs: string[] = [];
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) {
    close();
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
