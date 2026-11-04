/**
 * The tool registry's real, runnable tools (spec section 12's roles
 * table: Villager gets "gift", "post on the board", `remember` and
 * `promise`; Mayor gets "propose building", "accept orders" and "call a
 * meeting or vote"), now that `apply(command)` exists for each (#68,
 * #84, #86, #90, #96). All are game actions - risk none, never needing
 * approval - so they run straight against the sim through `apply()`.
 *
 * `request_work` (spec section 11's chat-tool table) is the same shape:
 * it only queues a work request (`RequestWork` in `packages/sim`), it
 * never runs the queued work itself. Spec section 11 says the owner's
 * rules can require approval for it, but there's no settings/permission
 * system yet to drive that, so it stays `risk: 'none'`/`approval:
 * 'never'` like every other tool here until one exists - not faked.
 *
 * `propose_hire` is the first tool here that isn't risk none: spec
 * section 15's table says plainly "Hire ... The owner decides", so it's
 * `risk: 'medium'`/`approval: 'each-time'`, gated by `needsApproval`
 * like every other medium/high tool - the only thing new is that this
 * is the first `SIM_TOOLS` entry to actually use that gate. Its
 * `purposes: ['mayor-duties']` matches spec section 11's table, and
 * `runChat`/`runTurn` can run that purpose too (`purpose`, both default
 * `'chat'` for every call site that predates it) - still nothing in
 * this app actually calls `runTurn` for a Mayor's daily duties turn
 * yet (there's no scheduler for that), but the plumbing to is no
 * longer missing, unlike when this comment first called it out.
 */

import { apply } from '@ai-village/sim';
import { z } from 'zod';
import { defineTool } from './tools.js';

export const GIFT_TOOL = defineTool({
  id: 'gift',
  title: 'Give a gift',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['villager'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({
    from: z.string(),
    to: z.string(),
    item: z.string(),
    qty: z.number().positive(),
  }),
  preview: (args) => `Give ${args.to} ${args.qty} ${args.item}`,
  run: (args, ctx) => apply(ctx.state, { kind: 'GiveGift', ...args }),
});

export const PROPOSE_BUILDING_TOOL = defineTool({
  id: 'propose_building',
  title: 'Propose a building',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['mayor'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({ buildingId: z.string() }),
  preview: (args) => `Propose building the ${args.buildingId}`,
  run: (args, ctx) => apply(ctx.state, { kind: 'ProposeBuilding', ...args }),
});

export const ACCEPT_ORDER_TOOL = defineTool({
  id: 'accept_order',
  title: 'Accept an order',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['mayor'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({ orderId: z.number() }),
  preview: (args) => `Accept order #${args.orderId}`,
  run: (args, ctx) => apply(ctx.state, { kind: 'AcceptOrder', ...args }),
});

export const DECLINE_ORDER_TOOL = defineTool({
  id: 'decline_order',
  title: 'Decline an order',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['mayor'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({ orderId: z.number() }),
  preview: (args) => `Decline order #${args.orderId}`,
  run: (args, ctx) => apply(ctx.state, { kind: 'DeclineOrder', ...args }),
});

export const POST_ON_BOARD_TOOL = defineTool({
  id: 'post_on_board',
  title: 'Post on the board',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['villager'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({ author: z.string(), text: z.string() }),
  preview: (args) => `Post on the board: "${args.text}"`,
  run: (args, ctx) => apply(ctx.state, { kind: 'PostOnBoard', ...args }),
});

export const CALL_VOTE_TOOL = defineTool({
  id: 'call_vote',
  title: 'Call a vote',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['mayor'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({ topic: z.string(), options: z.array(z.string()).min(2) }),
  preview: (args) => `Call a vote on "${args.topic}" (${args.options.join(' / ')})`,
  run: (args, ctx) => apply(ctx.state, { kind: 'CallVote', ...args }),
});

export const REMEMBER_TOOL = defineTool({
  id: 'remember',
  title: 'Remember something',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['villager'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({
    villagerId: z.string(),
    text: z.string(),
    importance: z.number().min(1).max(10),
    about: z.string().optional(),
  }),
  preview: (args) => `Remember: "${args.text}"`,
  run: (args, ctx) =>
    apply(ctx.state, {
      kind: 'Remember',
      villagerId: args.villagerId,
      text: args.text,
      importance: args.importance,
      ...(args.about !== undefined ? { about: args.about } : {}),
    }),
});

export const PROMISE_TOOL = defineTool({
  id: 'promise',
  title: 'Make a promise',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['villager'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({ villagerId: z.string(), text: z.string(), dueInDays: z.number().positive() }),
  preview: (args) => `Promise: "${args.text}" (due in ${args.dueInDays} days)`,
  run: (args, ctx) => apply(ctx.state, { kind: 'MakePromise', ...args }),
});

export const REQUEST_WORK_TOOL = defineTool({
  id: 'request_work',
  title: 'Request work',
  kind: 'game',
  risk: 'none',
  approval: 'never',
  roles: ['villager'],
  purposes: ['chat'],
  costUsd: 0,
  args: z.object({ villagerId: z.string(), description: z.string() }),
  preview: (args) => `Queue work: "${args.description}"`,
  run: (args, ctx) => apply(ctx.state, { kind: 'RequestWork', ...args }),
});

export const PROPOSE_HIRE_TOOL = defineTool({
  id: 'propose_hire',
  title: 'Propose a hire',
  kind: 'game',
  risk: 'medium',
  approval: 'each-time',
  roles: ['mayor'],
  purposes: ['mayor-duties'],
  costUsd: 0,
  args: z.object({ tradeId: z.string(), reason: z.string() }),
  preview: (args) => `Hire a ${args.tradeId}: ${args.reason}`,
  run: (args, ctx) => apply(ctx.state, { kind: 'HireVillager', ...args }),
});

export const SIM_TOOLS = [
  GIFT_TOOL,
  PROPOSE_BUILDING_TOOL,
  ACCEPT_ORDER_TOOL,
  DECLINE_ORDER_TOOL,
  POST_ON_BOARD_TOOL,
  CALL_VOTE_TOOL,
  REMEMBER_TOOL,
  PROMISE_TOOL,
  REQUEST_WORK_TOOL,
  PROPOSE_HIRE_TOOL,
] as const;
