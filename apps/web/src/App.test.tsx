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

    expect(await screen.findByText(/Moonday, spring day 1/)).toBeTruthy();
    expect(screen.getByText('Population: 2')).toBeTruthy();
    expect(screen.getByText('Treasury: 40 coins')).toBeTruthy();
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

    await screen.findByText(/Moonday, spring day 1/);
    expect(screen.queryByText(/finn is working at/)).toBeFalsy();

    fireEvent.click(screen.getByText('Riverside'));

    expect(await screen.findByText('finn is working at (2, 2)')).toBeTruthy();
  });

  it('looks inside a furnished building and back out again', async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['cottage'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facts), { status: 200 }))),
    );
    renderApp();

    await screen.findByText(/Moonday, spring day 1/);
    expect(screen.queryByTestId('interior-canvas')).toBeFalsy();

    fireEvent.click(screen.getByText('Look inside Cottage'));

    expect(await screen.findByTestId('interior-canvas')).toBeTruthy();
    expect(screen.queryByTestId('village-canvas')).toBeFalsy();

    fireEvent.click(screen.getByText('Back to village'));

    expect(await screen.findByTestId('village-canvas')).toBeTruthy();
  });

  it("shows a hint to click town-hall's bookshelf and chest, but no panels yet", async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['town-hall'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facts), { status: 200 }))),
    );
    renderApp();

    await screen.findByText(/Moonday, spring day 1/);
    fireEvent.click(screen.getByText('Look inside Town Hall'));

    expect(
      await screen.findByText(
        'Click the bookshelf for the archive, or the chest for the treasury.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Archive')).toBeFalsy();
    expect(screen.queryByText('Treasury')).toBeFalsy();
  });

  it("shows a hint to click shop's counter, but no stores panel yet", async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['shop'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(facts), { status: 200 }))),
    );
    renderApp();

    await screen.findByText(/Moonday, spring day 1/);
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

    await screen.findByText(/Moonday, spring day 1/);
    fireEvent.click(screen.getByText('Look inside Cottage'));

    await screen.findByTestId('interior-canvas');
    expect(screen.queryByText(/Click the bookshelf/)).toBeFalsy();
  });

  it("doesn't offer a look-inside button for a building with no furnished layout", async () => {
    renderApp();

    await screen.findByText(/Moonday, spring day 1/);

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
});
