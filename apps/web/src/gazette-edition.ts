/**
 * Spec section 15's Morning Gazette, by rules: everything in this edition
 * comes from the facts. The spec's edition is one cheap model call a day
 * that writes the gossip and the letters; until that exists, this is the
 * paper with the facts and the puzzle and no columns.
 */
import { GOODS } from '@ai-village/content';
import type { VillageFacts } from './village-api.js';

/** Days in each season, and the seasons in order (the sim's calendar). */
const DAYS_PER_SEASON = 14;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export interface WordSearch {
  /** Rows of capital letters. */
  grid: readonly string[];
  /** The words hidden in it, in capitals. */
  words: readonly string[];
}

export interface GazetteEdition {
  dateLine: string;
  headlines: readonly string[];
  weather: string;
  almanac: readonly string[];
  stores: readonly { good: string; qty: number; price: number }[];
  aroundTheGreen: readonly { author: string; text: string }[];
  waitingOnYou: string;
  puzzle: WordSearch;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded random source (mulberry32), so a day's puzzle is the same all day. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A word search hiding each word across or down. Words too long for the
 * grid, or that won't fit after a few tries, are left out (and not listed).
 */
export function wordSearch(words: readonly string[], seed: string, size = 10): WordSearch {
  const random = seeded(hash(seed));
  const grid: (string | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
  const placed: string[] = [];
  for (const raw of words) {
    const word = raw.toUpperCase().replace(/[^A-Z]/g, '');
    if (word.length === 0 || word.length > size || placed.includes(word)) {
      continue;
    }
    for (let attempt = 0; attempt < 50; attempt++) {
      const across = random() < 0.5;
      const row = Math.floor(random() * (across ? size : size - word.length + 1));
      const col = Math.floor(random() * (across ? size - word.length + 1 : size));
      const cells = Array.from(word, (letter) => letter).map((letter, i) => ({
        letter,
        r: across ? row : row + i,
        c: across ? col + i : col,
      }));
      if (cells.every(({ letter, r, c }) => [null, letter].includes(grid[r]?.[c] ?? null))) {
        for (const { letter, r, c } of cells) {
          const line = grid[r];
          if (line) {
            line[c] = letter;
          }
        }
        placed.push(word);
        break;
      }
    }
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return {
    grid: grid.map((row) =>
      row.map((cell) => cell ?? alphabet[Math.floor(random() * alphabet.length)]).join(''),
    ),
    words: placed,
  };
}

/** Days from today to a festival, going round the year. */
function daysUntil(data: VillageFacts, season: string, seasonDay: number): number {
  const yearDay = (s: string, d: number) =>
    SEASONS.indexOf(s as (typeof SEASONS)[number]) * DAYS_PER_SEASON + d - 1;
  const today = yearDay(data.season, data.seasonDay);
  const then = yearDay(season, seasonDay);
  return (then - today + DAYS_PER_SEASON * SEASONS.length) % (DAYS_PER_SEASON * SEASONS.length);
}

export function buildGazette(data: VillageFacts, pendingApprovals: number): GazetteEdition {
  const headlines = [...data.recentChronicle]
    .reverse()
    .slice(0, 6)
    .map((entry) => entry.text);

  const almanac: string[] = [];
  if (data.festival) {
    almanac.push(`Today is the ${data.festival}!`);
  } else {
    const next = [...data.festivals]
      .map((festival) => ({
        festival,
        days: daysUntil(data, festival.season, festival.seasonDay),
      }))
      .filter(({ days }) => days > 0)
      .sort((a, b) => a.days - b.days)[0];
    if (next) {
      almanac.push(
        `The ${next.festival.name} is ${next.days === 1 ? 'tomorrow' : `in ${next.days} days`}.`,
      );
    }
  }
  almanac.push(data.isMarketDay ? 'It is market day.' : 'No market today.');

  const stores = Object.entries(data.stores)
    .filter(([, qty]) => qty > 0)
    .map(([good, qty]) => ({
      good,
      qty,
      price: GOODS.find((entry) => entry.id === good)?.basePrice ?? 0,
    }))
    .sort((a, b) => b.qty - a.qty);

  return {
    dateLine: `${data.weekday}, ${capitalise(data.season)} day ${data.seasonDay}, year ${data.year}`,
    headlines,
    weather: capitalise(data.weather),
    almanac,
    stores,
    aroundTheGreen: data.boardPosts,
    waitingOnYou:
      pendingApprovals === 0
        ? 'Nothing is waiting on you.'
        : `${pendingApprovals} ${pendingApprovals === 1 ? 'thing is' : 'things are'} waiting in your inbox.`,
    puzzle: wordSearch(
      data.villagers.map((villager) => villager.id),
      `${data.year}-${data.season}-${data.seasonDay}`,
    ),
  };
}
