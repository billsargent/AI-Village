import { describe, expect, it } from 'vitest';
import { SERVER_PACKAGE_VERSION } from './index.js';

describe('server package', () => {
  it('exports a version', () => {
    expect(SERVER_PACKAGE_VERSION).toBe('0.0.0');
  });
});
