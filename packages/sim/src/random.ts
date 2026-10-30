/**
 * Deterministic randomness, keyed by (village seed, day, system, entity), so
 * adding a villager never changes anyone else's rolls (spec section 5).
 *
 * Uses mulberry32, a small, fast, well-distributed 32-bit PRNG. Any seeded
 * PRNG would do; this one needs no dependency and is easy to audit.
 */

function hashStringToUint32(input: string): number {
  // FNV-1a, truncated to 32 bits.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomStreamKey {
  villageSeed: number;
  day: number;
  system: string;
  entity: string;
}

/** Returns a `() => number` in [0, 1) that is pure in its key: same key, same sequence. */
export function seededRandom(key: RandomStreamKey): () => number {
  const digest = hashStringToUint32(`${key.villageSeed}:${key.day}:${key.system}:${key.entity}`);
  return mulberry32(digest);
}

/** Draws a random index into `weights`, proportional to each weight. */
export function weightedPick<T>(
  items: readonly T[],
  weights: readonly number[],
  rng: () => number,
): T {
  if (items.length === 0) {
    throw new Error('weightedPick: items must not be empty');
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) {
      return items[i] as T;
    }
  }
  return items[items.length - 1] as T;
}
