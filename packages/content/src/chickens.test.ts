import { describe, expect, it } from 'vitest';
import { CHICKEN_COUNT, chickenSpots } from './chickens.js';
import { getPlot } from './layout.js';
import { walkGrid } from './paths.js';

describe('the chickens', () => {
  it('only come with fields', () => {
    expect(chickenSpots('spring-1', 10, 0, ['town-hall'])).toEqual([]);
  });

  it('stay inside the first field, where they can walk, and move each quarter hour', () => {
    const field = getPlot('fields', 0);
    const grid = walkGrid('main', ['fields']);
    const seen = new Set<string>();
    for (let minute = 0; minute < 60; minute += 15) {
      const spots = chickenSpots('spring-1', 10, minute, ['fields']);
      expect(spots).toHaveLength(CHICKEN_COUNT);
      for (const spot of spots) {
        expect(spot.x).toBeGreaterThan(field?.x ?? 0);
        expect(spot.x).toBeLessThan((field?.x ?? 0) + 8);
        expect(spot.y).toBeGreaterThan(field?.y ?? 0);
        expect(spot.y).toBeLessThan((field?.y ?? 0) + 6);
        expect(grid[spot.y]?.[spot.x] ?? 0).toBeGreaterThan(0);
        seen.add(`${spot.id}:${spot.x},${spot.y}`);
      }
    }
    expect(seen.size).toBeGreaterThan(CHICKEN_COUNT);
    expect(chickenSpots('spring-1', 10, 7, ['fields'])).toEqual(
      chickenSpots('spring-1', 10, 3, ['fields']),
    );
  });
});
