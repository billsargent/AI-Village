import { GRASS_TILE, TILE_PX, walkGrid, type MapId } from '@ai-village/content';
import { Application, Container, Sprite, TilingSprite } from 'pixi.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadFrameTexture } from './load-frame-texture.js';
import type { VillageFacts } from './village-api.js';
import { planCanvasDraw, villagersOnMap } from './village-draw.js';
import {
  placeWalker,
  retargetWalker,
  stepWalker,
  walkerPosition,
  type WalkerState,
} from './walkers.js';

/** Whole steps only, no smoothing (spec sections 8 and 10: "zooms in whole steps (2x, 3x, 4x)"). */
const ZOOMS = [2, 3, 4] as const;
const DEFAULT_ZOOM_INDEX = 1;
/** How far one arrow/WASD press pans, in map pixels. */
const PAN_STEP = 32;
/** A pointer that moves further than this between down and up was a drag, not a click. */
const DRAG_THRESHOLD = 5;

interface Camera {
  /** The map pixel at the centre of the screen. */
  x: number;
  y: number;
  zoomIndex: number;
}

/**
 * Where each map's camera was left, kept outside the component so a data
 * refresh, or switching maps and back, doesn't snap the view back home.
 */
const cameras = new Map<MapId, Camera>();

/** Where each map's camera starts: the main map opens between Civic Row and the green. */
function homeCamera(map: MapId, width: number, height: number): Camera {
  if (map === 'main') {
    return { x: 35 * 16, y: 12 * 16, zoomIndex: DEFAULT_ZOOM_INDEX };
  }
  return { x: width / 2, y: height / 2, zoomIndex: DEFAULT_ZOOM_INDEX };
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

function titleCase(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface VillageCanvasProps {
  data: VillageFacts;
  map?: MapId;
  /** Buildings that open something when clicked - only these get a pointer cursor. */
  clickableBuildingIds?: ReadonlySet<string> | undefined;
  onBuildingClick?: ((buildingId: string) => void) | undefined;
  /** Clicking a villager - the app opens a chat with them. */
  onVillagerClick?: ((villagerId: string) => void) | undefined;
}

/** One villager's sprite on the map, and where their walk has got to. */
interface Walker {
  sprite: Sprite;
  state: WalkerState;
  /** Read by the sprite's hover handler, so it always shows the latest. */
  where: string;
}

/** What the pointer is over, for the label under the map. */
type Hovered = { kind: 'building'; id: string } | { kind: 'villager'; id: string; where: string };

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** A live scene for one map: the renderer, and the two layers the village's contents are drawn into. */
interface Scene {
  /** Flowers and daisies, flat on the grass under everything that stands. */
  flatHost: Container;
  /** Buildings, villagers, trees and rocks, depth-sorted by `zIndex` (their bottom edge). */
  objectsHost: Container;
  /** The standing things in `objectsHost` that aren't villagers - swapped out together. */
  statics: Sprite[];
  /** Every villager on this map, by id; they stay put across rebuilds so they can walk. */
  walkers: Map<string, Walker>;
  /** Whether the pointer is mid-drag, so a drag ending on a building isn't taken as a click. */
  isDragging: () => boolean;
}

/**
 * What's standing on the map, as a string: when it hasn't changed, the
 * objects layer isn't rebuilt - so the clock ticking every village minute
 * doesn't redraw the village.
 */
function contentsKey(data: VillageFacts, map: MapId): string {
  return `${map}|${data.builtBuildingIds.join(',')}`;
}

/** Who's where on the map, as a string: villagers only set off when it changes. */
function villagersKey(data: VillageFacts, map: MapId): string {
  const villagers = data.villagers.map((v) => `${v.id}:${v.tradeId}`).join(',');
  return `${contentsKey(data, map)}|${data.phase}|${villagers}`;
}

/**
 * One whole map (main, Riverside or Forest - spec section 8), drawn with
 * PixiJS from the real vendored art: grass, roads and water, the
 * scattered trees and flowers, every built building and whoever's at
 * work. The camera pans (drag, arrow keys or WASD) and zooms in whole
 * steps (the buttons, + and -, or the mouse wheel).
 *
 * The renderer, camera and ground are set up once per map; what stands on
 * the map is a separate layer, rebuilt only when it changes. Standing
 * sprites sort by `zIndex`, so anything that later moves (villagers
 * walking) only has to update its position and `zIndex`.
 */
export function VillageCanvas({
  data,
  map = 'main',
  clickableBuildingIds,
  onBuildingClick,
  onVillagerClick,
}: VillageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomByRef = useRef<((step: number) => void) | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  // Refs, not effect dependencies: a new Set or callback identity on every
  // parent render shouldn't tear down and rebuild the whole scene.
  const clickableRef = useRef(clickableBuildingIds);
  clickableRef.current = clickableBuildingIds;
  const onClickRef = useRef(onBuildingClick);
  onClickRef.current = onBuildingClick;
  const onVillagerClickRef = useRef(onVillagerClick);
  onVillagerClickRef.current = onVillagerClick;
  const dataRef = useRef(data);
  dataRef.current = data;

  const key = contentsKey(data, map);
  // Re-planned only when what's standing on the map changes, not on every
  // fresh copy of the facts.
  const plan = useMemo(() => planCanvasDraw(dataRef.current, map), [key, map]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const whoKey = villagersKey(data, map);
  const placements = useMemo(() => villagersOnMap(dataRef.current, map), [whoKey, map]);
  const grid = useMemo(() => walkGrid(map, dataRef.current.builtBuildingIds), [key, map]);

  // The renderer, camera, input and ground: once per map.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // An object, not a plain `let`, so TS doesn't narrow reads of it to a
    // literal `false` after the first check - it's reassigned from the
    // cleanup closure below, which TS's control-flow analysis can't see
    // from inside `setup()`.
    const cancelled = { current: false };
    const cleanups: (() => void)[] = [];
    let app: Application | undefined;

    async function setup() {
      const { width, height, ground } = planRef.current;

      const nextApp = new Application();
      try {
        await nextApp.init({
          resizeTo: container ?? window,
          background: '#2f4f2f',
          antialias: false,
        });
      } catch (error) {
        // No WebGL/Canvas2D context available (a locked-down browser, or
        // this component rendering in a test environment without one).
        console.error('VillageCanvas: could not initialize the renderer', error);
        return;
      }
      if (cancelled.current || !container) {
        nextApp.destroy(true);
        return;
      }
      app = nextApp;
      const canvas = app.canvas;
      canvas.style.imageRendering = 'pixelated';
      canvas.style.display = 'block';
      canvas.style.touchAction = 'none';
      container.prepend(canvas);

      const world = new Container();
      app.stage.addChild(world);

      const camera = cameras.get(map) ?? homeCamera(map, width, height);
      cameras.set(map, camera);

      const applyCamera = () => {
        if (!app) {
          return;
        }
        const zoom = ZOOMS[camera.zoomIndex] ?? 3;
        const viewW = app.screen.width / zoom;
        const viewH = app.screen.height / zoom;
        camera.x =
          width <= viewW ? width / 2 : Math.min(Math.max(camera.x, viewW / 2), width - viewW / 2);
        camera.y =
          height <= viewH
            ? height / 2
            : Math.min(Math.max(camera.y, viewH / 2), height - viewH / 2);
        world.scale.set(zoom);
        // Whole screen pixels only, so pixel art never shimmers between them.
        world.position.set(
          Math.round(app.screen.width / 2 - camera.x * zoom),
          Math.round(app.screen.height / 2 - camera.y * zoom),
        );
      };
      applyCamera();
      app.renderer.on('resize', applyCamera);

      zoomByRef.current = (step: number) => {
        camera.zoomIndex = Math.min(Math.max(camera.zoomIndex + step, 0), ZOOMS.length - 1);
        applyCamera();
      };

      // Drag to pan. A small wobble still counts as a click.
      let drag: { startX: number; startY: number; camX: number; camY: number } | null = null;
      let dragged = false;
      const onPointerDown = (event: PointerEvent) => {
        drag = { startX: event.clientX, startY: event.clientY, camX: camera.x, camY: camera.y };
        dragged = false;
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!drag) {
          return;
        }
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
          return;
        }
        dragged = true;
        canvas.style.cursor = 'grabbing';
        const zoom = ZOOMS[camera.zoomIndex] ?? 3;
        camera.x = drag.camX - dx / zoom;
        camera.y = drag.camY - dy / zoom;
        applyCamera();
      };
      const onPointerUp = () => {
        drag = null;
        canvas.style.cursor = '';
      };
      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        zoomByRef.current?.(event.deltaY < 0 ? 1 : -1);
      };
      canvas.addEventListener('wheel', onWheel, { passive: false });

      const onKeyDown = (event: KeyboardEvent) => {
        if (isTyping(event.target)) {
          return;
        }
        const pans: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          a: [-1, 0],
          d: [1, 0],
          w: [0, -1],
          s: [0, 1],
        };
        const pan = pans[event.key.length === 1 ? event.key.toLowerCase() : event.key];
        if (pan) {
          event.preventDefault();
          camera.x += pan[0] * PAN_STEP;
          camera.y += pan[1] * PAN_STEP;
          applyCamera();
        } else if (event.key === '+' || event.key === '=') {
          zoomByRef.current?.(1);
        } else if (event.key === '-' || event.key === '_') {
          zoomByRef.current?.(-1);
        }
      };
      window.addEventListener('keydown', onKeyDown);

      cleanups.push(() => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('wheel', onWheel);
        window.removeEventListener('keydown', onKeyDown);
      });

      const grass = new TilingSprite({
        texture: await loadFrameTexture(GRASS_TILE),
        width,
        height,
      });
      const groundLayer = new Container();
      for (const item of ground) {
        groundLayer.addChild(
          new Sprite({ texture: await loadFrameTexture(item.sprite), x: item.x, y: item.y }),
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled.current is set by the effect's cleanup closure, below, which this rule can't see across an await
      if (cancelled.current) {
        return;
      }
      const flatHost = new Container();
      const objectsHost = new Container({ sortableChildren: true });
      world.addChild(grass, groundLayer, flatHost, objectsHost);
      const walkers = new Map<string, Walker>();

      // Each frame: every villager takes their next step, or fades at a door.
      const reducedMotion = prefersReducedMotion();
      app.ticker.add((ticker) => {
        for (const walker of walkers.values()) {
          walker.state = stepWalker(walker.state, ticker.deltaMS, reducedMotion);
          const at = walkerPosition(walker.state, reducedMotion);
          walker.sprite.position.set(Math.round(at.x * TILE_PX), Math.round(at.y * TILE_PX));
          walker.sprite.zIndex = walker.sprite.y + walker.sprite.height;
          walker.sprite.alpha = walker.state.alpha;
          walker.sprite.visible = walker.state.visible;
        }
      });

      setScene({ flatHost, objectsHost, statics: [], walkers, isDragging: () => dragged });
    }

    void setup();

    return () => {
      cancelled.current = true;
      zoomByRef.current = null;
      setScene(null);
      for (const cleanup of cleanups) {
        cleanup();
      }
      app?.destroy(true);
    };
  }, [map]);

  // What stands on the map: rebuilt off-screen when it changes, then swapped in.
  useEffect(() => {
    if (!scene) {
      return;
    }
    const cancelled = { current: false };

    async function populate(current: Scene) {
      const flat = new Container();
      for (const item of plan.groundDecor) {
        flat.addChild(
          new Sprite({ texture: await loadFrameTexture(item.sprite), x: item.x, y: item.y }),
        );
      }

      const objects: Sprite[] = [];
      for (const item of plan.standing) {
        const sprite = new Sprite({
          texture: await loadFrameTexture(item.sprite),
          x: item.x,
          y: item.y,
          zIndex: item.y + item.sprite.height,
        });
        if (item.kind === 'building') {
          const { buildingId } = item;
          sprite.eventMode = 'static';
          sprite.on('pointerover', () => {
            setHovered({ kind: 'building', id: buildingId });
            if (clickableRef.current?.has(buildingId)) {
              sprite.cursor = 'pointer';
            }
          });
          sprite.on('pointerout', () => {
            setHovered((now) => (now?.id === buildingId ? null : now));
          });
          sprite.on('pointertap', () => {
            if (!current.isDragging() && clickableRef.current?.has(buildingId)) {
              onClickRef.current?.(buildingId);
            }
          });
        }
        objects.push(sprite);
      }

      if (cancelled.current) {
        flat.destroy({ children: true });
        for (const sprite of objects) {
          sprite.destroy();
        }
        return;
      }
      for (const old of current.flatHost.removeChildren()) {
        old.destroy({ children: true });
      }
      for (const old of current.statics) {
        current.objectsHost.removeChild(old);
        old.destroy();
      }
      current.flatHost.addChild(flat);
      if (objects.length > 0) {
        current.objectsHost.addChild(...objects);
      }
      current.statics = objects;
    }

    void populate(scene);

    return () => {
      cancelled.current = true;
    };
  }, [scene, plan]);

  // Villagers: new ones appear where they belong; everyone else sets off
  // for their new spot, through doors and along the roads.
  useEffect(() => {
    if (!scene) {
      return;
    }
    const cancelled = { current: false };
    const reducedMotion = prefersReducedMotion();

    async function update(current: Scene) {
      const seen = new Set<string>();
      for (const placement of placements) {
        const id = placement.villager.id;
        seen.add(id);
        const target = { x: placement.x, y: placement.y, hidden: placement.hidden };
        const existing = current.walkers.get(id);
        if (existing) {
          existing.state = retargetWalker(existing.state, target, grid, reducedMotion);
          existing.where = placement.where;
          continue;
        }
        const texture = await loadFrameTexture(placement.sprite);
        // Set by the cleanup below, across the await.
        if (cancelled.current) {
          return;
        }
        const state = placeWalker(target);
        const sprite = new Sprite({
          texture,
          x: state.tile.x * TILE_PX,
          y: state.tile.y * TILE_PX,
          alpha: state.alpha,
          visible: state.visible,
        });
        sprite.zIndex = sprite.y + sprite.height;
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';
        const walker: Walker = { sprite, state, where: placement.where };
        sprite.on('pointerover', () => {
          setHovered({ kind: 'villager', id, where: walker.where });
        });
        sprite.on('pointerout', () => {
          setHovered((now) => (now?.id === id ? null : now));
        });
        sprite.on('pointertap', () => {
          if (!current.isDragging()) {
            onVillagerClickRef.current?.(id);
          }
        });
        current.objectsHost.addChild(sprite);
        current.walkers.set(id, walker);
      }
      for (const [id, walker] of current.walkers) {
        if (!seen.has(id)) {
          current.objectsHost.removeChild(walker.sprite);
          walker.sprite.destroy();
          current.walkers.delete(id);
        }
      }
    }

    void update(scene);
    return () => {
      cancelled.current = true;
    };
  }, [scene, placements, grid]);

  return (
    <div
      ref={containerRef}
      data-testid="village-canvas"
      className="relative h-full w-full overflow-hidden"
    >
      {hovered && (
        <div className="wood-panel pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 px-1 text-lg whitespace-nowrap">
          {hovered.kind === 'building'
            ? `${titleCase(hovered.id)}${clickableBuildingIds?.has(hovered.id) ? ' - click to go inside' : ''}`
            : `${titleCase(hovered.id)}, ${hovered.where} - click to chat`}
        </div>
      )}
      <div className="absolute right-3 bottom-3 z-10 flex gap-1">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => {
            zoomByRef.current?.(-1);
          }}
          className="wood-button w-10 text-xl"
        >
          -
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => {
            zoomByRef.current?.(1);
          }}
          className="wood-button w-10 text-xl"
        >
          +
        </button>
      </div>
    </div>
  );
}
