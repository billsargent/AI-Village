import { describe, expect, it } from 'vitest';
import { getRole, ROLES } from './roles.js';

describe('roles table', () => {
  it('has all 6 spec section 12 roles', () => {
    expect(ROLES).toHaveLength(6);
  });

  it('has no duplicate ids', () => {
    const ids = ROLES.map((role) => role.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is on by default except for steward', () => {
    const offByDefault = ROLES.filter((role) => !role.onByDefault).map((role) => role.id);
    expect(offByDefault).toEqual(['steward']);
  });

  it('looks roles up by id', () => {
    expect(getRole('mayor')?.title).toBe('Mayor');
    expect(getRole('nonexistent')).toBeUndefined();
  });
});
