import { describe, expect, it } from 'vitest';
import { DB_PACKAGE_VERSION } from './index.js';

describe('db package', () => {
  it('exports a version', () => {
    expect(DB_PACKAGE_VERSION).toBe('0.0.0');
  });
});
