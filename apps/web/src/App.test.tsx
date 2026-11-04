// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

/**
 * A fetch stub for the whole server: `facts` for the village, an empty
 * inbox, and the clock at 1x, plus anything in `extra` by path.
 */
function fetchServing(
  facts: VillageFacts,
  extra: Record<string, (init?: RequestInit) => unknown> = {},
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    const match = Object.keys(extra).find((path) => url.includes(path));
    const body = match
      ? extra[match]?.(init)
      : url.includes('/api/approvals')
        ? { pending: [], decided: [] }
        : url.includes('/api/clock')
          ? { speed: 1, paused: false }
          : facts;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
}

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
    vi.stubGlobal('fetch', fetchServing(FACTS));
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
    expect(screen.getByText('Hesper is in the bakery')).toBeTruthy();
  });

  it('says where everyone is, whichever map is showing', async () => {
    const facts: VillageFacts = {
      ...FACTS,
      villagers: [{ id: 'finn', tradeId: 'fisher', role: 'villager' }],
      builtBuildingIds: ['riverside-jetty'],
    };
    vi.stubGlobal('fetch', fetchServing(facts));
    renderApp();

    expect(await screen.findByText('Finn is at the jetty')).toBeTruthy();
    fireEvent.click(screen.getByText('Riverside'));
    expect(screen.getByText('Finn is at the jetty')).toBeTruthy();
  });

  it('looks inside a furnished building and back out again', async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['cottage'] };
    vi.stubGlobal('fetch', fetchServing(facts));
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
    vi.stubGlobal('fetch', fetchServing(facts));
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
    vi.stubGlobal('fetch', fetchServing(facts));
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    fireEvent.click(screen.getByText('Look inside Shop'));

    expect(await screen.findByText('Click the counter for the stores.')).toBeTruthy();
    expect(screen.queryByText('Stores')).toBeFalsy();
  });

  it("doesn't show the bookshelf hint for a building without one", async () => {
    const facts: VillageFacts = { ...FACTS, builtBuildingIds: ['cottage'] };
    vi.stubGlobal('fetch', fetchServing(facts));
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

  it("changes the clock's speed from the clock panel", async () => {
    let clock = { speed: 1, paused: false };
    const posted: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      fetchServing(FACTS, {
        '/api/clock': (init) => {
          if (init?.method === 'POST') {
            const body = JSON.parse(init.body as string) as { speed: number };
            posted.push(body);
            clock = { speed: body.speed, paused: body.speed === 0 };
          }
          return clock;
        },
      }),
    );
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Normal speed' }).getAttribute('aria-pressed'),
      ).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });
    expect(posted).toEqual([{ speed: 0 }]);
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
              new Response(
                JSON.stringify({
                  hasDeepseekApiKey,
                  mayorAutonomy: false,
                  monthlyCeilingUsd: null,
                  spentThisMonthUsd: 0,
                  mayorLastTurn: null,
                }),
                { status: 200 },
              ),
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

describe('the inbox', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const HIRE = {
    id: 1,
    toolId: 'propose_hire',
    args: { tradeId: 'fisher', reason: 'nobody fishes yet' },
    risk: 'medium',
    preview: 'Hire a fisher: nobody fishes yet',
    requestedBy: 'hesper',
    status: 'pending',
    createdAt: 0,
  };

  it('shows how many approvals are waiting, and approving one sends the decision', async () => {
    let pending = [HIRE];
    const decisions: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      fetchServing(FACTS, {
        '/api/approvals/1': (init) => {
          decisions.push(JSON.parse(init?.body as string));
          pending = [];
          return { ...HIRE, status: 'approved' };
        },
        '/api/approvals': () => ({ pending, decided: [] }),
      }),
    );
    renderApp();

    const bell = await screen.findByRole('button', { name: 'Inbox: 1 waiting on you' });
    fireEvent.click(bell);
    expect(await screen.findByText('Hire a fisher: nobody fishes yet')).toBeTruthy();
    expect(screen.getByText('Asked by hesper - medium risk')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Approve: Hire a fisher: nobody fishes yet' }),
    );

    expect(await screen.findByText('Nothing is waiting on you.')).toBeTruthy();
    expect(decisions).toEqual([{ decision: 'approved' }]);
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeTruthy();
  });
});

