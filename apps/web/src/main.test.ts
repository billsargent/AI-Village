import { describe, expect, it } from 'vitest';
import { WEB_PACKAGE_VERSION } from './main.js';

describe('web package', () => {
  it('exports a version', () => {
    expect(WEB_PACKAGE_VERSION).toBe('0.0.0');
  });
});
