import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('GET /api/village', () => {
  it('returns the bootstrapped village as a facts snapshot', async () => {
    const { app } = createApp();

    const response = await app.request('/api/village');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      population: 0,
      builtBuildingIds: [],
      villagers: [],
    });
  });

  it('bootstraps a fresh village per app instance', async () => {
    const { app: appA } = createApp();
    const { app: appB } = createApp();

    const responseA = await appA.request('/api/village');
    const responseB = await appB.request('/api/village');
    const [bodyA, bodyB] = await Promise.all([responseA.json(), responseB.json()]);

    expect(bodyA).toEqual(bodyB);
  });
});
