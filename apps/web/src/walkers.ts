import { findPath, type Tile, type WalkGrid } from '@ai-village/content';

/** Walking pace, in tiles per real second - an easy stroll at 16px tiles. */
export const WALK_TILES_PER_SECOND = 4;
/** How long fading out at a door (or back in, coming out) takes. */
export const FADE_MS = 350;

/** Where a villager should end up, as the map plans it (see `villagersOnMap`). */
export interface WalkTarget {
  x: number;
  y: number;
  /** Once there, go out of sight: through a door, or off by a signpost. */
  hidden: boolean;
}

/**
 * One villager on the map, between frames. Kept free of the renderer so
 * the walking itself can be tested: the canvas copies `position` and
 * `alpha` onto a sprite each frame.
 */
export interface WalkerState {
  /** The tile they're on, or have just left if `progress` > 0. */
  tile: Tile;
  /** The tiles still to walk, next first. */
  path: Tile[];
  /** 0-1 of the way from `tile` to `path[0]`. */
  progress: number;
  alpha: number;
  visible: boolean;
  fade: 'in' | 'out' | null;
  /** Fade out on arriving: the target is indoors or off the map. */
  goingInside: boolean;
  target: WalkTarget;
}

/** First sight of a villager: straight to where they should be, no walk in from anywhere (spec section 18). */
export function placeWalker(target: WalkTarget): WalkerState {
  return {
    tile: { x: target.x, y: target.y },
    path: [],
    progress: 0,
    alpha: target.hidden ? 0 : 1,
    visible: !target.hidden,
    fade: null,
    goingInside: target.hidden,
    target,
  };
}

function sameTarget(a: WalkTarget, b: WalkTarget): boolean {
  return a.x === b.x && a.y === b.y && a.hidden === b.hidden;
}

/**
 * Sends a villager somewhere new. Someone indoors steps out of the door
 * (fading in) and then walks; the route is A* on the walk grid. With no
 * route at all they simply appear there - better than standing stuck.
 */
export function retargetWalker(
  state: WalkerState,
  target: WalkTarget,
  grid: WalkGrid,
  reducedMotion = false,
): WalkerState {
  if (sameTarget(state.target, target)) {
    return state;
  }
  // Mid-step, carry on from whichever tile they're nearer.
  const start = state.progress >= 0.5 && state.path[0] ? state.path[0] : state.tile;
  const out = !state.visible || state.fade === 'out';
  const route = findPath(grid, start, target);

  if (!route) {
    return placeWalker(target);
  }

  return {
    tile: { ...start },
    path: route.slice(1),
    progress: 0,
    alpha: out ? (reducedMotion ? 1 : 0) : state.alpha,
    visible: true,
    fade: out && !reducedMotion ? 'in' : null,
    goingInside: target.hidden,
    target,
  };
}

/** Advances one frame of `dtMs` real milliseconds. */
export function stepWalker(state: WalkerState, dtMs: number, reducedMotion = false): WalkerState {
  const next: WalkerState = { ...state, tile: { ...state.tile }, path: [...state.path] };

  if (next.fade === 'in') {
    next.alpha = Math.min(1, next.alpha + dtMs / FADE_MS);
    if (next.alpha >= 1) {
      next.fade = null;
    }
    // Out of the door first, then walk.
    return next;
  }
  if (next.fade === 'out') {
    next.alpha = Math.max(0, next.alpha - dtMs / FADE_MS);
    if (next.alpha <= 0) {
      next.fade = null;
      next.visible = false;
    }
    return next;
  }

  if (next.path.length > 0) {
    next.progress += (dtMs / 1000) * WALK_TILES_PER_SECOND;
    while (next.progress >= 1 && next.path.length > 0) {
      const reached = next.path.shift();
      if (reached) {
        next.tile = reached;
      }
      next.progress -= 1;
    }
    if (next.path.length === 0) {
      next.progress = 0;
    }
  }

  if (next.path.length === 0 && next.goingInside && next.visible) {
    if (reducedMotion) {
      next.alpha = 0;
      next.visible = false;
    } else {
      next.fade = 'out';
    }
  }
  return next;
}

/**
 * Where to draw them, in tiles (fractional mid-step). Reduced motion
 * (spec section 14) moves them tile by tile instead of gliding.
 */
export function walkerPosition(state: WalkerState, reducedMotion = false): Tile {
  const ahead = state.path[0];
  if (!ahead || reducedMotion || state.progress === 0) {
    return { ...state.tile };
  }
  return {
    x: state.tile.x + (ahead.x - state.tile.x) * state.progress,
    y: state.tile.y + (ahead.y - state.tile.y) * state.progress,
  };
}
