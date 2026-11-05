import { describe, expect, it } from 'vitest';
import {
  dimmed,
  glowsFor,
  glowStrength,
  particlesNow,
  seasonLook,
  walkPace,
  weatherLook,
} from './atmosphere.js';
import type { VillageFacts } from './village-api.js';
import { planCanvasDraw } from './village-draw.js';

const FACTS: VillageFacts = {
  weekday: 'Moonday',
  season: 'spring',
  seasonDay: 1,
  year: 0,
  hour: 9,
  minuteOfHour: 0,
  phase: 'work-first-stint',
  weather: 'clear',
  isMarketDay: false,
  festival: null,
  population: 0,
  villagers: [],
  builtBuildingIds: ['town-hall', 'cottage', 'fields'],
  stores: {},
  treasuryCoins: 0,
  treasuryDeltaYesterday: 0,
  recentChronicle: [],
  festivals: [],
  boardPosts: [],
};

describe('glowsFor', () => {
  it('lights two windows and a door on every lived-in building, and nothing on open ground', () => {
    const { buildings } = planCanvasDraw(FACTS);
    const glows = glowsFor(buildings);
    const enclosed = buildings.filter((b) => b.buildingId !== 'fields');
    expect(glows).toHaveLength(enclosed.length * 3);
    for (const building of enclosed) {
      const inside = glows.filter(
        (g) =>
          g.x >= building.x &&
          g.x <= building.x + building.sprite.width &&
          g.y >= building.y &&
          g.y <= building.y + building.sprite.height,
      );
      expect(inside.map((g) => g.kind).sort()).toEqual(['door', 'window', 'window']);
    }
  });
});

describe('glowStrength', () => {
  it('lights the lamps at 19:00 and puts them out by 06:00', () => {
    expect(glowStrength(12, 0)).toBe(0);
    expect(glowStrength(18, 0)).toBe(0);
    expect(glowStrength(19, 0)).toBeCloseTo(0.5);
    expect(glowStrength(20, 0)).toBe(1);
    expect(glowStrength(2, 0)).toBe(1);
    expect(glowStrength(5, 30)).toBeCloseTo(0.5);
    expect(glowStrength(6, 0)).toBe(0);
  });

  it('never jumps by more than a little between village minutes', () => {
    for (let minute = 0; minute < 24 * 60 - 1; minute++) {
      const a = glowStrength(Math.floor(minute / 60), minute % 60);
      const b = glowStrength(Math.floor((minute + 1) / 60), (minute + 1) % 60);
      expect(Math.abs(a - b)).toBeLessThan(0.02);
    }
  });
});

describe('seasons', () => {
  it('leaves summer as drawn, turns autumn amber and winter white, and puts winter flowers away', () => {
    expect(seasonLook('summer')).toMatchObject({ foliage: null, ground: null, blooms: true });
    expect(seasonLook('autumn').foliage).not.toBeNull();
    expect(seasonLook('winter')).toMatchObject({ blooms: false });
    expect(seasonLook('winter').ground).not.toBeNull();
  });

  it("turns a leaf green orange in autumn: the matrix's red outweighs its green", () => {
    const matrix = seasonLook('autumn').foliage ?? [];
    const leaf = [0.39, 0.67, 0.24];
    const apply = (row: number) =>
      (matrix[row * 5] ?? 0) * (leaf[0] ?? 0) +
      (matrix[row * 5 + 1] ?? 0) * (leaf[1] ?? 0) +
      (matrix[row * 5 + 2] ?? 0) * (leaf[2] ?? 0) +
      (matrix[row * 5 + 4] ?? 0);
    expect(apply(0)).toBeGreaterThan(apply(1));
    expect(apply(1)).toBeGreaterThan(apply(2));
  });
});

describe('weather', () => {
  it('rains in rain and storms, snows in snow, and fogs in fog', () => {
    expect(weatherLook('rain').particles).toBe('rain');
    expect(weatherLook('storm').count).toBeGreaterThan(weatherLook('rain').count);
    expect(weatherLook('snow').particles).toBe('snow');
    expect(weatherLook('fog').fog).toBeGreaterThan(0);
  });

  it('is darker in rain and darker again in a storm', () => {
    expect(weatherLook('clear').dim).toBe(1);
    expect(weatherLook('rain').dim).toBeLessThan(1);
    expect(weatherLook('storm').dim).toBeLessThan(weatherLook('rain').dim);
    expect(dimmed([200, 100, 50], 0.5)).toEqual([100, 50, 25]);
  });

  it("drifts the season's petals or leaves in fair weather, but rain is rain whatever the season", () => {
    expect(particlesNow(seasonLook('spring'), weatherLook('clear'))).toBe('petals');
    expect(particlesNow(seasonLook('autumn'), weatherLook('wind'))).toBe('leaves');
    expect(particlesNow(seasonLook('summer'), weatherLook('clear'))).toBe('none');
    expect(particlesNow(seasonLook('autumn'), weatherLook('rain'))).toBe('rain');
  });
});

describe('walkPace', () => {
  it('stops everyone while paused, quickens with the clock, and slows in snow', () => {
    expect(walkPace({ speed: 1, paused: true }, 'clear')).toBe(0);
    expect(walkPace({ speed: 1, paused: false }, 'clear')).toBe(1);
    expect(walkPace({ speed: 2, paused: false }, 'clear')).toBe(1.6);
    expect(walkPace({ speed: 4, paused: false }, 'clear')).toBe(2.5);
    expect(walkPace({ speed: 1, paused: false }, 'snow')).toBeCloseTo(0.8);
    // Before the clock has loaded: walk at the usual pace.
    expect(walkPace(undefined, 'clear')).toBe(1);
  });
});
