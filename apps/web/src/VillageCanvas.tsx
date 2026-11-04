import { GRASS_TILE, type MapId } from '@ai-village/content';
import { Application, Container, Sprite, TilingSprite } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { loadFrameTexture } from './load-frame-texture.js';
import type { VillageFacts } from './village-api.js';
import { planCanvasDraw } from './village-draw.js';

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
}

/**
 * One whole map (main, Riverside or Forest - spec section 8), drawn with
 * PixiJS from the real vendored art: grass, roads and water, the
 * scattered trees and flowers, every built building and whoever's at
 * work. The camera pans (drag, arrow keys or WASD) and zooms in whole
 * steps (the buttons, + and -, or the mouse wheel).
 */
export function VillageCanvas({
  data,
  map = 'main',
  clickableBuildingIds,
  onBuildingClick,
}: VillageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomByRef = useRef<((step: number) => void) | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Refs, not effect dependencies: a new Set or callback identity on every
  // parent render shouldn't tear down and rebuild the whole scene.
  const clickableRef = useRef(clickableBuildingIds);
  clickableRef.current = clickableBuildingIds;
  const onClickRef = useRef(onBuildingClick);
  onClickRef.current = onBuildingClick;

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
      const plan = planCanvasDraw(data, map);

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

      const camera = cameras.get(map) ?? homeCamera(map, plan.width, plan.height);
      cameras.set(map, camera);

      const applyCamera = () => {
        if (!app) {
          return;
        }
        const zoom = ZOOMS[camera.zoomIndex] ?? 3;
        const viewW = app.screen.width / zoom;
        const viewH = app.screen.height / zoom;
        camera.x =
          plan.width <= viewW
            ? plan.width / 2
            : Math.min(Math.max(camera.x, viewW / 2), plan.width - viewW / 2);
        camera.y =
          plan.height <= viewH
            ? plan.height / 2
            : Math.min(Math.max(camera.y, viewH / 2), plan.height - viewH / 2);
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
        width: plan.width,
        height: plan.height,
      });
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled.current is set by the effect's cleanup closure, below, which this rule can't see across an await
      if (cancelled.current) {
        return;
      }
      world.addChild(grass);

      const flat = new Container();
      for (const item of [...plan.ground, ...plan.groundDecor]) {
        flat.addChild(
          new Sprite({ texture: await loadFrameTexture(item.sprite), x: item.x, y: item.y }),
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
      if (cancelled.current) {
        return;
      }
      world.addChild(flat);

      for (const item of plan.standing) {
        const texture = await loadFrameTexture(item.sprite);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
        if (cancelled.current) {
          return;
        }
        const sprite = new Sprite({ texture, x: item.x, y: item.y });
        if (item.kind === 'building') {
          const { buildingId } = item;
          sprite.eventMode = 'static';
          sprite.on('pointerover', () => {
            setHovered(buildingId);
            if (clickableRef.current?.has(buildingId)) {
              sprite.cursor = 'pointer';
            }
          });
          sprite.on('pointerout', () => {
            setHovered((current) => (current === buildingId ? null : current));
          });
          sprite.on('pointertap', () => {
            if (!dragged && clickableRef.current?.has(buildingId)) {
              onClickRef.current?.(buildingId);
            }
          });
        }
        world.addChild(sprite);
      }
    }

    void setup();

    return () => {
      cancelled.current = true;
      zoomByRef.current = null;
      for (const cleanup of cleanups) {
        cleanup();
      }
      app?.destroy(true);
    };
  }, [data, map]);

  return (
    <div
      ref={containerRef}
      data-testid="village-canvas"
      className="relative h-full w-full overflow-hidden"
    >
      {hovered && (
        <div className="wood-panel pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 px-1 text-lg whitespace-nowrap">
          {titleCase(hovered)}
          {clickableBuildingIds?.has(hovered) ? ' - click to go inside' : ''}
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
