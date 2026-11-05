// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import type { VillageFacts } from './village-api.js';

const FACTS: VillageFacts = {
  weekday: 'Moonday',
  season: 'spring',
  seasonDay: 1,
  year: 0,
  hour: 23,
  minuteOfHour: 0,
  phase: 'night',
  weather: 'clear',
  isMarketDay: false,
  festival: null,
  population: 2,
  villagers: [
    { id: 'hesper', tradeId: 'mayor', role: 'mayor' },
    { id: 'ada', tradeId: 'farmer', role: 'villager' },
  ],
  builtBuildingIds: ['town-hall', 'cottage'],
  stores: {},
  treasuryCoins: 10,
  treasuryDeltaYesterday: 0,
  recentChronicle: [],
  festivals: [],
  boardPosts: [],
};

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

/** Serves the facts, a clock that remembers POSTs, and a plain card for anyone. */
function stubFetch() {
  let clock = { speed: 2, paused: false };
  const clockPosts: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      let body: unknown = FACTS;
      if (url.includes('/api/clock')) {
        if (init?.method === 'POST') {
          const posted = JSON.parse(init.body as string) as { speed: number };
          clockPosts.push(posted);
          clock = { speed: posted.speed, paused: posted.speed === 0 };
        }
        body = clock;
      } else if (url.includes('/api/approvals')) {
        body = { pending: [], decided: [] };
      } else if (url.includes('/api/villagers/')) {
        body = {
          id: 'hesper',
          tradeId: 'mayor',
          role: 'mayor',
          skillLevel: 1,
          traits: [],
          needs: null,
          mood: null,
          relationships: [],
          memories: [],
          promises: [],
        };
      }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
  return clockPosts;
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.style.fontSize = '';
  window.localStorage.clear();
});

describe('the building card', () => {
  it("opens from the map's hotspots, says who lives there and who's in, and goes inside", async () => {
    stubFetch();
    renderApp();

    const hotspots = await screen.findByRole('navigation', { name: 'On the map' });
    // At night everyone is home, so the cottage's lit windows say so.
    fireEvent.click(
      within(hotspots).getByRole('button', { name: 'The cottage: Hesper and Ada are home' }),
    );

    const card = screen.getByRole('dialog', { name: 'Cottage' });
    expect(card.textContent).toContain('Home to Hesper and Ada.');
    expect(card.textContent).toContain('Hesper and Ada are inside now.');

    fireEvent.click(within(card).getByRole('button', { name: 'Go inside' }));
    expect(screen.queryByRole('dialog')).toBeFalsy();
    expect(screen.getByRole('region', { name: 'Inside the Cottage' })).toBeTruthy();
  });

  it('names the keeper of a workplace', async () => {
    stubFetch();
    renderApp();

    const hotspots = await screen.findByRole('navigation', { name: 'On the map' });
    fireEvent.click(within(hotspots).getByRole('button', { name: /^The town hall/ }));
    expect(screen.getByRole('dialog', { name: 'Town Hall' }).textContent).toContain(
      'Worked by Hesper',
    );
  });
});

describe('the command palette', () => {
  it('opens with Ctrl+K, finds the inbox by name, and opens it', async () => {
    stubFetch();
    renderApp();
    await screen.findByLabelText(/Moonday, spring day 1/);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const search = screen.getByRole('combobox', { name: 'Search places, villagers and actions' });
    fireEvent.change(search, { target: { value: 'inbox' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeFalsy();
    expect(await screen.findByRole('dialog', { name: 'Inbox' })).toBeTruthy();
  });

  it('finds a villager by their trade', async () => {
    stubFetch();
    renderApp();
    await screen.findByLabelText(/Moonday, spring day 1/);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'farmer' } });
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options[0]).toContain('Ada');
    expect(options.every((text) => text.includes('Ada'))).toBe(true);
  });
});

describe('Space', () => {
  it('pauses the clock, and resumes it at the speed it had', async () => {
    const posts = stubFetch();
    renderApp();
    await screen.findByLabelText(/Moonday, spring day 1/);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Double speed' }).getAttribute('aria-pressed'),
      ).toBe('true');
    });

    fireEvent.keyDown(window, { key: ' ' });
    await waitFor(() => {
      expect(posts).toEqual([{ speed: 0 }]);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });

    fireEvent.keyDown(window, { key: ' ' });
    await waitFor(() => {
      expect(posts).toEqual([{ speed: 0 }, { speed: 2 }]);
    });
  });
});

describe('following a villager', () => {
  it("starts from their card, shows who you're following, and stops", async () => {
    stubFetch();
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'About Hesper' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Follow Hesper' }));

    expect(screen.queryByRole('dialog')).toBeFalsy();
    expect(screen.getByText('Following Hesper')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.queryByText('Following Hesper')).toBeFalsy();
  });
});

describe('text size', () => {
  it('grows every panel from Settings, and is remembered', async () => {
    stubFetch();
    renderApp();
    await screen.findByLabelText(/Moonday, spring day 1/);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Text size' })).getByRole('button', {
        name: '130%',
      }),
    );
    expect(document.documentElement.style.fontSize).toBe('130%');
    expect(window.localStorage.getItem('ai-village.text-size')).toBe('130');
  });
});
