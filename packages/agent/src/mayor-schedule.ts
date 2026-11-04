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
 * This only runs a turn - it isn't a loop. The live server's
 * `MayorScheduler` (apps/server) calls `runMayorDuties` when its clock
 * settles a new day, and only if the owner has switched the Mayor on,
 * saved a key and set a monthly ceiling.
 */

import { runVillageDay, type VillageState } from '@ai-village/sim';
import { type ApprovalsInbox } from './approvals.js';
import type { BudgetSettings } from './budget.js';
import { facts } from './facts.js';
import type { Meter } from './meter.js';
import { runTurn, type BudgetExceededReason, type ModelClient } from './runner.js';
import { SIM_TOOLS } from './sim-tools.js';
import { resolveVillagerTools, ToolRegistry, type ToolDefinition } from './tools.js';

const MAYOR_TOOL_REGISTRY = new ToolRegistry();
for (const tool of SIM_TOOLS) {
  MAYOR_TOOL_REGISTRY.register(tool);
}
// The governance tools, plus the board: spec section 11's Mayor's day ends
// with "otherwise post a short note on the board".
const MAYOR_TOOLS: readonly ToolDefinition[] = resolveVillagerTools(MAYOR_TOOL_REGISTRY, 'mayor', [
  { tool: 'post_on_board', grant: '+' },
])
  .map((id) => MAYOR_TOOL_REGISTRY.get(id))
  .filter((tool): tool is ToolDefinition => tool !== undefined);

/**
 * Spec section 11's "The Mayor's day", as the morning's request. Nobody
 * is there to answer a question at this hour, so it says so: a Mayor
 * that asks "shall I hire a farmer?" instead of proposing one would ask
 * every morning and never act. Anything that needs the owner's say waits
 * in their inbox by itself when the tool is called.
 */
const MAYOR_DAY_REQUEST = [
  "It's the start of a new village day, and these are your morning duties as Mayor.",
  'Nobody will reply to this message, so act through your tools rather than asking questions.',
  "Anything that needs the owner's say, like a hire, goes to their inbox for approval when you call the tool - so go ahead and propose it.",
  '1. Accept or decline any new orders.',
  '2. If a building has no one to work it, or a trade the village needs is missing, propose a hire for that trade.',
  '3. If a building is needed and the treasury can afford it, propose it.',
  '4. If two or more matters need the village, call a vote; otherwise post a short note on the board.',
  'Then finish with one or two sentences on what you did and why.',
].join('\n');

export interface MayorDayResult {
  state: VillageState;
  meter: Meter;
  inbox: ApprovalsInbox;
  /** The Mayor's reply this day - "" when there's no Mayor, or the turn ran out of steps without a final reply. */
  reply: string;
  /** Set when a budget stopped the turn before it called the model (spec section 16). */
  budgetExceeded?: BudgetExceededReason;
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
  return runMayorDuties(client, dayState, inbox, meter, budgetSettings);
}

/**
 * The Mayor's duties for the day the village is already in, without
 * running the day itself - for a live village whose clock has just
 * settled it. Does nothing, and costs nothing, when there's no Mayor.
 */
export async function runMayorDuties(
  client: ModelClient,
  state: VillageState,
  inbox: ApprovalsInbox,
  meter: Meter = [],
  budgetSettings?: BudgetSettings,
): Promise<MayorDayResult> {
  const mayor = state.villagers.find((villager) => villager.role === 'mayor');
  if (!mayor) {
    return { state, meter, inbox, reply: '' };
  }

  const result = await runTurn(
    client,
    facts(state, 'owner', 'chat'),
    { id: mayor.villagerId, tradeId: mayor.tradeId, role: mayor.role },
    MAYOR_DAY_REQUEST,
    {
      state,
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

  return {
    state: result.state,
    meter: result.meter,
    inbox: result.inbox,
    reply: result.reply,
    ...(result.budgetExceeded ? { budgetExceeded: result.budgetExceeded } : {}),
  };
}
