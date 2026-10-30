import { z } from 'zod';

export const traitSchema = z.object({
  id: z.string(),
  howTheyTalk: z.string(),
  effect: z.string(),
  isFlaw: z.boolean(),
  /** Off by default even when the "Flaws" setting allows one flaw per villager. */
  offByDefault: z.boolean(),
});
export type Trait = z.infer<typeof traitSchema>;

/** Full traits table (spec section 7), including off-by-default flaws. */
export const TRAITS = [
  {
    id: 'hardworking',
    howTheyTalk: 'Practical',
    effect: 'Stints +15%; rests less',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'lazy',
    howTheyTalk: 'Unhurried',
    effect: 'Skips 1 stint in 5; naps',
    isFlaw: true,
    offByDefault: false,
  },
  {
    id: 'cheerful',
    howTheyTalk: 'Warm, upbeat',
    effect: 'Friendships grow 25% faster',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'grumpy',
    howTheyTalk: 'Short and dry',
    effect: 'Friendships grow 25% slower',
    isFlaw: true,
    offByDefault: false,
  },
  {
    id: 'chatty',
    howTheyTalk: 'Talks more, asks questions',
    effect: 'Twice as many visits',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'shy',
    howTheyTalk: 'Brief',
    effect: 'Half as many visits; close friendships run deeper',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'generous',
    howTheyTalk: 'Kind',
    effect: 'Gives a gift each week',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'thrifty',
    howTheyTalk: 'Careful with numbers',
    effect: 'Saves coins; buys less',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'curious',
    howTheyTalk: 'Asks why',
    effect: 'Visits the library; learns 20% faster',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'tidy',
    howTheyTalk: 'Precise',
    effect: 'Tools wear 30% slower',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'clumsy',
    howTheyTalk: 'Apologetic',
    effect: 'Tools wear 30% faster; small accidents',
    isFlaw: true,
    offByDefault: false,
  },
  {
    id: 'romantic',
    howTheyTalk: 'Fond',
    effect: 'Courtship more likely',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'funny',
    howTheyTalk: 'Light jokes, never riddles',
    effect: "Lifts others' mood at the inn",
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'green-thumbed',
    howTheyTalk: 'Talks about plants',
    effect: 'Fields and gardens +15%',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'night-owl',
    howTheyTalk: 'Livelier at night',
    effect: 'Day starts 2 hours later',
    isFlaw: false,
    offByDefault: false,
  },
  {
    id: 'gossip',
    howTheyTalk: 'Passes on news',
    effect: 'Rumours spread faster; notices thefts',
    isFlaw: true,
    offByDefault: false,
  },
  {
    id: 'stubborn',
    howTheyTalk: 'Firm',
    effect: 'Votes against changes more often',
    isFlaw: true,
    offByDefault: false,
  },
  {
    id: 'forgetful',
    howTheyTalk: 'Scattered',
    effect: 'Misses 1 appointment in 6',
    isFlaw: true,
    offByDefault: false,
  },
  {
    id: 'thieving',
    howTheyTalk: 'Normal',
    effect: 'Now and then pockets a loaf or a coin from the stores',
    isFlaw: true,
    offByDefault: true,
  },
  {
    id: 'shifty',
    howTheyTalk: 'Normal',
    effect: 'Fibs about their own day in village chat',
    isFlaw: true,
    offByDefault: true,
  },
] as const satisfies readonly Trait[];

export const traitsTableSchema = z.array(traitSchema);
traitsTableSchema.parse(TRAITS);

export type TraitId = (typeof TRAITS)[number]['id'];

const TRAITS_BY_ID = new Map<string, Trait>(TRAITS.map((trait) => [trait.id, trait]));

export function getTrait(id: string): Trait | undefined {
  return TRAITS_BY_ID.get(id);
}
