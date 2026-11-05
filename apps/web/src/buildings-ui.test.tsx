// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { buildOptions } from './BuildPanel.js';
import { cropStage, fieldPixels } from './field-draw.js';
import { Toasts } from './Toasts.js';
import type { ChronicleEntry, VillageFacts } from './village-api.js';
import { planCanvasDraw } from './village-draw.js';

const FACTS: VillageFacts = {
  weekday: 'Moonday',
  season: 'spring',
  seasonDay: 1,
  year: 0,
  hour: 10,
  minuteOfHour: 0,
  phase: 'work-first-stint',
  weather: 'clear',
  isMarketDay: false,
  festival: null,
  population: 2,
  villagers: [
    { id: 'hesper', tradeId: 'mayor', role: 'mayor' },
    { id: 'ada', tradeId: 'farmer', role: 'villager' },
  ],
  builtBuildingIds: ['town-hall', 'cottage'],
  stores: { planks: 5 },
  treasuryCoins: 45,
  treasuryDeltaYesterday: 0,
  recentChronicle: [],
  festivals: [],
  boardPosts: [],
  constructionSites: [{ buildingId: 'fields', slot: 0, daysLeft: 1 }],
};

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

const SETTINGS = {
  hasDeepseekApiKey: true,
  mayorAutonomy: true,
  monthlyCeilingUsd: 5,
  spentThisMonthUsd: 0.0123,
  mayorLastTurn: null,
};

function stubFetch(facts: VillageFacts = FACTS) {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body as string) });
      }
      const body = url.includes('/api/clock')
        ? { speed: 1, paused: false }
        : url.includes('/api/approvals')
          ? { pending: [], decided: [] }
          : url.includes('/api/settings')
            ? SETTINGS
            : url.endsWith('/api/villagers')
              ? {
                  villagers: [
                    {
                      id: 'hesper',
                      tradeId: 'mayor',
                      role: 'mayor',
                      skillLevel: 1,
                      traits: [{ id: 'thrifty', howTheyTalk: '', isFlaw: false }],
                      needs: null,
                      mood: 70,
                      relationships: [],
                      memories: [],
                      promises: [],
                    },
                  ],
                }
              : url.includes('/api/buildings')
                ? { ok: true }
                : facts;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
  return posts;
}

function withQueries(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('buildOptions', () => {
  const byId = (id: string) => buildOptions(FACTS).find((option) => option.buildingId === id);

  it('says what stands in the way of each building', () => {
    expect(byId('town-hall')?.blocked).toBe('Already built');
    expect(byId('bakery')?.blocked).toBe('Needs 4 villagers');
    expect(byId('cottage')?.blocked).toBe('Needs 20 planks');
    expect(byId('mill')?.blocked).toBe('Needs 100 coins');
    expect(byId('smokehouse')?.blocked).toBe('Needs 10 planks');
    expect(byId('forest-hut')?.blocked).toBeNull();
    expect(byId('forest-hut')?.plot?.map).toBe('forest');
  });

  it("puts a second field on the next plot, after the one that's going up", () => {
    const fields = byId('fields');
    expect(fields?.blocked).toBeNull();
    // Fields 0 is the site; the next goes on fields plot 1, at (12, 2).
    expect(fields?.plot).toMatchObject({ map: 'main', x: 12 * 16, y: 2 * 16 });
  });
});

describe('the Build panel', () => {
  it('builds from the top bar, and says work has begun', async () => {
    const posts = stubFetch();
    withQueries(<App />);
    await screen.findByLabelText(/Moonday, spring day 1/);

    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    const panel = screen.getByRole('dialog', { name: 'Build' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Build the Forest Hut' }));

    await waitFor(() => {
      expect(posts).toEqual([{ url: '/api/buildings', body: { buildingId: 'forest-hut' } }]);
    });
    expect(await within(panel).findByRole('status')).toBeTruthy();
  });
});

describe('the map plan', () => {
  it('places a building site on its plot, and fields over their whole plot', () => {
    const plan = planCanvasDraw({ ...FACTS, builtBuildingIds: ['fields'], constructionSites: [] });
    const field = plan.buildings.find((b) => b.buildingId === 'fields');
    expect(field?.footprint).toEqual({ x: 2 * 16, y: 2 * 16, width: 8 * 16, height: 6 * 16 });

    const withSite = planCanvasDraw(FACTS);
    expect(withSite.sites).toEqual([
      { buildingId: 'fields', slot: 0, daysLeft: 1, x: 32, y: 32, width: 128, height: 96 },
    ]);
  });

  it('grows crops by season, and leaves winter fields bare', () => {
    expect(['spring', 'summer', 'autumn', 'winter'].map(cropStage)).toEqual([
      'sprouts',
      'green',
      'golden',
      'bare',
    ]);
    const summer = fieldPixels(128, 96, 'green');
    const winter = fieldPixels(128, 96, 'bare');
    expect(summer.length).toBeGreaterThan(winter.length);
    // Everything stays inside the fence, a tile in from the edges.
    for (const pixel of summer) {
      expect(pixel.x).toBeGreaterThanOrEqual(16);
      expect(pixel.x + pixel.width).toBeLessThanOrEqual(128 - 16);
      expect(pixel.y).toBeGreaterThanOrEqual(16);
      expect(pixel.y + pixel.height).toBeLessThanOrEqual(96 - 16);
    }
  });
});

describe('notices', () => {
  const entry = (minute: number, text: string, importance: number): ChronicleEntry => ({
    minute,
    kind: 'x',
    text,
    actors: [],
    importance,
    public: true,
  });

  it('pops up important news as it arrives, but not what was already there', () => {
    const { rerender } = render(<Toasts chronicle={[entry(1, 'Old news.', 4)]} />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(
      <Toasts
        chronicle={[
          entry(2, 'The mill is finished.', 4),
          entry(3, 'Someone sneezed.', 1),
          entry(1, 'Old news.', 4),
        ]}
      />,
    );
    expect(screen.getAllByRole('status').map((s) => s.textContent)).toEqual([
      'The mill is finished.',
    ]);
  });
});

describe('the Villagers page and the spend', () => {
  it('lists everyone with their mood and traits, and opens a card', async () => {
    stubFetch();
    withQueries(<App />);
    await screen.findByLabelText(/Moonday, spring day 1/);

    fireEvent.click(screen.getByRole('button', { name: 'Villagers' }));
    const page = screen.getByRole('dialog', { name: 'Villagers' });
    expect(await within(page).findByText('Mood: Content (70)')).toBeTruthy();
    expect(page.textContent).toContain('thrifty');
    fireEvent.click(within(page).getByRole('button', { name: 'Hesper' }));
    expect(await screen.findByRole('dialog', { name: 'Hesper' })).toBeTruthy();
  });

  it("shows this month's model spend against the ceiling under the clock", async () => {
    stubFetch();
    withQueries(<App />);
    expect((await screen.findByLabelText('Model spend this month')).textContent).toBe(
      'Spent $0.0123 of $5.00 this month',
    );
    await act(async () => {
      await Promise.resolve();
    });
  });
});
