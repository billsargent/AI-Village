/**
 * Villagers' traits (spec section 7): "2-3; at most one flaw by default".
 * The off-by-default flaws (thieving, shifty) are never picked - the
 * "Flaws" setting that could allow them doesn't exist yet, so the
 * default rule is the only rule.
 *
 * Traits change how a villager talks (their prompt says so). Their
 * effects in the village - "Stints +15%", "Friendships grow 25% faster"
 * - aren't modelled yet.
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
