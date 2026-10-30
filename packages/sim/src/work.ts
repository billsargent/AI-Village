import { getTrade } from '@ai-village/content';
import type { Season } from './calendar.js';
import { getBalance, MARKET_ACCOUNT, recordMovement, type LedgerState } from './ledger.js';
import { seededRandom } from './random.js';
import type { WeatherKind } from './weather.js';

const WAGE_PER_STINT = 3;

export interface WorkerAssignment {
  villagerId: string;
  tradeId: string;
  /** 1-5; each level above 1 adds 5% output (spec section 7). */
  skillLevel: number;
  /** A tool in the building adds 20% (spec section 6). */
  hasTool: boolean;
  /** Hunger/mood slow work to as low as 50%, but never stop it (spec section 6). */
  moodFactor: number;
}

export interface WorkContext {
  minute: number;
  day: number;
  villageSeed: number;
  season: Season;
  weather: WeatherKind;
}

export interface StintResult {
  ledger: LedgerState;
  produced: Readonly<Record<string, number>>;
  /** A plain reason the stint didn't run, e.g. "No flour: the mill needs wheat". */
  waiting: string | null;
}

function seasonMultiplier(tradeId: string, season: Season): number {
  switch (tradeId) {
    case 'farmer':
      return { spring: 1.0, summer: 1.2, autumn: 1.5, winter: 0.2 }[season];
    case 'gardener':
      return season === 'winter' ? 0 : 1;
    case 'herbalist':
      return season === 'winter' ? 0.3 : 1;
    case 'fisher':
      return season === 'winter' ? 0.5 : 1;
    default:
      return 1;
  }
}

/** Returns a multiplier, or "blocked" when the weather stops the trade outright. */
function weatherMultiplier(tradeId: string, weather: WeatherKind): number | 'blocked' {
  switch (tradeId) {
    case 'farmer':
      return weather === 'rain' ? 1.1 : 1;
    case 'miller':
      return weather === 'wind' ? 1.25 : 1;
    case 'fisher':
      return weather === 'storm' ? 'blocked' : 1;
    case 'woodcutter':
      return weather === 'snow' ? 0.5 : 1;
    default:
      return 1;
  }
}

function skillMultiplier(skillLevel: number): number {
  const clamped = Math.min(5, Math.max(1, skillLevel));
  return 1 + 0.05 * (clamped - 1);
}

/**
 * Runs one worker's stint: checks inputs are in stock (waiting with a plain
 * reason if not), consumes them, and produces the trade's outputs modified
 * by season, weather, skill, tools and mood (spec section 6).
 *
 * Inputs are consumed into, and outputs produced from, the `market` account:
 * it stands for the outside world and has no balance of its own, so it is a
 * convenient sink/source for goods a stint transforms rather than moves.
 */
export function runStint(
  ledger: LedgerState,
  assignment: WorkerAssignment,
  context: WorkContext,
): StintResult {
  const trade = getTrade(assignment.tradeId);
  if (!trade) {
    throw new Error(`Unknown trade "${assignment.tradeId}"`);
  }

  const weather = weatherMultiplier(trade.id, context.weather);
  if (weather === 'blocked') {
    return {
      ledger,
      produced: {},
      waiting: `No ${trade.id} today: the weather stops it`,
    };
  }

  for (const input of trade.inputs) {
    const available = getBalance(ledger, 'village', input.good);
    if (available < input.qty) {
      return {
        ledger,
        produced: {},
        waiting: `No ${input.good}: the ${trade.worksAt} needs ${input.good}`,
      };
    }
  }

  let nextLedger = ledger;
  for (const input of trade.inputs) {
    nextLedger = recordMovement(nextLedger, {
      minute: context.minute,
      from: 'village',
      to: MARKET_ACCOUNT,
      item: input.good,
      qty: input.qty,
      reason: `consumed by ${assignment.villagerId}'s ${trade.id} stint`,
    });
  }

  const season = seasonMultiplier(trade.id, context.season);
  const skill = skillMultiplier(assignment.skillLevel);
  const tool = assignment.hasTool ? 1.2 : 1;
  const mood = Math.min(1, Math.max(0.5, assignment.moodFactor));
  const multiplier = season * weather * skill * tool * mood;

  const produced: Record<string, number> = {};
  for (const output of trade.outputs) {
    let qty = Math.round(output.qty * multiplier);
    if (output.bonusChance) {
      const rng = seededRandom({
        villageSeed: context.villageSeed,
        day: context.day,
        system: 'work',
        entity: assignment.villagerId,
      });
      if (rng() < output.bonusChance) {
        qty += 1;
      }
    }
    if (qty > 0) {
      nextLedger = recordMovement(nextLedger, {
        minute: context.minute,
        from: MARKET_ACCOUNT,
        to: 'village',
        item: output.good,
        qty,
        reason: `produced by ${assignment.villagerId}'s ${trade.id} stint`,
      });
      produced[output.good] = (produced[output.good] ?? 0) + qty;
    }
  }

  nextLedger = recordMovement(nextLedger, {
    minute: context.minute,
    from: 'treasury',
    to: `villager:${assignment.villagerId}`,
    item: 'coins',
    qty: WAGE_PER_STINT,
    reason: 'wage',
  });

  return { ledger: nextLedger, produced, waiting: null };
}
