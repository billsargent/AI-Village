import { describe, expect, it } from 'vitest';
import {
  anyPairBelowAffinity,
  anySweetheartFor,
  applyEveningInteraction,
  applyGift,
  getRelationship,
  labelFor,
  pairKey,
  runEveningInteractions,
  type Relationships,
} from './relationships.js';

describe('pairKey', () => {
  it('is the same regardless of argument order', () => {
    expect(pairKey('ada', 'tobin')).toBe(pairKey('tobin', 'ada'));
  });
});

describe('labelFor', () => {
  it('starts at stranger and rises with familiarity and affinity', () => {
    expect(labelFor({ affinity: 0, familiarity: 0, sweetheartSinceDay: null })).toBe('stranger');
    expect(labelFor({ affinity: 10, familiarity: 10, sweetheartSinceDay: null })).toBe(
      'acquaintance',
    );
    expect(labelFor({ affinity: 30, familiarity: 50, sweetheartSinceDay: null })).toBe('friend');
    expect(labelFor({ affinity: 70, familiarity: 90, sweetheartSinceDay: null })).toBe(
      'close-friend',
    );
  });

  it('is rival at or below the rival threshold, regardless of familiarity', () => {
    expect(labelFor({ affinity: -40, familiarity: 90, sweetheartSinceDay: null })).toBe('rival');
    expect(labelFor({ affinity: -100, familiarity: 0, sweetheartSinceDay: null })).toBe('rival');
  });

  it('is sweetheart once a sweetheartSinceDay is set', () => {
    expect(labelFor({ affinity: 10, familiarity: 10, sweetheartSinceDay: 5 })).toBe('sweetheart');
  });
});

describe('applyEveningInteraction', () => {
  it('creates a relationship on first contact and keeps familiarity within bounds', () => {
    let relationships: Relationships = {};
    for (let day = 0; day < 100; day++) {
      relationships = applyEveningInteraction(relationships, 'ada', 'tobin', day, 1);
    }
    const relationship = getRelationship(relationships, 'ada', 'tobin');
    expect(relationship.familiarity).toBeLessThanOrEqual(100);
    expect(relationship.familiarity).toBeGreaterThanOrEqual(0);
    expect(relationship.affinity).toBeLessThanOrEqual(100);
    expect(relationship.affinity).toBeGreaterThanOrEqual(-100);
  });

  it('is deterministic for a given seed and day', () => {
    const a = applyEveningInteraction({}, 'ada', 'tobin', 3, 7);
    const b = applyEveningInteraction({}, 'ada', 'tobin', 3, 7);
    expect(a).toEqual(b);
  });

  it('marks a pair as sweethearts once affinity and familiarity both cross their thresholds', () => {
    let relationships: Relationships = {
      'ada::tobin': { affinity: 58, familiarity: 58, sweetheartSinceDay: null },
    };
    // Force a run of make-ups/gifts by seeding until a positive interaction lands;
    // run enough evenings that the thresholds are crossed under some seed.
    let becameSweetheartsOnDay: number | null = null;
    for (let day = 0; day < 50 && becameSweetheartsOnDay === null; day++) {
      relationships = applyEveningInteraction(relationships, 'ada', 'tobin', day, 1);
      if (getRelationship(relationships, 'ada', 'tobin').sweetheartSinceDay !== null) {
        becameSweetheartsOnDay = day;
      }
    }
    expect(becameSweetheartsOnDay).not.toBeNull();
  });
});

describe('applyGift', () => {
  it('raises affinity within the gift range and raises familiarity', () => {
    const relationships = applyGift({}, 'ada', 'tobin', 1, 1);
    const relationship = getRelationship(relationships, 'ada', 'tobin');
    expect(relationship.affinity).toBeGreaterThanOrEqual(5);
    expect(relationship.affinity).toBeLessThanOrEqual(15);
    expect(relationship.familiarity).toBe(2);
  });

  it('is deterministic for a given seed and day', () => {
    const a = applyGift({}, 'ada', 'tobin', 3, 7);
    const b = applyGift({}, 'ada', 'tobin', 3, 7);
    expect(a).toEqual(b);
  });

  it('does not perturb the evening-interaction roll for the same pair/day/seed', () => {
    const before = applyEveningInteraction({}, 'ada', 'tobin', 3, 7);
    applyGift({}, 'ada', 'tobin', 3, 7);
    const after = applyEveningInteraction({}, 'ada', 'tobin', 3, 7);
    expect(after).toEqual(before);
  });
});

describe('runEveningInteractions', () => {
  it('rolls one interaction for every unordered pair', () => {
    const relationships = runEveningInteractions({}, ['a', 'b', 'c'], 0, 1);
    expect(Object.keys(relationships).sort()).toEqual(['a::b', 'a::c', 'b::c']);
  });
});

describe('anyPairBelowAffinity', () => {
  it('is true only when some pair is at or below the threshold', () => {
    const relationships: Relationships = {
      'a::b': { affinity: -50, familiarity: 10, sweetheartSinceDay: null },
    };
    expect(anyPairBelowAffinity(relationships, ['a', 'b'], -40)).toBe(true);
    expect(anyPairBelowAffinity(relationships, ['a', 'b'], -60)).toBe(false);
    expect(anyPairBelowAffinity({}, ['a', 'b'], -40)).toBe(false);
  });
});

describe('anySweetheartFor', () => {
  it('is true only once enough days have passed since becoming sweethearts', () => {
    const relationships: Relationships = {
      'a::b': { affinity: 80, familiarity: 80, sweetheartSinceDay: 0 },
    };
    expect(anySweetheartFor(relationships, ['a', 'b'], 10, 14)).toBe(false);
    expect(anySweetheartFor(relationships, ['a', 'b'], 14, 14)).toBe(true);
  });
});
