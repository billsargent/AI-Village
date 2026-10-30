import { describe, expect, it } from 'vitest';
import { INTEGRATIONS_PACKAGE_VERSION } from './index.js';

describe('integrations package', () => {
  it('exports a version', () => {
    expect(INTEGRATIONS_PACKAGE_VERSION).toBe('0.0.0');
  });
});
