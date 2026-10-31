// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
  weather: 'clear',
  isMarketDay: false,
  festival: null,
  population: 2,
  villagers: [],
  builtBuildingIds: [],
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
    vi.unstubAllGlobals();
  });

  it('shows the village facts once loaded', async () => {
    renderApp();

    expect(await screen.findByText(/Moonday, spring day 1/)).toBeTruthy();
    expect(screen.getByText('Population: 2')).toBeTruthy();
    expect(screen.getByText('Treasury: 40 coins')).toBeTruthy();
    expect(screen.getByText('The market opened for the day.')).toBeTruthy();
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
