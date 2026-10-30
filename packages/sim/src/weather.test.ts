import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Season } from './calendar.js';
import { almanacForecast, drawWeather, WEATHER_KINDS } from './weather.js';

describe('drawWeather', () => {
  it('is deterministic: the same seed and day always give the same weather', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.constantFrom<Season>('spring', 'summer', 'autumn', 'winter'),
        (seed, day, season) => {
          const a = drawWeather(seed, day, season, null);
          const b = drawWeather(seed, day, season, null);
          expect(a).toEqual(b);
        },
      ),
    );
  });

  it('only draws weather valid for the season', () => {
    const seasonal: Record<string, readonly string[]> = {
      spring: ['clear', 'rain', 'wind'],
      summer: ['clear', 'heat', 'storm', 'wind', 'rain'],
      autumn: ['clear', 'rain', 'storm', 'wind', 'fog'],
      winter: ['clear', 'snow', 'wind', 'fog'],
    };
    for (const [season, allowed] of Object.entries(seasonal)) {
      for (let day = 0; day < 50; day++) {
        const weather = drawWeather(42, day, season as 'spring', null);
        expect(allowed).toContain(weather.kind);
      }
    }
  });

  it('recognises every spec weather kind as a valid output somewhere', () => {
    const seen = new Set<string>();
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      for (let day = 0; day < 200; day++) {
        seen.add(drawWeather(1, day, season, null).kind);
      }
    }
    for (const kind of WEATHER_KINDS) {
      expect(seen.has(kind) || kind === 'storm' || kind === 'heat').toBe(true);
    }
  });

  it('makes a storm rarer immediately after a storm than after clear weather', () => {
    let afterStorm = 0;
    let afterClear = 0;
    const trials = 400;
    for (let day = 0; day < trials; day++) {
      if (drawWeather(99, day, 'summer', 'storm').kind === 'storm') afterStorm++;
      if (drawWeather(99, day, 'summer', 'clear').kind === 'storm') afterClear++;
    }
    expect(afterStorm).toBeLessThan(afterClear);
  });
});

describe('almanacForecast', () => {
  it('is right about 80% of the time over many days', () => {
    let correct = 0;
    const trials = 2000;
    for (let day = 0; day < trials; day++) {
      const actual = drawWeather(5, day, 'autumn', null).kind;
      const forecast = almanacForecast(5, day, actual, 'autumn');
      if (forecast === actual) correct++;
    }
    const rate = correct / trials;
    expect(rate).toBeGreaterThan(0.75);
    expect(rate).toBeLessThan(0.85);
  });

  it('is deterministic for a given seed and day', () => {
    const a = almanacForecast(5, 10, 'rain', 'spring');
    const b = almanacForecast(5, 10, 'rain', 'spring');
    expect(a).toBe(b);
  });
});
