// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import type { VillageFacts } from './village-api.js';
import { countdown, WorkAlong } from './WorkAlong.js';

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
  population: 1,
  villagers: [{ id: 'hesper', tradeId: 'mayor', role: 'mayor' }],
  builtBuildingIds: ['town-hall'],
  stores: {},
  treasuryCoins: 10,
  treasuryDeltaYesterday: 0,
  recentChronicle: [
    { minute: 1, kind: 'x', text: 'The market opened.', actors: [], importance: 1, public: true },
  ],
  festivals: [{ name: 'Sowing Fair', season: 'spring', seasonDay: 7 }],
  boardPosts: [],
  constructionSites: [],
};

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function stubFetch() {
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
          : url.includes('/api/work-along')
            ? { ok: true }
            : FACTS;
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
  window.localStorage.clear();
});

describe('the Morning Gazette', () => {
  it('opens with N, with the headlines, the almanac and the puzzle', async () => {
    stubFetch();
    withQueries(<App />);
    await screen.findByLabelText(/Moonday, spring day 1/);

    fireEvent.keyDown(window, { key: 'n' });
    const paper = screen.getByRole('dialog', { name: 'The Morning Gazette' });
    expect(paper.textContent).toContain('The market opened.');
    expect(paper.textContent).toContain('The Sowing Fair is in 6 days.');
    expect(screen.getByLabelText('Word search hiding: HESPER')).toBeTruthy();
  });
});

describe('work-along', () => {
  it('counts down a chosen session, then cheers and tells the village', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const posts = stubFetch();
    let now = 1_000_000;
    withQueries(<WorkAlong now={() => now} />);

    fireEvent.click(screen.getByRole('button', { name: 'Work along' }));
    fireEvent.click(screen.getByRole('button', { name: '25m' }));
    expect(screen.getByRole('timer', { name: 'Focus session' }).textContent).toContain('25:00');

    now += 25 * 60_000;
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(screen.getByRole('status').textContent).toBe(
      'The village cheers! 25 minutes of good work.',
    );
    expect(posts).toEqual([{ url: '/api/work-along', body: { minutes: 25 } }]);
  });

  it('records nothing when stopped early', () => {
    const posts = stubFetch();
    withQueries(<WorkAlong now={() => 0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Work along' }));
    fireEvent.click(screen.getByRole('button', { name: '50m' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('button', { name: 'Work along' })).toBeTruthy();
    expect(posts).toEqual([]);
  });

  it('shows minutes and seconds left', () => {
    expect(countdown(25 * 60_000)).toBe('25:00');
    expect(countdown(61_500)).toBe('1:02');
    expect(countdown(-5)).toBe('0:00');
  });
});
