import { describe, expect, it } from 'vitest';
import { dreamFor, greeting } from './small-talk.js';

describe('greeting', () => {
  it('fits the hour, the weather and the festival', () => {
    const base = { to: 'ada', weather: 'clear', festival: null };
    const morning = new Set(
      Array.from({ length: 20 }, (_, i) => greeting({ ...base, hour: 8, seed: String(i) })),
    );
    expect([...morning].every((line) => !line.startsWith('Evening'))).toBe(true);
    expect(morning.size).toBeGreaterThan(1);
    expect(greeting({ ...base, hour: 19, seed: 'x' })).not.toMatch(/Morning/);
    expect(greeting({ ...base, hour: 12, festival: 'Sowing Fair', seed: 'a' })).toContain(
      'Sowing Fair',
    );
  });

  it('is the same for the same meeting', () => {
    const line = { to: 'ada', hour: 9, weather: 'rain', festival: null, seed: 's' };
    expect(greeting(line)).toBe(greeting(line));
  });
});

describe('dreamFor', () => {
  it('dreams of something from their trade, the season, or anything, and keeps it all night', () => {
    const dream = dreamFor('ada', 'farmer', 'winter', 'winter-3');
    expect(dream).toMatch(/^dreams of /);
    expect(dreamFor('ada', 'farmer', 'winter', 'winter-3')).toBe(dream);
    expect(dreamFor('zed', 'nobody', 'nowhere', 'd')).toMatch(/^dreams of /);
  });
});
