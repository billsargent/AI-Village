import { describe, expect, it } from 'vitest';
import { getTrait, TRAITS } from './traits.js';

describe('traits table', () => {
  it('has the 20 version 1 traits', () => {
    expect(TRAITS).toHaveLength(20);
  });

  it('marks thieving and shifty as off by default, and no others', () => {
    const offByDefault = TRAITS.filter((trait) => trait.offByDefault).map((trait) => trait.id);
    expect(new Set(offByDefault)).toEqual(new Set(['thieving', 'shifty']));
  });

  it('marks lazy, grumpy, clumsy, gossip, stubborn and forgetful as flaws', () => {
    const flaws = [
      'lazy',
      'grumpy',
      'clumsy',
      'gossip',
      'stubborn',
      'forgetful',
      'thieving',
      'shifty',
    ];
    for (const id of flaws) {
      expect(getTrait(id)?.isFlaw, `"${id}" should be a flaw`).toBe(true);
    }
    expect(getTrait('hardworking')?.isFlaw).toBe(false);
  });
});
