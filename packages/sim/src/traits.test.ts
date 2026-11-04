import { getTrait } from '@ai-village/content';
import { describe, expect, it } from 'vitest';
import { apply, CommandError } from './commands.js';
import { createVillage } from './systems.js';
import { invalidTraitsReason, pickTraits } from './traits.js';

describe('pickTraits', () => {
  it('gives 2 or 3 known traits, at most one flaw, never an off-by-default one', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const id of ['ada', 'tobin', 'wren', 'hesper']) {
        const traits = pickTraits(seed, id);
        expect(invalidTraitsReason(traits)).toBeNull();
        expect(traits.every((trait) => getTrait(trait)?.offByDefault === false)).toBe(true);
      }
    }
  });

  it('is the same every time for the same village and villager, and differs between them', () => {
    expect(pickTraits(7, 'ada')).toEqual(pickTraits(7, 'ada'));
    const all = new Set(
      ['ada', 'tobin', 'wren', 'hesper', 'finn'].map((id) => pickTraits(7, id).join()),
    );
    expect(all.size).toBeGreaterThan(1);
  });
});

describe('invalidTraitsReason', () => {
  it('accepts a good set, and says plainly what is wrong with a bad one', () => {
    expect(invalidTraitsReason(['hardworking', 'grumpy', 'generous'])).toBeNull();
    expect(invalidTraitsReason(['hardworking'])).toMatch(/2 or 3/);
    expect(invalidTraitsReason(['lazy', 'grumpy'])).toMatch(/flaw/);
    expect(invalidTraitsReason(['hardworking', 'thieving'])).toMatch(/off unless/);
    expect(invalidTraitsReason(['hardworking', 'sparkly'])).toMatch(/Unknown trait/);
    expect(invalidTraitsReason(['shy', 'shy'])).toMatch(/twice/);
  });
});

describe('traits in the village', () => {
  it('gives every villager traits when the scenario names none, and keeps the ones it does name', () => {
    const state = createVillage(3, {
      villagers: [
        { villagerId: 'ada', tradeId: 'farmer', skillLevel: 1, hasTool: false, moodFactor: 1 },
        {
          villagerId: 'tobin',
          tradeId: 'baker',
          skillLevel: 1,
          hasTool: false,
          moodFactor: 1,
          traits: ['hardworking', 'grumpy', 'generous'],
        },
      ],
    });
    expect(state.villagers[0]?.traits).toEqual(pickTraits(3, 'ada'));
    expect(state.villagers[1]?.traits).toEqual(['hardworking', 'grumpy', 'generous']);
  });

  it('refuses a scenario villager with too many flaws', () => {
    expect(() =>
      createVillage(3, {
        villagers: [
          {
            villagerId: 'ada',
            tradeId: 'farmer',
            skillLevel: 1,
            hasTool: false,
            moodFactor: 1,
            traits: ['lazy', 'grumpy'],
          },
        ],
      }),
    ).toThrow(/flaw/);
  });

  it('hires a newcomer with the traits the Mayor named, or their own when none were named', () => {
    const state = createVillage(5, {});
    const named = apply(state, {
      kind: 'HireVillager',
      tradeId: 'baker',
      reason: 'no bread',
      traits: ['cheerful', 'tidy'],
    }).state;
    expect(named.villagers[0]?.traits).toEqual(['cheerful', 'tidy']);

    const picked = apply(state, {
      kind: 'HireVillager',
      tradeId: 'baker',
      reason: 'no bread',
    }).state;
    const newcomer = picked.villagers[0];
    expect(newcomer?.traits).toEqual(pickTraits(5, newcomer?.villagerId ?? ''));
  });

  it('turns down a hire whose traits break the rules, hiring nobody', () => {
    const state = createVillage(5, {});
    expect(() =>
      apply(state, {
        kind: 'HireVillager',
        tradeId: 'baker',
        reason: 'no bread',
        traits: ['thieving', 'tidy'],
      }),
    ).toThrow(CommandError);
  });
});
