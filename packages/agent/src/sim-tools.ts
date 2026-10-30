/**
 * The tool registry's first two real, runnable tools (spec section 12's
 * roles table: Villager gets "gift", Mayor gets "propose building"), now
 * that `apply(command)` exists for both (#68). Both are game actions -
 * risk none, never needing approval - so they run straight against the
 * sim through `apply()`.
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

export const SIM_TOOLS = [GIFT_TOOL, PROPOSE_BUILDING_TOOL] as const;
