import { describe, expect, it } from 'vitest';
import { CAT_NAP_SPOTS, catSpot } from './cat.js';
import { walkGrid } from './paths.js';

describe('the village cat', () => {
  const grid = walkGrid('main', ['town-hall', 'cottage', 'inn']);

  it('only naps where it can walk to', () => {
    for (const spot of CAT_NAP_SPOTS) {
      expect(grid[spot.y]?.[spot.x] ?? 0).toBeGreaterThan(0);
    }
  });

  it('moves about by day, and the same hour always finds it in the same place', () => {
    const spots = new Set<string>();
    for (let hour = 6; hour < 21; hour++) {
      spots.add(JSON.stringify(catSpot('spring-1', hour, [])));
      expect(catSpot('spring-1', hour, [])).toEqual(catSpot('spring-1', hour, []));
    }
    expect(spots.size).toBeGreaterThan(2);
  });

  it('sleeps on the inn doorstep at night, or the town hall one with no inn', () => {
    expect(catSpot('spring-1', 23, ['town-hall', 'inn']).where).toBe('asleep on the inn doorstep');
    expect(catSpot('spring-1', 2, ['town-hall']).where).toBe('asleep on the town hall doorstep');
    const doorstep = catSpot('spring-1', 23, ['town-hall']);
    expect(grid[doorstep.y]?.[doorstep.x] ?? 0).toBeGreaterThan(0);
  });
});
