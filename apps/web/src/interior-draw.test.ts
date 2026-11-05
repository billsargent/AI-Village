import { describe, expect, it } from 'vitest';
import { buildingsWithInteriors, planInteriorDraw, roomZoom } from './interior-draw.js';

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

  it("tags town-hall's bookshelf, chest and book with their furniture kinds", () => {
    const plan = planInteriorDraw('town-hall');
    const bookshelf = plan?.furniture.find((item) => item.kind === 'bookshelf');
    const chest = plan?.furniture.find((item) => item.kind === 'chest');
    const book = plan?.furniture.find((item) => item.kind === 'book');
    expect(bookshelf).toBeDefined();
    expect(chest).toBeDefined();
    expect(book).toBeDefined();
  });

  it('has a layout for town-hall, inn, school, post-office, shop and forest-hut too', () => {
    expect(planInteriorDraw('town-hall')).toBeDefined();
    expect(planInteriorDraw('inn')).toBeDefined();
    expect(planInteriorDraw('school')).toBeDefined();
    expect(planInteriorDraw('post-office')).toBeDefined();
    expect(planInteriorDraw('shop')).toBeDefined();
    expect(planInteriorDraw('forest-hut')).toBeDefined();
  });
});

describe('the room round the furniture', () => {
  const inside =
    (outer: { x: number; y: number; width: number; height: number }) =>
    (r: { x: number; y: number; width: number; height: number }) =>
      r.x >= outer.x &&
      r.y >= outer.y &&
      r.x + r.width <= outer.x + outer.width &&
      r.y + r.height <= outer.y + outer.height;

  it('has a back wall above the floor, and the furniture and people on the floor', () => {
    for (const id of ['cottage', 'town-hall', 'shop', 'forest-hut'] as const) {
      const plan = planInteriorDraw(id);
      if (!plan) {
        throw new Error(`no plan for ${id}`);
      }
      expect(plan.wall.y + plan.wall.height).toBe(plan.floor.y);
      const onFloor = inside(plan.floor);
      for (const item of plan.furniture) {
        expect(onFloor({ ...item, width: item.sprite.width, height: item.sprite.height })).toBe(
          true,
        );
      }
      expect(plan.standingSpots.length).toBeGreaterThanOrEqual(3);
      for (const spot of plan.standingSpots) {
        expect(onFloor({ ...spot, width: 16, height: 16 })).toBe(true);
        // Nobody stands in the furniture.
        for (const item of plan.furniture) {
          const overlaps =
            spot.x < item.x + item.sprite.width &&
            spot.x + 16 > item.x &&
            spot.y < item.y + item.sprite.height &&
            spot.y + 16 > item.y;
          expect(overlaps).toBe(false);
        }
      }
      for (const decor of plan.wallDecor) {
        expect(
          inside(plan.wall)({ ...decor, width: decor.sprite.width, height: decor.sprite.height }),
        ).toBe(true);
      }
    }
  });

  it('has its door in the middle of the front wall', () => {
    const plan = planInteriorDraw('cottage');
    expect(plan?.door.y).toBe((plan?.floor.y ?? 0) + (plan?.floor.height ?? 0));
    expect((plan?.door.x ?? 0) + (plan?.door.width ?? 0) / 2).toBe((plan?.width ?? 0) / 2);
  });

  it('zooms in whole steps to fit the screen, from 2x to 6x', () => {
    const plan = planInteriorDraw('cottage');
    if (!plan) {
      throw new Error('no plan');
    }
    expect(Number.isInteger(roomZoom(plan, 1400, 900))).toBe(true);
    expect(roomZoom(plan, 1400, 900) * plan.height).toBeLessThanOrEqual(900);
    expect(roomZoom(plan, 100, 100)).toBe(2);
    expect(roomZoom(plan, 10000, 10000)).toBe(6);
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
