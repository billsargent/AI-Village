import { describe, expect, it } from 'vitest';
import { buildingsWithInteriors, planInteriorDraw } from './interior-draw.js';

describe('planInteriorDraw', () => {
  it('places every piece of furniture within the plan bounds, with margin', () => {
    const plan = planInteriorDraw('cottage');
    expect(plan).toBeDefined();
    expect(plan?.furniture.length).toBeGreaterThan(0);
    for (const item of plan?.furniture ?? []) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x + item.sprite.width).toBeLessThanOrEqual(plan?.width ?? 0);
      expect(item.y + item.sprite.height).toBeLessThanOrEqual(plan?.height ?? 0);
    }
  });

  it('returns undefined for a building with no furnished layout', () => {
    expect(planInteriorDraw('smithy')).toBeUndefined();
  });

  it('has a layout for town-hall, inn, school, post-office and shop too', () => {
    expect(planInteriorDraw('town-hall')).toBeDefined();
    expect(planInteriorDraw('inn')).toBeDefined();
    expect(planInteriorDraw('school')).toBeDefined();
    expect(planInteriorDraw('post-office')).toBeDefined();
    expect(planInteriorDraw('shop')).toBeDefined();
  });
});

describe('buildingsWithInteriors', () => {
  it('lists only built buildings that have a furnished layout', () => {
    expect(buildingsWithInteriors(['cottage', 'smithy', 'town-hall'])).toEqual([
      'cottage',
      'town-hall',
    ]);
  });

  it('is empty when nothing built has a layout', () => {
    expect(buildingsWithInteriors(['smithy', 'bakery'])).toEqual([]);
  });

  it("doesn't repeat a multi-instance building id twice", () => {
    expect(buildingsWithInteriors(['cottage', 'cottage', 'cottage'])).toEqual(['cottage']);
  });
});