describe("the Mayor's settings", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("can't be switched on until there's a key and a ceiling, then can", async () => {
    let status = {
      hasDeepseekApiKey: true,
      mayorAutonomy: false,
      monthlyCeilingUsd: null as number | null,
      spentThisMonthUsd: 0,
      mayorLastTurn: null,
    };
    const saved: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      fetchServing(FACTS, {
        '/api/settings': (init) => {
          if (init?.method === 'POST') {
            const changes = JSON.parse(init.body as string) as Partial<typeof status>;
            saved.push(changes);
            status = { ...status, ...changes };
          }
          return status;
        },
      }),
    );
    renderApp();

    await screen.findByLabelText(/Moonday, spring day 1/);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const toggle = await screen.findByRole<HTMLInputElement>('checkbox', {
      name: 'Let the Mayor act each morning',
    });
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText('Save a key and set a ceiling to turn this on.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Monthly ceiling $'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set ceiling' }));
    const mayorToggle = () =>
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Let the Mayor act each morning' });
    await waitFor(() => {
      expect(mayorToggle().disabled).toBe(false);
    });
    expect(screen.getByText('Spent in the last 30 days: $0.00 of $2.00')).toBeTruthy();

    fireEvent.click(mayorToggle());
    await waitFor(() => {
      expect(mayorToggle().checked).toBe(true);
    });
    expect(saved).toEqual([{ monthlyCeilingUsd: 2 }, { mayorAutonomy: true }]);
  });
});

describe('chatting with a villager', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const SETTINGS = {
    hasDeepseekApiKey: true,
    mayorAutonomy: false,
    monthlyCeilingUsd: null,
    spentThisMonthUsd: 0,
    mayorLastTurn: null,
  };

  it('opens a chat from the People list, sends a message and shows the reply', async () => {
    const sent: unknown[] = [];
    let lines: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      fetchServing(FACTS, {
        '/api/settings': () => SETTINGS,
        '/api/villagers/hesper/chat': (init) => {
          if (init?.method === 'POST') {
            sent.push(JSON.parse(init.body as string));
            lines = [
              { from: 'owner', text: 'Any bread today?', at: 1 },
              { from: 'villager', text: 'Twelve loaves, fresh this morning.', at: 2 },
            ];
            return { lines, approvalRequested: false };
          }
          return { lines };
        },
      }),
    );
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Chat with Hesper' }));
    expect(await screen.findByText('Say hello to Hesper.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Message to Hesper'), {
      target: { value: 'Any bread today?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Twelve loaves, fresh this morning.')).toBeTruthy();
    expect(sent).toEqual([{ message: 'Any bread today?' }]);
    expect(screen.getByLabelText<HTMLInputElement>('Message to Hesper').value).toBe('');
  });

  it('points to Settings instead of offering a message box when no key is saved', async () => {
    vi.stubGlobal(
      'fetch',
      fetchServing(FACTS, {
        '/api/settings': () => ({ ...SETTINGS, hasDeepseekApiKey: false }),
        '/api/villagers/hesper/chat': () => ({ lines: [] }),
      }),
    );
    renderApp();
    await screen.findByRole('button', { name: 'Chat with Hesper' });

    fireEvent.keyDown(window, { key: 'c' });
    expect(
      await screen.findByText('Save a DeepSeek API key in Settings to chat with Hesper.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Message to Hesper')).toBeNull();
  });
});

describe('the villager card', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const CARD = {
    id: 'hesper',
    tradeId: 'baker',
    role: 'villager',
    skillLevel: 2,
    traits: [
      { id: 'hardworking', howTheyTalk: 'Practical', isFlaw: false },
      { id: 'grumpy', howTheyTalk: 'Short and dry', isFlaw: true },
    ],
    needs: { hunger: 80, energy: 25, social: 60, fun: 70, comfort: 90, purpose: 55 },
    mood: 63,
    relationships: [{ villagerId: 'ada', label: 'close-friend', affinity: 70, familiarity: 90 }],
    memories: [{ text: "The owner's favourite food is plum jam", about: 'owner' }],
    promises: [{ text: 'Save a loaf for the owner', daysLeft: 1 }],
  };

  it('opens from the People list with needs, mood, friends, memories and promises, then goes to chat', async () => {
    vi.stubGlobal(
      'fetch',
      fetchServing(FACTS, {
        '/api/villagers/hesper/chat': () => ({ lines: [] }),
        '/api/villagers/hesper': () => CARD,
        '/api/settings': () => ({
          hasDeepseekApiKey: true,
          mayorAutonomy: false,
          monthlyCeilingUsd: null,
          spentThisMonthUsd: 0,
          mayorLastTurn: null,
        }),
      }),
    );
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'About Hesper' }));
    expect(await screen.findByText('Hesper, the baker')).toBeTruthy();
    expect(screen.getByText('Skill 2 of 5 - in the bakery right now')).toBeTruthy();
    expect(screen.getByText('Mood: Content (63)')).toBeTruthy();
    expect(screen.getByLabelText('Traits').textContent).toBe('Hardworking, Grumpy (a flaw)');
    expect(screen.getByRole('meter', { name: 'Energy' }).getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getByText('Ada - close friend')).toBeTruthy();
    expect(screen.getByText("The owner's favourite food is plum jam")).toBeTruthy();
    expect(screen.getByText('Save a loaf for the owner - due in 1 day')).toBeTruthy();

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Chat with Hesper' }),
    );
    expect(await screen.findByText('Say hello to Hesper.')).toBeTruthy();
    expect(screen.queryByText('Mood: Content (63)')).toBeNull();
  });
});
