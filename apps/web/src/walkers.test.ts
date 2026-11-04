import { describe, expect, it } from 'vitest';
import {
  FADE_MS,
  placeWalker,
  retargetWalker,
  stepWalker,
  walkerPosition,
  WALK_TILES_PER_SECOND,
  type WalkerState,
} from './walkers.js';

/** A 6x3 open field, all road. */
const OPEN = [
  [1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1],
];

const TILE_MS = 1000 / WALK_TILES_PER_SECOND;

function run(state: WalkerState, ms: number, reducedMotion = false): WalkerState {
  let next = state;
  for (let t = 0; t < ms; t += 16) {
    next = stepWalker(next, 16, reducedMotion);
  }
  return next;
}

describe('walkers', () => {
  it('first appears exactly where they belong - visible outdoors, out of sight indoors', () => {
    expect(placeWalker({ x: 2, y: 1, hidden: false })).toMatchObject({
      tile: { x: 2, y: 1 },
      visible: true,
      alpha: 1,
    });
    expect(placeWalker({ x: 2, y: 1, hidden: true })).toMatchObject({ visible: false, alpha: 0 });
  });

  it('walks tile by tile to a new spot, gliding between tiles', () => {
    let walker = placeWalker({ x: 0, y: 0, hidden: false });
    walker = retargetWalker(walker, { x: 3, y: 0, hidden: false }, OPEN);
    expect(walker.path).toHaveLength(3);

    walker = stepWalker(walker, TILE_MS / 2);
    expect(walkerPosition(walker).x).toBeCloseTo(0.5, 5);

    walker = run(walker, TILE_MS * 4);
    expect(walker.tile).toEqual({ x: 3, y: 0 });
    expect(walker.visible).toBe(true);
  });

  it('walks to a door, then fades out of sight inside', () => {
    let walker = placeWalker({ x: 0, y: 0, hidden: false });
    walker = retargetWalker(walker, { x: 2, y: 0, hidden: true }, OPEN);
    walker = run(walker, TILE_MS * 2 + 32);
    expect(walker.tile).toEqual({ x: 2, y: 0 });
    expect(walker.fade).toBe('out');
    walker = run(walker, FADE_MS + 32);
    expect(walker.visible).toBe(false);
  });

  it('comes out of a door - fading in where they were - before walking off', () => {
    let walker = placeWalker({ x: 1, y: 1, hidden: true });
    walker = retargetWalker(walker, { x: 4, y: 1, hidden: false }, OPEN);
    expect(walker).toMatchObject({ visible: true, alpha: 0, fade: 'in', tile: { x: 1, y: 1 } });
    walker = run(walker, FADE_MS / 2);
    expect(walker.tile).toEqual({ x: 1, y: 1 });
    walker = run(walker, FADE_MS + TILE_MS * 3 + 64);
    expect(walker.tile).toEqual({ x: 4, y: 1 });
    expect(walker.alpha).toBe(1);
  });

  it('goes round what is in the way', () => {
    const wall = [
      [1, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
    ];
    const walker = retargetWalker(
      placeWalker({ x: 0, y: 0, hidden: false }),
      { x: 2, y: 0, hidden: false },
      wall,
    );
    expect(walker.path.some((tile) => tile.x === 1 && tile.y < 2)).toBe(false);
    expect(walker.path.at(-1)).toEqual({ x: 2, y: 0 });
  });

  it("just appears at the new spot when there's no way there", () => {
    const cut = [
      [1, 0, 1],
      [1, 0, 1],
    ];
    const walker = retargetWalker(
      placeWalker({ x: 0, y: 0, hidden: false }),
      { x: 2, y: 1, hidden: false },
      cut,
    );
    expect(walker).toMatchObject({ tile: { x: 2, y: 1 }, path: [] });
  });

  it('with reduced motion, moves in whole tiles and vanishes at the door without a fade', () => {
    let walker = placeWalker({ x: 0, y: 0, hidden: false });
    walker = retargetWalker(walker, { x: 2, y: 0, hidden: true }, OPEN, true);
    walker = stepWalker(walker, TILE_MS / 2, true);
    expect(walkerPosition(walker, true)).toEqual({ x: 0, y: 0 });
    walker = run(walker, TILE_MS * 2 + 32, true);
    expect(walker.visible).toBe(false);
    expect(walker.fade).toBeNull();
  });

  it("doesn't restart a walk when the target hasn't changed", () => {
    const walker = retargetWalker(
      placeWalker({ x: 0, y: 0, hidden: false }),
      { x: 3, y: 0, hidden: false },
      OPEN,
    );
    const midway = stepWalker(walker, TILE_MS);
    expect(retargetWalker(midway, { x: 3, y: 0, hidden: false }, OPEN)).toBe(midway);
  });
});
