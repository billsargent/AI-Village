import {
  createApprovalsInbox,
  decideApproval,
  requestApproval,
  SIM_TOOLS,
  ToolRegistry,
  type ApprovalRequest,
  type ApprovalsInbox,
  type ApprovalStatus,
  type ToolDefinition,
  type ToolRisk,
} from '@ai-village/agent';
import {
  loadApprovals,
  loadVillage,
  saveApprovals,
  saveVillage,
  type ApprovalRow,
  type Database,
} from '@ai-village/db';
import {
  catchUpLiveClock,
  clockSettingsSchema,
  setClockSpeed,
  settleDueDays,
  tickLiveClock,
  type ClockSettings,
  type ClockSpeed,
  type DayReport,
  type VillageState,
} from '@ai-village/sim';
import { fromSnapshot, toSnapshot } from './village-persistence.js';

/** How often the village is saved while it runs, besides on every settled day and speed change. */
const DEFAULT_SAVE_EVERY_MS = 60_000;

export interface LiveVillageOptions {
  db: Database;
  /** A new village, used only when the database doesn't hold one yet. */
  bootstrap: () => VillageState;
  /** Wall-clock milliseconds - injectable so tests can drive time. */
  now?: () => number;
  settings?: ClockSettings;
  saveEveryMs?: number;
}

/** Every tool an approval can name - an approved request runs through this. */
const TOOL_REGISTRY = new ToolRegistry();
for (const tool of SIM_TOOLS) {
  TOOL_REGISTRY.register(tool);
}

function toApprovalRows(inbox: ApprovalsInbox): ApprovalRow[] {
  return inbox.requests.map((request) => ({ ...request }));
}

function fromApprovalRows(rows: readonly ApprovalRow[]): ApprovalsInbox {
  return {
    requests: rows.map((row) => ({
      ...row,
      risk: row.risk as ToolRisk,
      status: row.status as ApprovalStatus,
    })),
    nextId: rows.reduce((max, row) => Math.max(max, row.id + 1), 1),
  };
}

/** What changed in one update, for anyone listening. */
export interface VillageChange {
  /** Days whose systems just ran, oldest first. */
  settled: readonly DayReport[];
}

type Listener = (change: VillageChange) => void;

/**
 * The server's one live village (spec section 2: "One Node server process
 * hosts the API, live updates, the scheduler and the sim"). Owns the
 * state; everything else reads it through `state` and changes it only
 * through this class, so ticking, saving and live updates stay in one
 * place.
 *
 * It doesn't run its own timer - the process calls `tick()` (see
 * `index.ts`), which keeps it deterministic under test.
 */
export class LiveVillage {
  private current: VillageState;
  private approvals: ApprovalsInbox;
  private lastTickAt: number;
  private lastSaveAt: number;
  private saving: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<Listener>();
  private readonly db: Database;
  private readonly now: () => number;
  private readonly settings: ClockSettings;
  private readonly saveEveryMs: number;

  private constructor(state: VillageState, inbox: ApprovalsInbox, options: LiveVillageOptions) {
    this.current = state;
    this.approvals = inbox;
    this.db = options.db;
    this.now = options.now ?? Date.now;
    this.settings = options.settings ?? clockSettingsSchema.parse({});
    this.saveEveryMs = options.saveEveryMs ?? DEFAULT_SAVE_EVERY_MS;
    this.lastTickAt = this.now();
    this.lastSaveAt = this.lastTickAt;
  }

