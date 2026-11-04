/**
 * Spec section 2: "The sim hands its events back to the scheduler,
 * which decides whether a model turn should follow." This is that
 * decision for the one duty this project has a real routine for: spec
 * section 11's "The Mayor's day (village 08:00)".
 *
 * `runVillageDay` advances a whole simulated day at once - there's no
 * finer-grained tick yet (its own comment says so: "the headless
 * runner steps by whole days"), so "the Mayor's day" here means "once
 * per simulated day, right after it's run," not literally paused at
 * 08:00 village time, which the sim has no sub-day granularity to
 * represent. If there's no Mayor, the day still runs; nobody's duties
 * follow it.
 *
 * This only decides whether a turn *should* run and runs it - it is
 * not itself a live loop. Nothing calls this on a real-time interval
 * yet: that needs a `ModelClient` wired to a real provider and an API
 * key, which this project deliberately keeps out of server code (the
 * owner sets one by hand for a manual smoke test, never read from env
 * automatically) - the same boundary `models.ts`/`sim-tools.ts` already
 * draw around purposes and tools that are defined before they're wired
 * all the way to production.
 */

import { runVillageDay, type VillageState } from '@ai-village/sim';
import { type ApprovalsInbox } from './approvals.js';
import type { BudgetSettings } from './budget.js';
import { facts } from './facts.js';
import type { Meter } from './meter.js';
import { runTurn, type ModelClient } from './runner.js';
import { SIM_TOOLS } from './sim-tools.js';
import { resolveVillagerTools, ToolRegistry, type ToolDefinition } from './tools.js';

const MAYOR_TOOL_REGISTRY = new ToolRegistry();
for (const tool of SIM_TOOLS) {
  MAYOR_TOOL_REGISTRY.register(tool);
}
const MAYOR_TOOLS: readonly ToolDefinition[] = resolveVillagerTools(
  MAYOR_TOOL_REGISTRY,
  'mayor',
  [],
)
  .map((id) => MAYOR_TOOL_REGISTRY.get(id))
  .filter((tool): tool is ToolDefinition => tool !== undefined);

const MAYOR_DAY_REQUEST =
  "It's the start of a new village day. Attend to your duties: orders, hires, buildings, and anything worth telling the village.";

export interface MayorDayResult {
  state: VillageState;
  meter: Meter;
  inbox: ApprovalsInbox;
  /** The Mayor's reply this day - "" when there's no Mayor, or the turn ran out of steps without a final reply. */
  reply: string;
}

/**
 * Advances one village day, then - only if the village has a Mayor -
 * runs their `mayor-duties` turn with their governance tools
 * (`propose_building`, `accept_order`, `decline_order`, `call_vote`,
 * `propose_hire`), continuing whatever approvals/budget state the
 * caller already has.
 */
export async function runMayorDay(
  client: ModelClient,
  state: VillageState,
  inbox: ApprovalsInbox,
  meter: Meter = [],
  budgetSettings?: BudgetSettings,
): Promise<MayorDayResult> {
  const { state: dayState } = runVillageDay(state);

  const mayor = dayState.villagers.find((villager) => villager.role === 'mayor');
  if (!mayor) {
    return { state: dayState, meter, inbox, reply: '' };
  }

  const result = await runTurn(
    client,
    facts(dayState, 'owner', 'chat'),
    { id: mayor.villagerId, tradeId: mayor.tradeId, role: mayor.role },
    MAYOR_DAY_REQUEST,
    {
      state: dayState,
      tools: MAYOR_TOOLS,
      turn: { tainted: false },
      sessionApprovedToolIds: new Set(),
      inbox,
    },
    meter,
    {},
    budgetSettings,
    'mayor-duties',
  );

  return { state: result.state, meter: result.meter, inbox: result.inbox, reply: result.reply };
}
