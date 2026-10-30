import { seededRandom, weightedPick } from './random.js';

/** Stranger through partner/rival (spec section 7). */
export const RELATIONSHIP_LABELS = [
  'stranger',
  'acquaintance',
  'friend',
  'close-friend',
  'sweetheart',
  'partner',
  'rival',
] as const;
export type RelationshipLabel = (typeof RELATIONSHIP_LABELS)[number];

export interface Relationship {
  /** -100 to 100. */
  affinity: number;
  /** 0 to 100. */
  familiarity: number;
  /** The village day the pair first became sweethearts, or null. */
  sweetheartSinceDay: number | null;
}

export type Relationships = Readonly<Record<string, Relationship>>;

const MIN_AFFINITY = -100;
const MAX_AFFINITY = 100;
const MIN_FAMILIARITY = 0;
const MAX_FAMILIARITY = 100;
const RIVAL_AFFINITY_THRESHOLD = -40;
const SWEETHEART_AFFINITY_THRESHOLD = 60;
const SWEETHEART_FAMILIARITY_THRESHOLD = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The two villager ids as a stable, order-independent key. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

const EMPTY_RELATIONSHIP: Relationship = { affinity: 0, familiarity: 0, sweetheartSinceDay: null };

export function getRelationship(relationships: Relationships, a: string, b: string): Relationship {
  return relationships[pairKey(a, b)] ?? EMPTY_RELATIONSHIP;
}

export function labelFor(relationship: Relationship): RelationshipLabel {
  if (relationship.affinity <= RIVAL_AFFINITY_THRESHOLD) {
    return 'rival';
  }
  if (relationship.sweetheartSinceDay !== null) {
    return 'sweetheart';
  }
  if (relationship.familiarity >= 80 && relationship.affinity >= 60) {
    return 'close-friend';
  }
  if (relationship.familiarity >= 40 && relationship.affinity >= 20) {
    return 'friend';
  }
  if (relationship.familiarity > 0) {
    return 'acquaintance';
  }
  return 'stranger';
}

export const INTERACTION_KINDS = ['chat', 'sharedWork', 'gift', 'quarrel', 'makeUp'] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

/** Affinity change range for each interaction kind (spec section 7). */
const AFFINITY_DELTA: Record<InteractionKind, readonly [number, number]> = {
  chat: [1, 3],
  sharedWork: [1, 1],
  gift: [5, 15],
  quarrel: [-10, -10],
  makeUp: [8, 8],
};
const FAMILIARITY_GAIN = 2;

function rollInteractionKind(relationship: Relationship, rng: () => number): InteractionKind {
  // A quarrel-worn pair is more likely to make up than to quarrel again;
  // otherwise it's mostly a chat, with gifts and quarrels as the exception.
  if (relationship.affinity <= RIVAL_AFFINITY_THRESHOLD) {
    return weightedPick(['makeUp', 'chat'], [60, 40], rng);
  }
  return weightedPick(['chat', 'sharedWork', 'gift', 'quarrel'], [60, 20, 10, 10], rng);
}

/**
 * Applies one interaction to a pair's relationship, picked by a seeded
 * roll (spec section 7: chats +1-3, shared work +1, gifts +5-15, quarrels
 * -10, making up +8 - familiarity rises with any interaction).
 */
export function applyEveningInteraction(
  relationships: Relationships,
  a: string,
  b: string,
  day: number,
  villageSeed: number,
): Relationships {
  const key = pairKey(a, b);
  const current = relationships[key] ?? EMPTY_RELATIONSHIP;
  const rng = seededRandom({ villageSeed, day, system: 'relationships', entity: key });

  const kind = rollInteractionKind(current, rng);
  const [min, max] = AFFINITY_DELTA[kind];
  const affinityDelta = min === max ? min : min + rng() * (max - min);

  const affinity = clamp(current.affinity + affinityDelta, MIN_AFFINITY, MAX_AFFINITY);
  const familiarity = clamp(
    current.familiarity + FAMILIARITY_GAIN,
    MIN_FAMILIARITY,
    MAX_FAMILIARITY,
  );
  const becomingSweethearts =
    current.sweetheartSinceDay === null &&
    affinity >= SWEETHEART_AFFINITY_THRESHOLD &&
    familiarity >= SWEETHEART_FAMILIARITY_THRESHOLD;

  return {
    ...relationships,
    [key]: {
      affinity,
      familiarity,
      sweetheartSinceDay: becomingSweethearts ? day : current.sweetheartSinceDay,
    },
  };
}

/** Rolls one evening interaction for every unordered pair of villagers. */
export function runEveningInteractions(
  relationships: Relationships,
  villagerIds: readonly string[],
  day: number,
  villageSeed: number,
): Relationships {
  let next = relationships;
  for (let i = 0; i < villagerIds.length; i++) {
    for (let j = i + 1; j < villagerIds.length; j++) {
      next = applyEveningInteraction(
        next,
        villagerIds[i] as string,
        villagerIds[j] as string,
        day,
        villageSeed,
      );
    }
  }
  return next;
}

/** True if any pair among `villagerIds` has affinity at or below the rival threshold. */
export function anyPairBelowAffinity(
  relationships: Relationships,
  villagerIds: readonly string[],
  threshold: number,
): boolean {
  for (let i = 0; i < villagerIds.length; i++) {
    for (let j = i + 1; j < villagerIds.length; j++) {
      if (
        getRelationship(relationships, villagerIds[i] as string, villagerIds[j] as string)
          .affinity <= threshold
      ) {
        return true;
      }
    }
  }
  return false;
}

/** True if any pair has been sweethearts for at least `days` as of `today`. */
export function anySweetheartFor(
  relationships: Relationships,
  villagerIds: readonly string[],
  today: number,
  days: number,
): boolean {
  for (let i = 0; i < villagerIds.length; i++) {
    for (let j = i + 1; j < villagerIds.length; j++) {
      const rel = getRelationship(
        relationships,
        villagerIds[i] as string,
        villagerIds[j] as string,
      );
      if (rel.sweetheartSinceDay !== null && today - rel.sweetheartSinceDay >= days) {
        return true;
      }
    }
  }
  return false;
}
