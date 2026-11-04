/**
 * Spec section 11's "Chat with the owner": one villager, the talk model
 * with thinking off, up to 4 steps, with their game actions plus
 * `remember`, `promise` and `request_work`. "Chat never runs real tools
 * itself" - every tool here is a game action against the sim, and
 * `request_work` only queues a request.
 */

import type { ChatMessage } from '@ai-village/integrations';
import { topMemoriesFor, type VillageState } from '@ai-village/sim';
import type { ApprovalsInbox } from './approvals.js';
import type { BudgetSettings } from './budget.js';
import { facts } from './facts.js';
import type { Meter } from './meter.js';
import { renderMemoriesBlock } from './prompt.js';
import { runTurn, type BudgetExceededReason, type ModelClient } from './runner.js';
import { SIM_TOOLS } from './sim-tools.js';
import { ToolRegistry, type ToolDefinition } from './tools.js';

const CHAT_TOOL_REGISTRY = new ToolRegistry();
for (const tool of SIM_TOOLS) {
  CHAT_TOOL_REGISTRY.register(tool);
}

/**
 * A villager's chat tools: everyone's villager tools, plus their own
 * role's (the Mayor's governance tools, say), limited to the ones
 * declared for the `chat` purpose.
 */
export function chatToolsFor(role: string): readonly ToolDefinition[] {
  const tools = new Map<string, ToolDefinition>();
  for (const tool of [
    ...CHAT_TOOL_REGISTRY.forRole('villager'),
    ...CHAT_TOOL_REGISTRY.forRole(role),
  ]) {
    if (tool.purposes.includes('chat')) {
      tools.set(tool.id, tool);
    }
  }
  return [...tools.values()];
}

/** One line of a chat, as the owner and the villager see it. */
export interface ChatLine {
  from: 'owner' | 'villager';
  text: string;
  /** Wall-clock milliseconds. */
  at: number;
}

/**
 * What the villager says when the app, not the model, has to answer:
 * spec section 11's fallback is "a polite 'I'll try again later' from the
 * villager". These are fixed lines, not model output.
 */
export const CHAT_FALLBACKS = {
  approval: "I've put that in your inbox - it needs your say before I can do it.",
  ranOutOfSteps: 'Sorry, I lost my thread there. Could you ask me again?',
  budget: "I'll have to talk later - I've used up today's budget for talking.",
} as const;

export interface VillagerChatResult {
  /** What the villager says - their own words, or one of `CHAT_FALLBACKS`. */
  reply: string;
  state: VillageState;
  inbox: ApprovalsInbox;
  meter: Meter;
  /** Set when the turn stopped to ask the owner's approval. */
  approvalRequested?: boolean;
  budgetExceeded?: BudgetExceededReason;
}

/**
 * Spec section 11's "the people here" slot, for a 1:1 chat with the
 * owner. Without it the model guesses who is talking - in a live test it
 * took the owner for the Mayor and remembered the owner's likes as the
 * Mayor's.
 */
export const OWNER_HERE =
  "You're talking with the owner: the person who looks after the village. They aren't one of the villagers, so don't call them by a villager's name. When you remember something about them, say it's about the owner.";

/** The conversation so far, as model messages - the prompt keeps only the last 10. */
function toHistory(lines: readonly ChatLine[]): ChatMessage[] {
  return lines.map((line) => ({
    role: line.from === 'owner' ? 'user' : 'assistant',
    content: line.text,
  }));
}

/**
 * One owner message to one villager and their reply. Throws if there's no
 * such villager, or if the provider call fails - the caller keeps the
 * village as it was either way.
 */
export async function runVillagerChat(
  client: ModelClient,
  state: VillageState,
  inbox: ApprovalsInbox,
  villagerId: string,
  message: string,
  history: readonly ChatLine[],
  meter: Meter = [],
  budgetSettings?: BudgetSettings,
): Promise<VillagerChatResult> {
  const villager = state.villagers.find((candidate) => candidate.villagerId === villagerId);
  if (!villager) {
    throw new Error(`No villager "${villagerId}"`);
  }
  const role = villager.role;
  const nowMinute = state.clock.minute;
  const memoriesText = renderMemoriesBlock(
    topMemoriesFor(state.memory, villagerId, nowMinute),
    state.promises.promises.filter(
      (promise) => promise.villagerId === villagerId && promise.status === 'open',
    ),
    nowMinute,
  );

  const result = await runTurn(
    client,
    facts(state, 'owner', 'chat'),
    { id: villager.villagerId, tradeId: villager.tradeId, role },
    message,
    {
      state,
      tools: chatToolsFor(role),
      turn: { tainted: false },
      sessionApprovedToolIds: new Set(),
      inbox,
    },
    meter,
    { memoriesText, peopleHereText: OWNER_HERE, history: toHistory(history) },
    budgetSettings,
    'chat',
  );

  const approvalRequested = result.inbox.requests.length > inbox.requests.length;
  let reply = result.reply;
  if (result.budgetExceeded) {
    reply = CHAT_FALLBACKS.budget;
  } else if (approvalRequested && reply === '') {
    reply = CHAT_FALLBACKS.approval;
  } else if (reply === '') {
    reply = CHAT_FALLBACKS.ranOutOfSteps;
  }

  return {
    reply,
    state: result.state,
    inbox: result.inbox,
    meter: result.meter,
    ...(approvalRequested ? { approvalRequested } : {}),
    ...(result.budgetExceeded ? { budgetExceeded: result.budgetExceeded } : {}),
  };
}
