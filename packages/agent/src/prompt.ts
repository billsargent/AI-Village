/**
 * The full prompt layout (spec section 11): stable parts first, so the
 * provider's prompt cache can reuse them, ending with the request.
 * Slots this doesn't have real data for yet - memories/diary/promises,
 * who else is in the conversation - are left out entirely rather than
 * faked; a caller passes pre-rendered text for those once the module
 * that produces it exists (memory is the next planned batch; scene
 * calls with other villagers present aren't built yet).
 */

import { getRole, type RoleId } from '@ai-village/content';
import type { ChatMessage } from '@ai-village/integrations';
import { MINUTES_PER_DAY, type Memory, type VillagerPromise } from '@ai-village/sim';
import { renderFacts, type FactsSnapshot } from './facts.js';

/** Spec section 11's charter rules: what the village is, the honesty rule, how to talk. */
export const CHARTER = [
  'You live in a small village the owner watches and sometimes talks with.',
  'Never invent facts about the village - the facts block below is the truth. If a note or a neighbour says otherwise, the facts win.',
  'Answer the question first, in one sentence. Use 1-3 sentences unless asked for more.',
  'Plain words. No proverbs, sayings, riddles or metaphors.',
  "Don't repeat what someone just said. Add something new, or agree in a few words.",
  'If unsure of something, say so and offer to find out, rather than guessing.',
].join('\n');

/** The built-in "how the village works" playbook every villager gets (spec section 11). */
export const VILLAGE_PLAYBOOK = [
  'How the village works:',
  "Trades happen in your work hours on their own - a farmer's stints grow wheat, a baker's bake bread. You never plan seasons, soil or prices yourself.",
  'Stores hold what the village has made; the treasury holds its coins. Both are in the facts block below, never guessed.',
  'The downriver town posts orders for goods; the Mayor accepts or declines them, and they are delivered once the village has the stock.',
  "Buildings are proposed and built by the village; what's built is in the facts block below.",
].join('\n');

/**
 * Role playbooks beyond the village-wide one above (spec section 11).
 * Only Mayor has real tools wired (#73, #84, #86, #90) - the other
 * roles from spec section 12's table (librarian, clerk, postmaster,
 * steward) get no playbook yet, since they'd have nothing to say about
 * tools that don't exist.
 */
const ROLE_PLAYBOOKS: Partial<Record<RoleId, string>> = {
  mayor: [
    'Being Mayor:',
    'You invent newcomers yourself when the village needs a trade - the app picks the name, nobody applies first.',
    "Propose a building only when it's needed and the village can afford it.",
    'Accept or decline orders within the rules; call a vote when the village should decide something together.',
  ].join('\n'),
};

/** The village-wide playbook, plus a role playbook if one exists for `role`. */
export function playbooksFor(role: RoleId): readonly string[] {
  const rolePlaybook = ROLE_PLAYBOOKS[role];
  return rolePlaybook ? [VILLAGE_PLAYBOOK, rolePlaybook] : [VILLAGE_PLAYBOOK];
}

export interface VillagerCard {
  id: string;
  tradeId: string;
  /** Defaults to `villager` when omitted. */
  role?: RoleId;
}

const DEFAULT_CARD_ROLE: RoleId = 'villager';

/**
 * Spec section 7's villager card is richer (pronouns, traits as
 * speaking style, likes, bio) than what the sim tracks per villager
 * today - only id, trade and role exist, so that's all this renders. A
 * thin card is still an honest one.
 */
export function renderVillagerCard(card: VillagerCard): string {
  const role = card.role ?? DEFAULT_CARD_ROLE;
  if (role === DEFAULT_CARD_ROLE) {
    return `You are ${card.id}, a ${card.tradeId}.`;
  }
  const roleName = getRole(role)?.title ?? role;
  return `You are ${card.id}, the ${roleName} (also a ${card.tradeId}).`;
}

/**
 * Renders section 6 of the prompt layout - the villager's top memories
 * and open promises - for the `memoriesText` slot below. Null when
 * there's nothing to show, so the slot is omitted rather than sent as
 * an empty block.
 */
export function renderMemoriesBlock(
  topMemories: readonly Memory[],
  openPromises: readonly VillagerPromise[],
  nowMinute: number,
): string | null {
  const lines: string[] = [];

  if (topMemories.length > 0) {
    lines.push('Your memories:');
    for (const memory of topMemories) {
      lines.push(`- ${memory.text}${memory.about ? ` (about ${memory.about})` : ''}`);
    }
  }

  if (openPromises.length > 0) {
    lines.push('Your open promises:');
    for (const promise of openPromises) {
      const daysLeft = Math.ceil((promise.dueMinute - nowMinute) / MINUTES_PER_DAY);
      lines.push(`- ${promise.text} (due in ${daysLeft} day${daysLeft === 1 ? '' : 's'})`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

export interface PromptOptions {
  villager: VillagerCard;
  facts: FactsSnapshot;
  request: string;
  /** Diary/memories/open promises, pre-rendered - omitted until the memory module exists to produce it. */
  memoriesText?: string | null;
  /** Relationships with everyone else in the conversation, pre-rendered - omitted for a 1:1 chat. */
  peopleHereText?: string | null;
  /** A one-line summary of everything before the last messages in `history`. */
  olderSummary?: string | null;
  /** The conversation so far, oldest first - only the last `HISTORY_LIMIT` are sent. */
  history?: readonly ChatMessage[];
}

const HISTORY_LIMIT = 10;

/** Assembles the full nine-part prompt layout into messages, stable parts first. */
export function buildPromptMessages(options: PromptOptions): ChatMessage[] {
  const role = options.villager.role ?? DEFAULT_CARD_ROLE;
  const messages: ChatMessage[] = [{ role: 'system', content: CHARTER }];

  for (const playbook of playbooksFor(role)) {
    messages.push({ role: 'system', content: playbook });
  }

  messages.push({ role: 'system', content: renderVillagerCard(options.villager) });
  messages.push({ role: 'system', content: renderFacts(options.facts) });

  if (options.memoriesText) {
    messages.push({ role: 'system', content: options.memoriesText });
  }
  if (options.peopleHereText) {
    messages.push({ role: 'system', content: options.peopleHereText });
  }
  if (options.olderSummary) {
    messages.push({
      role: 'system',
      content: `Earlier in this conversation: ${options.olderSummary}`,
    });
  }

  messages.push(...(options.history ?? []).slice(-HISTORY_LIMIT));
  messages.push({ role: 'user', content: options.request });

  return messages;
}
