/**
 * The tool registry's real, runnable tools (spec section 12's roles
 * table: Villager gets "gift" and "post on the board"; Mayor gets
 * "propose building" and "accept orders"), now that `apply(command)`
 * exists for each (#68, #84, #86). All are game actions - risk none,
 * never needing approval - so they run straight against the sim
 * through `apply()`.
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

export const SIM_TOOLS = [
  GIFT_TOOL,
  PROPOSE_BUILDING_TOOL,
  ACCEPT_ORDER_TOOL,
  DECLINE_ORDER_TOOL,
  POST_ON_BOARD_TOOL,
] as const;
