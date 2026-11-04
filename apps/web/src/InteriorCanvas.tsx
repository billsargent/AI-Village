import { INTERIOR_FLOOR_COLOR, type BuildingId, type FurnitureKind } from '@ai-village/content';
import { Application, Sprite } from 'pixi.js';
import { useEffect, useMemo, useRef } from 'react';
import { planInteriorDraw, type InteriorDrawPlan } from './interior-draw.js';
import { loadFrameTexture } from './load-frame-texture.js';

/** Integer scaling only, no smoothing (spec section 10), matching the outdoor view. */
const ZOOM = 3;

export interface InteriorCanvasProps {
  buildingId: BuildingId;
  /**
   * Which furniture kinds actually do something when clicked (spec
   * section 9: each piece of furniture opens one real feature). Only
   * these get a pointer cursor and a click handler - every other piece
   * stays inert rather than offering a false affordance.
   */
  interactiveKinds?: ReadonlySet<FurnitureKind> | undefined;
  onFurnitureClick?: ((kind: FurnitureKind) => void) | undefined;
}

/**
 * One building's furnished interior (spec section 10's picked furniture
 * sprites), drawn with PixiJS - a small fixed-camera scene fit to
 * whatever's placed there. No villagers are drawn inside: there's no
 * assigned-home data yet (spec section 8's aside), so this never
 * guesses who's "home".
 */
export function InteriorCanvas({
  buildingId,
  interactiveKinds,
  onFurnitureClick,
}: InteriorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plan = useMemo(() => planInteriorDraw(buildingId), [buildingId]);

  // Refs, not effect dependencies: a new inline callback/Set identity on
  // every parent render shouldn't tear down and rebuild the whole PixiJS
  // app, just change what a click does.
  const interactiveKindsRef = useRef(interactiveKinds);
  interactiveKindsRef.current = interactiveKinds;
  const onFurnitureClickRef = useRef(onFurnitureClick);
  onFurnitureClickRef.current = onFurnitureClick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !plan) {
      return;
    }

    // An object, not a plain `let`, so TS doesn't narrow reads of it to a
    // literal `false` after the first check - it's reassigned from the
    // cleanup closure below, which TS's control-flow analysis can't see
    // from inside `setup()`.
    const cancelled = { current: false };
    let app: Application | undefined;

    async function setup(plan: InteriorDrawPlan) {
      const nextApp = new Application();
      try {
        await nextApp.init({
          width: plan.width * ZOOM,
          height: plan.height * ZOOM,
          background: INTERIOR_FLOOR_COLOR,
          antialias: false,
        });
      } catch (error) {
        // No WebGL/Canvas2D context available (a locked-down browser, or
        // this component rendering in a test environment without one).
        console.error('InteriorCanvas: could not initialize the renderer', error);
        return;
      }
      if (cancelled.current || !container) {
        nextApp.destroy(true);
        return;
      }
      app = nextApp;
      app.canvas.style.imageRendering = 'pixelated';
      container.appendChild(app.canvas);
      app.stage.scale.set(ZOOM);

      for (const item of plan.furniture) {
        const texture = await loadFrameTexture(item.sprite);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled.current is set by the effect's cleanup closure, below, which this rule can't see across an await
        if (cancelled.current) {
          return;
        }
        const sprite = new Sprite({ texture, x: item.x, y: item.y });
        const kind = item.kind;
        if (kind && interactiveKindsRef.current?.has(kind)) {
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          sprite.on('pointertap', () => {
            onFurnitureClickRef.current?.(kind);
          });
        }
        app.stage.addChild(sprite);
      }
    }

    void setup(plan);

    return () => {
      cancelled.current = true;
      app?.destroy(true);
    };
  }, [buildingId, plan]);

  if (!plan) {
    return null;
  }

  return <div ref={containerRef} data-testid="interior-canvas" />;
}
