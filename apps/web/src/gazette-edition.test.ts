import { describe, expect, it } from 'vitest';
import { festivalLook } from './festival-layer.js';
import { buildGazette, wordSearch } from './gazette-edition.js';
import type { VillageFacts } from './village-api.js';

const FACTS: VillageFacts = {
  weekday: 'Moonday',
  season: 'spring',
  seasonDay: 3,
  year: 0,
  hour: 7,
  minuteOfHour: 0,
  phase: 'dawn',
  weather: 'rain',
  isMarketDay: true,
  festival: null,
  population: 2,
  villagers: [
    { id: 'hesper', tradeId: 'mayor', role: 'mayor' },
    { id: 'ada', tradeId: 'farmer', role: 'villager' },
  ],
  builtBuildingIds: ['town-hall'],
  stores: { bread: 4, wheat: 20, flour: 0 },
  treasuryCoins: 0,
  treasuryDeltaYesterday: 0,
  recentChronicle: [
    { minute: 1, kind: 'x', text: 'Older news.', actors: [], importance: 1, public: true },
    { minute: 2, kind: 'x', text: 'Newest news.', actors: [], importance: 1, public: true },
  ],
  festivals: [
    { name: 'Sowing Fair', season: 'spring', seasonDay: 7 },
    { name: 'Lantern Night', season: 'winter', seasonDay: 14 },
  ],
  boardPosts: [{ author: 'owner', text: 'Well done, all.', postedDay: 0 }],
};

describe('buildGazette', () => {
  it('leads with the newest news, and counts down to the next festival', () => {
    const edition = buildGazette(FACTS, 2);
    expect(edition.dateLine).toBe('Moonday, Spring day 3, year 0');
    expect(edition.headlines).toEqual(['Newest news.', 'Older news.']);
    expect(edition.almanac).toEqual(['The Sowing Fair is in 4 days.', 'It is market day.']);
    expect(edition.weather).toBe('Rain');
    expect(edition.waitingOnYou).toBe('2 things are waiting in your inbox.');
    expect(edition.aroundTheGreen).toEqual(FACTS.boardPosts);
  });

  it('lists what is in the stores, fullest first, with base prices', () => {
    expect(buildGazette(FACTS, 0).stores).toEqual([
      { good: 'wheat', qty: 20, price: 1 },
      { good: 'bread', qty: 4, price: 3 },
    ]);
  });

  it('marks a festival day, and wraps round the year to the next one', () => {
    expect(buildGazette({ ...FACTS, festival: 'Sowing Fair' }, 0).almanac[0]).toBe(
      'Today is the Sowing Fair!',
    );
    const late = buildGazette({ ...FACTS, season: 'winter', seasonDay: 14 }, 0);
    expect(late.almanac[0]).toBe('The Sowing Fair is in 7 days.');
  });
});

describe('wordSearch', () => {
  it('hides every name across or down, in a square of capitals, the same all day', () => {
    const puzzle = wordSearch(['hesper', 'ada', 'tobin'], 'spring-3');
    expect(puzzle.grid).toHaveLength(10);
    expect(puzzle.grid.every((row) => /^[A-Z]{10}$/.test(row))).toBe(true);
    const columns = Array.from({ length: 10 }, (_, c) => puzzle.grid.map((row) => row[c]).join(''));
    for (const word of ['HESPER', 'ADA', 'TOBIN']) {
      expect(puzzle.words).toContain(word);
      expect([...puzzle.grid, ...columns].some((line) => line.includes(word))).toBe(true);
    }
    expect(wordSearch(['hesper', 'ada', 'tobin'], 'spring-3')).toEqual(puzzle);
  });

  it('leaves out a name too long to fit', () => {
    expect(wordSearch(['bartholomewson'], 'x').words).toEqual([]);
  });
});

describe('festivalLook', () => {
  it('puts up bunting, a bonfire or lanterns for the festival, and nothing otherwise', () => {
    expect(festivalLook('Sowing Fair')).toBe('bunting');
    expect(festivalLook('Harvest Festival')).toBe('bunting');
    expect(festivalLook('Midsummer Night')).toBe('bonfire');
    expect(festivalLook('Lantern Night')).toBe('lanterns');
    expect(festivalLook(null)).toBe('none');
  });
});
