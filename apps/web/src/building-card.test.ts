import { describe, expect, it } from 'vitest';
import { buildingSummary, namesList, whoIsIn } from './building-card.js';
import { filterPalette, type PaletteItem } from './CommandPalette.js';
import type { VillageFacts } from './village-api.js';

const FACTS: VillageFacts = {
  weekday: 'Moonday',
  season: 'spring',
  seasonDay: 1,
  year: 0,
  hour: 10,
  minuteOfHour: 0,
  phase: 'work-first-stint',
  weather: 'clear',
  isMarketDay: false,
  festival: null,
  population: 3,
  villagers: [
    { id: 'hesper', tradeId: 'mayor', role: 'mayor' },
    { id: 'ada', tradeId: 'farmer', role: 'villager' },
    { id: 'ben', tradeId: 'farmer', role: 'villager' },
  ],
  builtBuildingIds: ['town-hall', 'cottage', 'cottage', 'fields'],
  stores: {},
  treasuryCoins: 0,
  treasuryDeltaYesterday: 0,
  recentChronicle: [],
  festivals: [],
  boardPosts: [],
};

describe('buildingSummary', () => {
  it('numbers one of several cottages, and shares homes out in roster order', () => {
    const first = buildingSummary(FACTS, 'cottage', 0);
    const second = buildingSummary(FACTS, 'cottage', 1);
    expect(first.title).toBe('Cottage 1');
    expect(first.residents.map((v) => v.id)).toEqual(['hesper', 'ben']);
    expect(second.residents.map((v) => v.id)).toEqual(['ada']);
    expect(first.canEnter).toBe(true);
  });

  it('names who works at a workplace, out of how many places', () => {
    const fields = buildingSummary(FACTS, 'fields', 0);
    expect(fields.workers.map((v) => v.id)).toEqual(['ada', 'ben']);
    expect(fields.places).toBe(2);
    expect(fields.canEnter).toBe(false);
    expect(buildingSummary(FACTS, 'town-hall', 0).inside.map((v) => v.id)).toEqual(['hesper']);
  });
});

describe('who is in', () => {
  it('lists names the way people say them', () => {
    const hesper = { id: 'hesper', tradeId: 'mayor', role: 'mayor' };
    const ada = { id: 'ada', tradeId: 'farmer', role: 'villager' };
    const ben = { id: 'ben', tradeId: 'farmer', role: 'villager' };
    expect(namesList([hesper])).toBe('Hesper');
    expect(namesList([hesper, ada, ben])).toBe('Hesper, Ada and Ben');
    expect(whoIsIn('cottage', [hesper, ada])).toBe('Hesper and Ada are home');
    expect(whoIsIn('town-hall', [hesper])).toBe('Hesper is in');
    expect(whoIsIn('inn', [])).toBeNull();
  });
});

describe('filterPalette', () => {
  const item = (label: string, keywords = ''): PaletteItem => ({
    id: label,
    label,
    hint: '',
    keywords,
    run: () => undefined,
  });
  const items = [
    item('Chat with Ada', 'farmer'),
    item('Ada', 'farmer'),
    item('Inbox', 'approvals'),
  ];

  it('needs every word, and puts names that start with it first', () => {
    expect(filterPalette(items, 'ada').map((i) => i.label)).toEqual(['Ada', 'Chat with Ada']);
    expect(filterPalette(items, 'chat farmer').map((i) => i.label)).toEqual(['Chat with Ada']);
    expect(filterPalette(items, 'approvals').map((i) => i.label)).toEqual(['Inbox']);
    expect(filterPalette(items, '')).toHaveLength(3);
  });
});
