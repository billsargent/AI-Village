import { describe, expect, it } from 'vitest';
import { CONTENT_PACKAGE_VERSION } from './index.js';

describe('content package', () => {
  it('exports a version', () => {
    expect(CONTENT_PACKAGE_VERSION).toBe('0.0.0');
  });
});
