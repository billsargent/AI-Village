import { describe, expect, it } from 'vitest';
import { SIM_PACKAGE_VERSION } from './index.js';

describe('sim package', () => {
  it('exports a version', () => {
    expect(SIM_PACKAGE_VERSION).toBe('0.0.0');
  });
});
