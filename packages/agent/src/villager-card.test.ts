import { apply, createVillage, pairKey } from '@ai-village/sim';
import { describe, expect, it } from 'vitest';
import { villagerCard } from './villager-card.js';

function village() {
  return createVillage(1, {
    villagers: [
      { villagerId: 'ada', tradeId: 'farmer', skillLevel: 2, hasTool: false, moodFactor: 1 },
      { villagerId: 'tobin', tradeId: 'baker', skillLevel: 1, hasTool: false, moodFactor: 1 },
      { villagerId: 'wren', tradeId: 'innkeeper', skillLevel: 1, hasTool: false, moodFactor: 1 },
    ],
  });
}

describe('villagerCard', () => {
  it("shows a villager's trade, needs and mood as the sim has them", () => {
    const card = villagerCard(village(), 'ada');
    expect(card).toMatchObject({ id: 'ada', tradeId: 'farmer', role: 'villager', skillLevel: 2 });
    expect(card?.needs?.hunger).toBe(100);
    expect(card?.mood).toBeGreaterThan(0);
  });

  it('lists the people they know, closest first, and leaves strangers out', () => {
    const state = village();
    const withFriends = {
      ...state,
      relationships: {
        [pairKey('ada', 'tobin')]: { affinity: 30, familiarity: 50, sweetheartSinceDay: null },
        [pairKey('ada', 'wren')]: { affinity: 70, familiarity: 90, sweetheartSinceDay: null },
      },
    };
    const card = villagerCard(withFriends, 'ada');
    expect(card?.relationships.map((r) => [r.villagerId, r.label])).toEqual([
      ['wren', 'close-friend'],
      ['tobin', 'friend'],
    ]);
    expect(villagerCard(state, 'ada')?.relationships).toEqual([]);
  });

  it('carries their memories and open promises', () => {
    let state = village();
    state = apply(state, {
      kind: 'Remember',
      villagerId: 'ada',
      text: "The owner's favourite food is plum jam",
      importance: 6,
      about: 'owner',
    }).state;
    state = apply(state, {
      kind: 'MakePromise',
      villagerId: 'ada',
      text: 'Save the first plums for the owner',
      dueInDays: 3,
    }).state;

    const card = villagerCard(state, 'ada');
    expect(card?.memories).toEqual([
      { text: "The owner's favourite food is plum jam", about: 'owner' },
    ]);
    expect(card?.promises).toEqual([{ text: 'Save the first plums for the owner', daysLeft: 3 }]);
    expect(villagerCard(state, 'tobin')?.memories).toEqual([]);
  });

  it('is null for someone who does not live here', () => {
    expect(villagerCard(village(), 'nobody')).toBeNull();
  });
});
