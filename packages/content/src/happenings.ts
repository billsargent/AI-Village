import { z } from 'zod';

export const simpleHappeningConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('always') }),
  z.object({ kind: z.literal('season'), seasons: z.array(z.string()) }),
  z.object({ kind: z.literal('marketDay') }),
  z.object({ kind: z.literal('buildingExists'), building: z.string() }),
  z.object({ kind: z.literal('weatherIn'), weather: z.array(z.string()) }),
  /** The card is real (spec section 5) but its condition needs sim state (relationships, streaks, housing) not built yet. Never eligible until a later milestone replaces this. */
  z.object({ kind: z.literal('notYetModeled') }),
]);
export type SimpleHappeningCondition = z.infer<typeof simpleHappeningConditionSchema>;

export const happeningConditionSchema = z.union([
  simpleHappeningConditionSchema,
  z.object({ kind: z.literal('all'), of: z.array(simpleHappeningConditionSchema) }),
]);
export type HappeningCondition = z.infer<typeof happeningConditionSchema>;

export const happeningCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  condition: happeningConditionSchema,
  /** Relative weight among eligible cards on a day the storyteller decides something happens. */
  weight: z.number().positive(),
  effect: z.string(),
  chronicleLine: z.string(),
  /** Excluded by the Gentle storyteller style (spec section 5: "Gentle (no damage, no illness)"). */
  isDamageOrIllness: z.boolean(),
  decisionFor: z.enum(['mayor', 'owner']).nullable(),
});
export type HappeningCard = z.infer<typeof happeningCardSchema>;

/** The 11 happening cards from spec section 5. */
export const HAPPENINGS = [
  {
    id: 'merchant-caravan',
    title: 'Merchant caravan',
    condition: {
      kind: 'all',
      of: [{ kind: 'marketDay' }, { kind: 'season', seasons: ['summer', 'autumn'] }],
    },
    weight: 3,
    effect: 'Sells iron and luxuries; buys surplus',
    chronicleLine: 'A merchant caravan rolled into the market, selling iron and luxuries.',
    isDamageOrIllness: false,
    decisionFor: null,
  },
  {
    id: 'traveller-asks-for-work',
    title: 'A traveller asks for work',
    condition: { kind: 'notYetModeled' },
    weight: 2,
    effect: 'A hire proposal for the Mayor',
    chronicleLine: 'A traveller at the gate asked the Mayor for work.',
    isDamageOrIllness: false,
    decisionFor: 'mayor',
  },
  {
    id: 'stray-cat',
    title: 'Stray cat',
    condition: { kind: 'always' },
    weight: 1,
    effect: 'Stays if someone feeds it three days running',
    chronicleLine: 'A stray cat was seen napping on the green.',
    isDamageOrIllness: false,
    decisionFor: null,
  },
  {
    id: 'chimney-fire',
    title: 'Chimney fire',
    condition: {
      kind: 'all',
      of: [
        { kind: 'buildingExists', building: 'bakery' },
        { kind: 'weatherIn', weather: ['clear', 'heat'] },
      ],
    },
    weight: 1,
    effect: 'Bakery closed 1 day; a repair job',
    chronicleLine: 'A chimney fire closed the bakery for the day.',
    isDamageOrIllness: true,
    decisionFor: null,
  },
  {
    id: 'bumper-harvest',
    title: 'Bumper harvest',
    condition: { kind: 'notYetModeled' },
    weight: 2,
    effect: 'Wheat +50%; a surplus to sell',
    chronicleLine: 'A bumper harvest filled the farmhouse to the rafters.',
    isDamageOrIllness: false,
    decisionFor: null,
  },
  {
    id: 'lost-letter',
    title: 'Lost letter',
    condition: { kind: 'buildingExists', building: 'post-office' },
    weight: 2,
    effect: 'A letter turns up for a villager: a small mystery to solve',
    chronicleLine: 'A long-lost letter turned up at the post office.',
    isDamageOrIllness: false,
    decisionFor: null,
  },
  {
    id: 'quarrel',
    title: 'Quarrel',
    condition: { kind: 'notYetModeled' },
    weight: 2,
    effect: 'Both moods dip; a chance to make up',
    chronicleLine: 'Two villagers had a falling-out on the green.',
    isDamageOrIllness: false,
    decisionFor: null,
  },
  {
    id: 'proposal',
    title: 'Proposal',
    condition: { kind: 'notYetModeled' },
    weight: 1,
    effect: 'A wedding at the chapel the next Restday',
    chronicleLine: 'A proposal on the green - a wedding is coming.',
    isDamageOrIllness: false,
    decisionFor: null,
  },
  {
    id: 'illness',
    title: 'Illness',
    condition: { kind: 'season', seasons: ['winter'] },
    weight: 2,
    effect: 'One villager rests 2 days; remedies speed it up',
    chronicleLine: 'A villager has taken to their bed with a winter chill.',
    isDamageOrIllness: true,
    decisionFor: null,
  },
  {
    id: 'visiting-bard',
    title: 'Visiting bard',
    condition: { kind: 'buildingExists', building: 'inn' },
    weight: 2,
    effect: "Music at the inn for one night; everyone's fun rises",
    chronicleLine: 'A travelling bard played at the inn tonight.',
    isDamageOrIllness: false,
    decisionFor: null,
  },
  {
    id: 'message-in-a-bottle',
    title: 'Message in a bottle',
    condition: { kind: 'buildingExists', building: 'riverside-jetty' },
    weight: 1,
    effect: 'Washes up with a clue to a secret spot',
    chronicleLine: 'A message in a bottle washed up at the jetty.',
    isDamageOrIllness: false,
    decisionFor: null,
  },
] as const satisfies readonly HappeningCard[];

export const happeningsTableSchema = z.array(happeningCardSchema);
happeningsTableSchema.parse(HAPPENINGS);

export type HappeningId = (typeof HAPPENINGS)[number]['id'];