  /**
   * Loads the saved village and catches it up for the time the app was
   * closed (spec section 5: rules only, capped, never while paused), or
   * starts a new one from `bootstrap` and saves it straight away.
   */
  static async open(options: LiveVillageOptions): Promise<LiveVillage> {
    const now = options.now ?? Date.now;
    const settings = options.settings ?? clockSettingsSchema.parse({});
    const snapshot = await loadVillage(options.db);

    let state: VillageState;
    if (snapshot) {
      state = fromSnapshot(snapshot);
      const savedAt = snapshot.clock.savedAtRealMs;
      const away = savedAt === null || state.clock.paused ? 0 : Math.max(0, now() - savedAt);
      state = catchUpLiveClock(state, away, settings).state;
    } else {
      state = settleDueDays(options.bootstrap()).state;
    }

    const inbox = snapshot
      ? fromApprovalRows(await loadApprovals(options.db))
      : createApprovalsInbox();

    const village = new LiveVillage(state, inbox, options);
    await village.save();
    return village;
  }

  get state(): VillageState {
    return this.current;
  }

  /** Spec section 12's approvals inbox: every tool call waiting on, or decided by, the owner. */
  get inbox(): ApprovalsInbox {
    return this.approvals;
  }

  /** Queues a tool call for the owner to decide - how a villager's turn asks for something risky. */
  async requestApproval(
    tool: ToolDefinition,
    args: unknown,
    requestedBy: string,
  ): Promise<ApprovalRequest> {
    const { inbox, request } = requestApproval(this.approvals, tool, args, requestedBy, this.now());
    this.approvals = inbox;
    await this.save();
    this.notify({ settled: [] });
    return request;
  }

  /**
   * The owner's decision. Approving runs the tool now, against the
   * village as it is (`decideApproval`); if that fails - say, no free
   * names are left for a hire - nothing changes and the error is thrown,
   * so the request stays pending for the owner to decline instead.
   */
  async decide(
    id: number,
    decision: Extract<ApprovalStatus, 'approved' | 'declined'>,
  ): Promise<ApprovalRequest> {
    const result = decideApproval(this.approvals, TOOL_REGISTRY, id, decision, this.current);
    this.approvals = result.inbox;
    this.current = result.state;
    await this.save();
    this.notify({ settled: [] });
    const decided = this.approvals.requests.find((request) => request.id === id);
    if (!decided) {
      throw new Error(`Unknown approval #${id}`);
    }
    return decided;
  }

  /** Real time since the last tick passes on the village clock; any day it reaches is settled. */
  async tick(): Promise<VillageChange> {
    const now = this.now();
    const elapsed = now - this.lastTickAt;
    this.lastTickAt = now;

    const before = this.current;
    const result = tickLiveClock(before, elapsed, this.settings);
    this.current = result.state;

    if (result.settled.length > 0 || now - this.lastSaveAt >= this.saveEveryMs) {
      await this.save();
    }
    // Listeners hear about a new village minute or a settled day - not
    // every fraction of a minute the clock moves between them.
    if (
      result.settled.length > 0 ||
      Math.floor(result.state.clock.minute) !== Math.floor(before.clock.minute)
    ) {
      this.notify({ settled: result.settled });
    }
    return { settled: result.settled };
  }

  /** Spec section 14's speed controls: pause (0), 1x, 2x, 4x. */
  async setSpeed(speed: ClockSpeed): Promise<void> {
    // Bank the time that passed at the old speed before switching.
    await this.tick();
    this.current = { ...this.current, clock: setClockSpeed(this.current.clock, speed) };
    await this.save();
    this.notify({ settled: [] });
  }

  /** Calls `listener` after every visible change; returns a function that stops it. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Saves the whole village. Saves never overlap - each waits for the one
   * before - and one failed save doesn't stop the next from trying.
   */
  save(): Promise<void> {
    this.lastSaveAt = this.now();
    const snapshot = toSnapshot(this.current, this.lastSaveAt);
    const approvals = toApprovalRows(this.approvals);
    this.saving = this.saving
      .catch(() => undefined)
      .then(async () => {
        await saveVillage(this.db, snapshot);
        await saveApprovals(this.db, approvals);
      });
    return this.saving;
  }

  /** Waits for any save still in flight - call before closing the database. */
  async flush(): Promise<void> {
    await this.saving.catch(() => undefined);
  }

  private notify(change: VillageChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}
