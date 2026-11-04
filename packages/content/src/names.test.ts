import { describe, expect, it } from 'vitest';
import { VILLAGER_NAMES } from './names.js';

describe('VILLAGER_NAMES', () => {
  it('is a non-empty list of unique, lowercase names', () => {
    expect(VILLAGER_NAMES.length).toBeGreaterThan(0);
    expect(new Set(VILLAGER_NAMES).size).toBe(VILLAGER_NAMES.length);
    for (const name of VILLAGER_NAMES) {
      expect(name).toBe(name.toLowerCase());
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
