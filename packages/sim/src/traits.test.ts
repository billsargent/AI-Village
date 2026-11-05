import { getTrait } from '@ai-village/content';
import { describe, expect, it } from 'vitest';
import { apply, CommandError } from './commands.js';
import { getBalance } from './ledger.js';
import { getRelationship } from './relationships.js';
import { createVillage, runVillageDays } from './systems.js';
import {
  friendshipGrowthFor,
  invalidTraitsReason,
  pickTraits,
  skipsStint,
  workMultiplierFor,
} from './traits.js';

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

describe('what traits do', () => {
  it('hardworking adds 15% to any stint; green-thumbed adds 15% only in fields and gardens', () => {
    expect(workMultiplierFor([], 'bakery')).toBe(1);
    expect(workMultiplierFor(['hardworking'], 'bakery')).toBeCloseTo(1.15, 6);
    expect(workMultiplierFor(['green-thumbed'], 'bakery')).toBe(1);
    expect(workMultiplierFor(['green-thumbed'], 'fields')).toBeCloseTo(1.15, 6);
    expect(workMultiplierFor(['hardworking', 'green-thumbed'], 'fields')).toBeCloseTo(1.3225, 6);
  });

  it('a lazy villager skips about 1 stint in 5, the same ones every time; nobody else ever does', () => {
    let skipped = 0;
    const days = 500;
    for (let day = 0; day < days; day++) {
      for (const stint of [0, 1]) {
        if (skipsStint(['lazy'], 4, 'ada', day, stint)) skipped++;
        expect(skipsStint(['cheerful'], 4, 'ada', day, stint)).toBe(false);
      }
    }
    expect(skipped / (days * 2)).toBeGreaterThan(0.15);
    expect(skipped / (days * 2)).toBeLessThan(0.25);
    expect(skipsStint(['lazy'], 4, 'ada', 3, 1)).toBe(skipsStint(['lazy'], 4, 'ada', 3, 1));
  });

  it('cheerful friendships grow 25% faster and grumpy ones 25% slower', () => {
    expect(friendshipGrowthFor([])).toBe(1);
    expect(friendshipGrowthFor(['cheerful'])).toBe(1.25);
    expect(friendshipGrowthFor(['grumpy'])).toBe(0.75);
  });

  it('a hardworking baker bakes more than an ordinary one in the same village', () => {
    const scenario = (traits: string[]) => ({
      villagers: [
        {
          villagerId: 'tobin',
          tradeId: 'baker',
          skillLevel: 1,
          hasTool: false,
          moodFactor: 1,
          traits,
        },
      ],
      builtBuildingIds: ['bakery'],
      startingStock: [
        { account: 'village', item: 'flour', qty: 500 },
        { account: 'treasury', item: 'coins', qty: 500 },
      ],
    });
    const bread = (traits: string[]) =>
      getBalance(runVillageDays(2, 10, scenario(traits)).state.ledger, 'village', 'bread');
    expect(bread(['hardworking', 'shy'])).toBeGreaterThan(bread(['shy', 'tidy']));
  });

  it('a lazy villager naps through some stints, and the chronicle says so privately', () => {
    const { state } = runVillageDays(2, 20, {
      villagers: [
        {
          villagerId: 'ada',
          tradeId: 'farmer',
          skillLevel: 1,
          hasTool: false,
          moodFactor: 1,
          traits: ['lazy', 'cheerful'],
        },
      ],
      builtBuildingIds: ['fields'],
      startingStock: [{ account: 'treasury', item: 'coins', qty: 500 }],
    });
    const naps = state.chronicle.filter((entry) => entry.kind === 'work-skip');
    expect(naps.length).toBeGreaterThan(0);
    expect(naps.every((entry) => !entry.public && entry.actors.includes('ada'))).toBe(true);
  });

  it('two cheerful villagers become friends faster than two grumpy ones', () => {
    const pair = (traits: string[]) => ({
      villagers: ['ada', 'tobin'].map((villagerId) => ({
        villagerId,
        tradeId: 'farmer',
        skillLevel: 1,
        hasTool: false,
        moodFactor: 1,
        traits,
      })),
    });
    const affinity = (traits: string[]) =>
      getRelationship(runVillageDays(8, 15, pair(traits)).state.relationships, 'ada', 'tobin')
        .affinity;
    expect(affinity(['cheerful', 'shy'])).toBeGreaterThan(affinity(['grumpy', 'shy']));
  });
});
