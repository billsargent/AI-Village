import { z } from 'zod';
import { GOODS } from './goods.js';

const GOOD_IDS = new Set<string>(GOODS.map((good) => good.id));

export const goodQuantitySchema = z.object({
  good: z.string(),
  qty: z.number().positive(),
});
export type GoodQuantity = z.infer<typeof goodQuantitySchema>;

export const tradeOutputSchema = z.object({
  good: z.string(),
  qty: z.number().positive(),
  /** Chance (0-1) of one extra unit, for outputs like the fisher's "plus 1 at 25%". */
  bonusChance: z.number().min(0).max(1).optional(),
});
export type TradeOutput = z.infer<typeof tradeOutputSchema>;

export const tradeSchema = z.object({
  id: z.string(),
  worksAt: z.string(),
  inputs: z.array(goodQuantitySchema),
  outputs: z.array(tradeOutputSchema),
  /** Free-text notes on seasonal/weather modifiers; applied by the work system, not parsed here. */
  modifiers: z.string(),
});
export type Trade = z.infer<typeof tradeSchema>;

/** Version 1 trades table (spec section 6). One stint is half a working day. */
export const TRADES = [
  {
    id: 'farmer',
    worksAt: 'fields',
    inputs: [],
    outputs: [
      { good: 'wheat', qty: 6 },
      { good: 'vegetables', qty: 2 },
    ],
    modifiers: 'Spring 1.0, summer 1.2, autumn 1.5, winter 0.2; rain +10%',
  },
  {
    id: 'miller',
    worksAt: 'mill',
    inputs: [{ good: 'wheat', qty: 6 }],
    outputs: [{ good: 'flour', qty: 4 }],
    modifiers: 'Wind x1.25',
  },
  {
    id: 'baker',
    worksAt: 'bakery',
    inputs: [{ good: 'flour', qty: 2 }],
    outputs: [{ good: 'bread', qty: 8 }],
    modifiers: '',
  },
  {
    id: 'fisher',
    worksAt: 'riverside-jetty',
    inputs: [],
    outputs: [{ good: 'fish', qty: 4, bonusChance: 0.25 }],
    modifiers: 'Winter 0.5; none in storms',
  },
  {
    id: 'innkeeper',
    worksAt: 'inn',
    inputs: [{ good: 'wheat', qty: 2 }],
    outputs: [{ good: 'ale', qty: 4 }],
    modifiers: 'Heat raises sales, not output; apples 4 -> cider 4 is an alternate recipe',
  },
  {
    id: 'woodcutter',
    worksAt: 'forest-hut',
    inputs: [],
    outputs: [{ good: 'logs', qty: 6 }],
    modifiers: 'Snow 0.5',
  },
  {
    id: 'carpenter',
    worksAt: 'workshop',
    inputs: [{ good: 'logs', qty: 4 }],
    outputs: [{ good: 'planks', qty: 4 }],
    modifiers: 'A carpenter may instead spend a stint on building progress',
  },
  {
    id: 'smith',
    worksAt: 'smithy',
    inputs: [{ good: 'iron', qty: 1 }],
    outputs: [{ good: 'tools', qty: 1 }],
    modifiers: '',
  },
  {
    id: 'gardener',
    worksAt: 'gardens',
    inputs: [],
    outputs: [
      { good: 'flowers', qty: 6 },
      { good: 'vegetables', qty: 2 },
    ],
    modifiers: 'Winter 0',
  },
  {
    id: 'herbalist',
    worksAt: 'cottage-garden',
    inputs: [],
    outputs: [{ good: 'herbs', qty: 4 }],
    modifiers: 'Winter 0.3; herbs 2 -> remedy 1 is an alternate recipe',
  },
  {
    id: 'teacher',
    worksAt: 'school',
    inputs: [],
    outputs: [],
    modifiers: 'Apprentices and children learn; no goods produced',
  },
  {
    id: 'postmaster',
    worksAt: 'post-office',
    inputs: [],
    outputs: [],
    modifiers: 'Letters delivered, mail checked; no goods produced',
  },
  {
    id: 'mayor',
    worksAt: 'town-hall',
    inputs: [],
    outputs: [],
    modifiers: 'Governance; no goods produced',
  },
] as const satisfies readonly Trade[];

export const tradesTableSchema = z.array(tradeSchema);
tradesTableSchema.parse(TRADES);

for (const trade of TRADES) {
  for (const quantity of [...trade.inputs, ...trade.outputs]) {
    if (!GOOD_IDS.has(quantity.good)) {
      throw new Error(`Trade "${trade.id}" references unknown good "${quantity.good}"`);
    }
  }
}

export type TradeId = (typeof TRADES)[number]['id'];

const TRADES_BY_ID = new Map<string, Trade>(TRADES.map((trade) => [trade.id, trade]));

export function getTrade(id: string): Trade | undefined {
  return TRADES_BY_ID.get(id);
}
