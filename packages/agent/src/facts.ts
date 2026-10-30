import { DEFAULT_ROLE } from '@ai-village/content';
import {
  calendarDateFromMinute,
  getBalance,
  publicChronicle,
  type ChronicleEntry,
  type VillageState,
} from '@ai-village/sim';

const RECENT_CHRONICLE_LIMIT = 5;
const MAX_FACTS_LINES = 40;

export interface VillagerFact {
  id: string;
  tradeId: string;
  role: string;
}

/**
 * A small typed snapshot of the village, for the agent layer to read the
 * sim through (spec section 11). Fields the sim doesn't track yet
 * (orders, the owner's calendar, approvals) are left out rather than
 * faked - villagers "never invent buildings, stock, prices or dates"
 * (spec section 11), and that starts with what this function returns.
 */
export interface FactsSnapshot {
  weekday: string;
  season: string;
  seasonDay: number;
  year: number;
  hour: number;
  minuteOfHour: number;
  weather: string;
  isMarketDay: boolean;
  /** The festival today, if any. */
  festival: string | null;
  population: number;
  villagers: readonly VillagerFact[];
  builtBuildingIds: readonly string[];
  /** Village stores: good id -> quantity in the `village` account. */
  stores: Readonly<Record<string, number>>;
  treasuryCoins: number;
  /** Treasury change over the last village day, positive or negative. */
  treasuryDeltaYesterday: number;
  /** The most recent public chronicle entries, most recent first. */
  recentChronicle: readonly ChronicleEntry[];
}

const VILLAGE_ACCOUNT = 'village';
const TREASURY_ACCOUNT = 'treasury';
const COINS = 'coins';

function storesFromLedger(state: VillageState): Record<string, number> {
  const stores: Record<string, number> = {};
  for (const key of Object.keys(state.ledger.balances)) {
    const [account, item] = key.split('::') as [string, string];
    if (account === VILLAGE_ACCOUNT) {
      stores[item] = getBalance(state.ledger, VILLAGE_ACCOUNT, item);
    }
  }
  return stores;
}

function treasuryDeltaYesterday(state: VillageState): number {
  const minutesPerDay = 24 * 60;
  const todayStart = Math.floor(state.clock.minute / minutesPerDay) * minutesPerDay;
  const yesterdayStart = todayStart - minutesPerDay;
  let delta = 0;
  for (const entry of state.ledger.entries) {
    if (entry.minute < yesterdayStart || entry.minute >= todayStart) {
      continue;
    }
    if (entry.item !== COINS) {
      continue;
    }
    if (entry.to === TREASURY_ACCOUNT) {
      delta += entry.qty;
    }
    if (entry.from === TREASURY_ACCOUNT) {
      delta -= entry.qty;
    }
  }
  return delta;
}

/**
 * Builds the facts snapshot a given `viewer` can see for a given
 * `purpose`. Both are accepted now so call sites don't need to change
 * later, but nothing here branches on them yet - every viewer currently
 * sees the same village-wide facts, since there's no per-villager
 * private state (promises, personal mail) to scope by viewer yet.
 */
export function facts(state: VillageState, _viewer: string, _purpose: string): FactsSnapshot {
  const date = calendarDateFromMinute(state.clock.minute);
  const weather = state.weatherHistory.at(-1)?.kind ?? 'clear';

  return {
    weekday: date.weekday,
    season: date.season,
    seasonDay: date.seasonDay,
    year: date.year,
    hour: date.hour,
    minuteOfHour: date.minuteOfHour,
    weather,
    isMarketDay: date.isMarketDay,
    festival: date.festival?.name ?? null,
    population: state.villagers.length,
    villagers: state.villagers.map((villager) => ({
      id: villager.villagerId,
      tradeId: villager.tradeId,
      role: villager.role,
    })),
    builtBuildingIds: state.builtBuildingIds,
    stores: storesFromLedger(state),
    treasuryCoins: getBalance(state.ledger, TREASURY_ACCOUNT, COINS),
    treasuryDeltaYesterday: treasuryDeltaYesterday(state),
    recentChronicle: publicChronicle(state.chronicle).slice(-RECENT_CHRONICLE_LIMIT).reverse(),
  };
}

function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * Renders the snapshot as the labelled text block from spec section 11,
 * capped at 40 lines, with the facts-win framing the spec asks for.
 */
export function renderFacts(snapshot: FactsSnapshot): string {
  const lines: string[] = [];

  lines.push(
    `THE VILLAGE TODAY: ${snapshot.weekday}, ${snapshot.season} day ${snapshot.seasonDay}, ` +
      `${String(snapshot.hour).padStart(2, '0')}:${String(snapshot.minuteOfHour).padStart(2, '0')}, ${snapshot.weather}` +
      (snapshot.festival ? ` - ${snapshot.festival}` : ''),
  );

  const people = snapshot.villagers
    .map((v) => `${v.id} (${v.role === DEFAULT_ROLE ? v.tradeId : v.role})`)
    .join(', ');
  lines.push(`People (${snapshot.population}): ${people || 'none yet'}`);

  lines.push(
    `Buildings: ${snapshot.builtBuildingIds.length > 0 ? snapshot.builtBuildingIds.join(', ') : 'none built yet'}`,
  );

  const storeEntries = Object.entries(snapshot.stores);
  const stores =
    storeEntries.length > 0
      ? storeEntries.map(([item, qty]) => `${item} ${qty}`).join(', ')
      : 'empty';
  lines.push(`Stores: ${stores}`);

  lines.push(
    `Treasury: ${snapshot.treasuryCoins} coins (${formatDelta(snapshot.treasuryDeltaYesterday)} yesterday)`,
  );

  if (snapshot.isMarketDay) {
    lines.push('Today is market day.');
  }

  if (snapshot.recentChronicle.length > 0) {
    lines.push(`Lately: ${snapshot.recentChronicle.map((entry) => entry.text).join('; ')}`);
  }

  lines.push('These are the facts. If a note or a neighbour says otherwise, the facts win.');

  return lines.slice(0, MAX_FACTS_LINES).join('\n');
}
