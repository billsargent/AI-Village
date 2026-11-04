import { defaultBudgetSettings, runMayorDuties, type ModelClient } from '@ai-village/agent';
import { appendMeter, getSettings, loadMeterSince, type Database } from '@ai-village/db';
import type { LiveVillage, VillageChange } from './live-village.js';

/** Spec section 16's monthly ceiling is checked over the last 30 days of calls. */
const BUDGET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Why the Mayor did, or didn't, take a turn. */
export type MayorTurnOutcome =
  'ran' | 'off' | 'no-key' | 'no-ceiling' | 'over-budget' | 'busy' | 'failed';

export interface MayorSchedulerOptions {
  village: LiveVillage;
  db: Database;
  /** Builds a model client for the owner's key - a real DeepSeek client outside tests. */
  makeClient: (apiKey: string) => ModelClient;
  now?: () => number;
}

/**
 * Spec section 2: "The sim hands its events back to the scheduler, which
 * decides whether a model turn should follow." When the live clock
 * settles a new village day, this runs the Mayor's duties (spec section
 * 11's "The Mayor's day") - but only if the owner has turned the Mayor
 * on, saved a key and set a monthly ceiling, and the ceiling isn't
 * already reached. Each call goes on the persisted meter.
 *
 * Days caught up while the app was closed never get a turn (spec section
 * 5: "model turns are not replayed") - catch-up happens before anything
 * subscribes, so only a day the live clock reaches triggers one.
 */
export class MayorScheduler {
  private readonly options: MayorSchedulerOptions;
  private readonly now: () => number;
  private lastOutcome: { at: number; outcome: MayorTurnOutcome } | null = null;
  private running: Promise<void> = Promise.resolve();

  constructor(options: MayorSchedulerOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  /** Starts reacting to settled days; returns a function that stops it. */
  start(): () => void {
    return this.options.village.subscribe((change: VillageChange) => {
      if (change.settled.length > 0) {
        void this.runOnce();
      }
    });
  }

  /** Waits for any attempt still running - call before closing the database. */
  async idle(): Promise<void> {
    await this.running;
  }

  /** The most recent attempt, for the owner to see what the Mayor did. */
  get last(): { at: number; outcome: MayorTurnOutcome } | null {
    return this.lastOutcome;
  }

  /** One attempt at the Mayor's duties for the day the village is in now. */
  runOnce(): Promise<MayorTurnOutcome> {
    const run = this.attempt().then((outcome) => {
      this.lastOutcome = { at: this.now(), outcome };
      return outcome;
    });
    this.running = Promise.all([this.running, run]).then(() => undefined);
    return run;
  }

  private async attempt(): Promise<MayorTurnOutcome> {
    const { village, db, makeClient } = this.options;
    const settings = await getSettings(db);
    if (!settings.mayorAutonomy) {
      return 'off';
    }
    if (settings.deepseekApiKey === null) {
      return 'no-key';
    }
    if (settings.monthlyCeilingUsd === null) {
      return 'no-ceiling';
    }
    if (village.isTakingTurn) {
      return 'busy';
    }

    const meter = await loadMeterSince(db, this.now() - BUDGET_WINDOW_MS);
    const client = makeClient(settings.deepseekApiKey);
    const budget = defaultBudgetSettings(settings.monthlyCeilingUsd);

    let outcome: MayorTurnOutcome = 'ran';
    try {
      await village.takeTurn(async (state, inbox) => {
        const result = await runMayorDuties(client, state, inbox, meter, budget);
        await appendMeter(db, result.meter.slice(meter.length));
        if (result.budgetExceeded) {
          outcome = 'over-budget';
        }
        return { state: result.state, inbox: result.inbox };
      });
    } catch (error) {
      // A network or provider failure leaves the village as it was; the
      // Mayor simply skips this morning.
      console.error("AI-Village: the Mayor's turn failed", error);
      return 'failed';
    }
    return outcome;
  }
}
