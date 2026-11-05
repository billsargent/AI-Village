/**
 * Villagers' traits (spec section 7): "2-3; at most one flaw by default".
 * The off-by-default flaws (thieving, shifty) are never picked - the
 * "Flaws" setting that could allow them doesn't exist yet, so the
 * default rule is the only rule.
 *
 * Traits change how a villager talks (their prompt says so), and some
 * change what they do - see the effects at the end of this file.
 */

import { getTrait, TRAITS } from '@ai-village/content';
import { seededRandom } from './random.js';

const MIN_TRAITS = 2;
const MAX_TRAITS = 3;
const MAX_FLAWS = 1;

/** Traits a villager can be given under the default "Flaws" setting. */
const PICKABLE = TRAITS.filter((trait) => !trait.offByDefault);

/**
 * A villager's traits, picked deterministically from the village seed and
 * their id, so the same villager in the same village always gets the
 * same ones - however many times a save is loaded.
 */
export function pickTraits(villageSeed: number, villagerId: string): readonly string[] {
  const rng = seededRandom({ villageSeed, day: 0, system: 'traits', entity: villagerId });
  const count = rng() < 0.5 ? MIN_TRAITS : MAX_TRAITS;
  const pool = [...PICKABLE];
  const picked: string[] = [];
  let flaws = 0;
  while (picked.length < count && pool.length > 0) {
    const [trait] = pool.splice(Math.floor(rng() * pool.length), 1);
    if (!trait || (trait.isFlaw && flaws >= MAX_FLAWS)) {
      continue;
    }
    if (trait.isFlaw) {
      flaws++;
    }
    picked.push(trait.id);
  }
  return picked;
}

/** Why `traits` isn't a valid set under the default rules, or null if it is. */
export function invalidTraitsReason(traits: readonly string[]): string | null {
  if (traits.length < MIN_TRAITS || traits.length > MAX_TRAITS) {
    return `A villager has ${MIN_TRAITS} or ${MAX_TRAITS} traits, not ${traits.length}`;
  }
  if (new Set(traits).size !== traits.length) {
    return 'The same trait is listed twice';
  }
  let flaws = 0;
  for (const id of traits) {
    const trait = getTrait(id);
    if (!trait) {
      return `Unknown trait "${id}"`;
    }
    if (trait.offByDefault) {
      return `"${id}" is off unless the owner allows it`;
    }
    if (trait.isFlaw) {
      flaws++;
    }
  }
  if (flaws > MAX_FLAWS) {
    return `At most ${MAX_FLAWS} flaw per villager`;
  }
  return null;
}

/*
 * What traits do in the village (spec section 7's "Effect in the village"
 * column). Only the effects the sim can honestly model yet are here:
 * stint output, a lazy villager's skipped stints, and how fast
 * friendships grow. The rest (visits, tool wear, rumours, votes, ...)
 * wait for the systems they act on.
 */

/** Fields and gardens - where green thumbs help. */
const GREEN_WORKPLACES: ReadonlySet<string> = new Set(['fields', 'gardens', 'cottage-garden']);

/** "Hardworking: Stints +15%"; "Green-thumbed: Fields and gardens +15%". */
export function workMultiplierFor(traits: readonly string[], worksAt: string | undefined): number {
  let multiplier = 1;
  if (traits.includes('hardworking')) {
    multiplier *= 1.15;
  }
  if (traits.includes('green-thumbed') && worksAt !== undefined && GREEN_WORKPLACES.has(worksAt)) {
    multiplier *= 1.15;
  }
  return multiplier;
}

/** "Lazy: Skips 1 stint in 5" - a seeded roll per villager, day and stint. */
export function skipsStint(
  traits: readonly string[],
  villageSeed: number,
  villagerId: string,
  day: number,
  stintIndex: number,
): boolean {
  if (!traits.includes('lazy')) {
    return false;
  }
  const rng = seededRandom({
    villageSeed,
    day,
    system: 'lazy',
    entity: `${villagerId}:${stintIndex}`,
  });
  return rng() < 1 / 5;
}

/** "Cheerful: Friendships grow 25% faster"; "Grumpy: ... 25% slower". */
export function friendshipGrowthFor(traits: readonly string[]): number {
  let growth = 1;
  if (traits.includes('cheerful')) {
    growth *= 1.25;
  }
  if (traits.includes('grumpy')) {
    growth *= 0.75;
  }
  return growth;
}
