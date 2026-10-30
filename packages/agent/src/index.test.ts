import { describe, expect, it } from 'vitest';
import { AGENT_PACKAGE_VERSION } from './index.js';

describe('agent package', () => {
  it('exports a version', () => {
    expect(AGENT_PACKAGE_VERSION).toBe('0.0.0');
  });
});
