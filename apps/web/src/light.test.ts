import { describe, expect, it } from 'vitest';
import { brightnessOf, lightAt, lightWord } from './light.js';

describe('lightAt', () => {
  it('is neutral by day, so the map looks as drawn', () => {
    expect(lightAt(12, 0)).toEqual([255, 255, 255]);
    expect(lightAt(9, 30)).toEqual([255, 255, 255]);
  });

  it('is deep blue at night, at about 45% brightness', () => {
    const night = lightAt(1, 0);
    expect(night[2]).toBeGreaterThan(night[0]);
    expect(brightnessOf(night)).toBeCloseTo(0.45, 1);
  });

  it('is amber at dawn and violet at dusk', () => {
    const [r, g, b] = lightAt(5, 30);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    const dusk = lightAt(19, 0);
    expect(dusk[2]).toBeGreaterThan(dusk[1]);
    expect(dusk[0]).toBeGreaterThan(dusk[1]);
  });

  it('changes smoothly - no jump between one village minute and the next', () => {
    for (let minute = 0; minute < 24 * 60 - 1; minute++) {
      const a = lightAt(Math.floor(minute / 60), minute % 60);
      const b = lightAt(Math.floor((minute + 1) / 60), (minute + 1) % 60);
      for (const c of [0, 1, 2]) {
        expect(Math.abs((a[c] ?? 0) - (b[c] ?? 0))).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('lightWord', () => {
  it('names the light', () => {
    expect([3, 6, 12, 18, 23].map(lightWord)).toEqual(['night', 'dawn', 'day', 'dusk', 'night']);
  });
});
