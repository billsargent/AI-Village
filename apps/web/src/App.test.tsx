// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import type { VillageFacts } from './village-api.js';

const FACTS: VillageFacts = {
  weekday: 'Moonday',
  season: 'spring',
  seasonDay: 1,
  year: 0,
  hour: 8,
  minuteOfHour: 0,
  phase: 'work-first-stint',
  weather: 'clear',
  isMarketDay: false,
  festival: null,
  population: 2,
  villagers: [{ id: 'hesper', tradeId: 'baker', role: 'villager' }],
  builtBuildingIds: ['bakery'],
  stores: {},
  treasuryCoins: 40,
  treasuryDeltaYesterday: 0,
  recentChronicle: [
    {
      minute: 480,
      kind: 'note',
      text: 'The market opened for the day.',
      actors: [],
      importance: 1,
      public: true,
    },
  ],
  festivals: [
    { name: 'Sowing Fair', season: 'spring', seasonDay: 7 },
    { name: 'Midsummer Night', season: 'summer', seasonDay: 14 },
    { name: 'Harvest Festival', season: 'autumn', seasonDay: 10 },
    { name: 'Lantern Night', season: 'winter', seasonDay: 14 },
  ],
};

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(FACTS), { status: 200 }))),
    );
  });

  afterEach(() => {
    // Vitest's globals are off (vitest.config.ts), so React Testing
    // Library's own auto-cleanup (which only registers itself when it
    // finds a *global* afterEach) never kicks in - without this, each
    // test's render stays mounted and can collide with the next test's
    // queries.
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the village facts once loaded', async () => {
    renderApp();

    expect(await screen.findByLabelText(/Moonday, spring day 1/)).toBeTruthy();
    expect(screen.getByText('Population: 2')).toBeTruthy();
    expect(screen.getByLabelText('Treasury: 40 coins')).toBeTruthy();
    expect(screen.getByText('The market opened for the day.')).toBeTruthy();
    expect(screen.getByText('hesper is working at (58, 11)')).toBeTruthy();
  });

  it('switches the "Right now" list to the Riverside map when its button is clicked', async () => {
    const facts: VillageFacts = {
      ...FACTS,
      villagers: [{ id: 'finn', tradeId: 'fisher', role: 'villager' }],
      builtBuildingIds: ['riverside-jetty'],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facts), { status: 200 }))),
    );
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    expect(screen.queryByText(/finn is working at/)).toBeFalsy();

    fireEvent.click(screen.getByText('Riverside'));

    expect(await screen.findByText('finn is working at (2, 8)')).toBeTruthy();
  });

  it('looks inside a furnished building and back out again', async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['cottage'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facts), { status: 200 }))),
    );
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    expect(screen.queryByTestId('interior-canvas')).toBeFalsy();

    fireEvent.click(screen.getByText('Look inside Cottage'));

    // The room opens as a dialog over the map, which stays where it was.
    expect(await screen.findByTestId('interior-canvas')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Cottage' })).toBeTruthy();
    expect(screen.getByTestId('village-canvas')).toBeTruthy();

    fireEvent.click(screen.getByText('Back to village'));

    expect(screen.queryByRole('dialog')).toBeFalsy();
    expect(screen.queryByTestId('interior-canvas')).toBeFalsy();
  });

  it('opens settings as a dialog and closes it again', async () => {
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeFalsy();
  });

  it('folds the journal away and back', async () => {
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    expect(screen.getByText('The market opened for the day.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
    expect(screen.queryByText('The market opened for the day.')).toBeFalsy();

    fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
    expect(screen.getByText('The market opened for the day.')).toBeTruthy();
  });

  it("shows a hint to click town-hall's bookshelf, chest and book, but no panels yet", async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['town-hall'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facts), { status: 200 }))),
    );
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    fireEvent.click(screen.getByText('Look inside Town Hall'));

    expect(
      await screen.findByText(
        'Click the bookshelf for the archive, the chest for the treasury, or the book for the almanac.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Archive')).toBeFalsy();
    expect(screen.queryByText('Treasury')).toBeFalsy();
    expect(screen.queryByText('Almanac')).toBeFalsy();
  });

  it("shows a hint to click shop's counter, but no stores panel yet", async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['shop'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facts), { status: 200 }))),
    );
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    fireEvent.click(screen.getByText('Look inside Shop'));

    expect(await screen.findByText('Click the counter for the stores.')).toBeTruthy();
    expect(screen.queryByText('Stores')).toBeFalsy();
  });

  it("doesn't show the bookshelf hint for a building without one", async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['cottage'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facts), { status: 200 }))),
    );
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    fireEvent.click(screen.getByText('Look inside Cottage'));

    await screen.findByTestId('interior-canvas');
    expect(screen.queryByText(/Click the bookshelf/)).toBeFalsy();
  });

  it("doesn't offer a look-inside button for a building with no furnished layout", async () => {
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);

    expect(screen.queryByText(/Look inside/)).toBeFalsy();
  });

  it('shows an error when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    );

    renderApp();

    expect(await screen.findByText(/Couldn't reach the village/)).toBeTruthy();
  });

  describe('Settings', () => {
    function stubSettingsAwareFetch() {
      let hasDeepseekApiKey = false;
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
          const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (url.includes('/api/village')) {
            return Promise.resolve(new Response(JSON.stringify(FACTS), { status: 200 }));
          }
          if (url.includes('/api/settings')) {
            if (init?.method === 'POST') {
              hasDeepseekApiKey = true;
            } else if (init?.method === 'DELETE') {
              hasDeepseekApiKey = false;
            }
            return Promise.resolve(
              new Response(JSON.stringify({ hasDeepseekApiKey }), { status: 200 }),
            );
          }
          throw new Error(`unexpected fetch: ${url}`);
        }),
      );
    }

    it('shows the API key as not set, then saves one', async () => {
      stubSettingsAwareFetch();
      renderApp();

      await screen.findByLabelText(/Moonday, spring day 1/);
      fireEvent.click(screen.getByText('Settings'));

      expect(await screen.findByText('DeepSeek API key: not set')).toBeTruthy();

      fireEvent.change(screen.getByPlaceholderText('sk-...'), {
        target: { value: 'sk-test-123' },
      });
      fireEvent.click(screen.getByText('Save'));

      expect(await screen.findByText('DeepSeek API key: set')).toBeTruthy();
      // Never shown back to the browser, even after saving it.
      expect(screen.queryByDisplayValue('sk-test-123')).toBeFalsy();
    });

    it('clears a saved key', async () => {
      stubSettingsAwareFetch();
      renderApp();

      await screen.findByLabelText(/Moonday, spring day 1/);
      fireEvent.click(screen.getByText('Settings'));
      await screen.findByText('DeepSeek API key: not set');

      fireEvent.change(screen.getByPlaceholderText('sk-...'), {
        target: { value: 'sk-test-123' },
      });
      fireEvent.click(screen.getByText('Save'));
      await screen.findByText('DeepSeek API key: set');

      fireEvent.click(screen.getByText('Clear'));

      expect(await screen.findByText('DeepSeek API key: not set')).toBeTruthy();
    });
  });
});
