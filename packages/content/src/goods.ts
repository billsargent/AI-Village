import { z } from 'zod';

export const goodCategorySchema = z.enum([
  'raw',
  'material',
  'food',
  'drink',
  'tool',
  'luxury',
  'medicine',
  'money',
]);
export type GoodCategory = z.infer<typeof goodCategorySchema>;

export const goodSchema = z.object({
  id: z.string(),
  category: goodCategorySchema,
  basePrice: z.number().nonnegative(),
  /** Days until a stack spoils, or null if it never spoils. */
  spoilsAfterDays: z.number().positive().nullable(),
  /** Uses before a tool wears out; only set for the tool category. */
  wearsAfterUses: z.number().positive().optional(),
  madeBy: z.array(z.string()),
});
export type Good = z.infer<typeof goodSchema>;

/** Version 1 goods table (spec section 6). */
export const GOODS = [
  { id: 'wheat', category: 'raw', basePrice: 1, spoilsAfterDays: null, madeBy: ['farmer'] },
  { id: 'flour', category: 'material', basePrice: 2, spoilsAfterDays: 30, madeBy: ['miller'] },
  { id: 'bread', category: 'food', basePrice: 3, spoilsAfterDays: 3, madeBy: ['baker'] },
  {
    id: 'vegetables',
    category: 'food',
    basePrice: 2,
    spoilsAfterDays: 5,
    madeBy: ['farmer', 'gardener'],
  },
  { id: 'fish', category: 'food', basePrice: 3, spoilsAfterDays: 2, madeBy: ['fisher'] },
  {
    id: 'smoked-fish',
    category: 'food',
    basePrice: 5,
    spoilsAfterDays: 20,
    madeBy: ['fisher'],
  },
  { id: 'apples', category: 'food', basePrice: 2, spoilsAfterDays: 10, madeBy: ['orchard-keeper'] },
  { id: 'honey', category: 'food', basePrice: 6, spoilsAfterDays: null, madeBy: ['beekeeper'] },
  { id: 'ale', category: 'drink', basePrice: 4, spoilsAfterDays: 20, madeBy: ['innkeeper'] },
  { id: 'cider', category: 'drink', basePrice: 4, spoilsAfterDays: 20, madeBy: ['innkeeper'] },
  { id: 'logs', category: 'raw', basePrice: 1, spoilsAfterDays: null, madeBy: ['woodcutter'] },
  {
    id: 'planks',
    category: 'material',
    basePrice: 3,
    spoilsAfterDays: null,
    madeBy: ['carpenter'],
  },
  { id: 'stone', category: 'raw', basePrice: 2, spoilsAfterDays: null, madeBy: ['quarry-worker'] },
  { id: 'iron', category: 'material', basePrice: 8, spoilsAfterDays: null, madeBy: ['merchant'] },
  {
    id: 'tools',
    category: 'tool',
    basePrice: 15,
    spoilsAfterDays: null,
    wearsAfterUses: 20,
    madeBy: ['smith'],
  },
  { id: 'flowers', category: 'luxury', basePrice: 2, spoilsAfterDays: 2, madeBy: ['gardener'] },
  { id: 'crafts', category: 'luxury', basePrice: 6, spoilsAfterDays: null, madeBy: ['carpenter'] },
  { id: 'herbs', category: 'medicine', basePrice: 2, spoilsAfterDays: 10, madeBy: ['herbalist'] },
  { id: 'remedy', category: 'medicine', basePrice: 8, spoilsAfterDays: 10, madeBy: ['herbalist'] },
  { id: 'coins', category: 'money', basePrice: 0, spoilsAfterDays: null, madeBy: ['treasury'] },
] as const satisfies readonly Good[];

export const goodsTableSchema = z.array(goodSchema);
goodsTableSchema.parse(GOODS);

export type GoodId = (typeof GOODS)[number]['id'];

const GOODS_BY_ID = new Map<string, Good>(GOODS.map((good) => [good.id, good]));

export function getGood(id: string): Good | undefined {
  return GOODS_BY_ID.get(id);
}
