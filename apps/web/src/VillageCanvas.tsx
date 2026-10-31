import { GRASS_TILE, type SpriteFrame } from '@ai-village/content';
import { Application, Assets, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { VillageFacts } from './village-api.js';
import { planCanvasDraw } from './village-draw.js';

/** Integer scaling only, no smoothing (spec section 10). */
const ZOOM = 3;

async function loadFrameTexture(frame: SpriteFrame): Promise<Texture> {
  const base = await Assets.load<Texture>({
    src: `/${frame.file}`,
    data: { scaleMode: 'nearest' },
  });
  return new Texture({
    source: base.source,
    frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
  });
}

/**
 * The village, drawn with PixiJS from the real vendored art (spec
 * section 10) at the real plot positions (spec section 8) - a single
 * fixed-camera view that fits whatever's currently built and staffed,
 * not yet a scrollable Tiled map (later work, once one exists).
 */
export function VillageCanvas({ data }: { data: VillageFacts }) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    let app: Application | undefined;

    async function setup() {
      const plan = planCanvasDraw(data);

      const nextApp = new Application();
      try {
        await nextApp.init({
          width: plan.width * ZOOM,
          height: plan.height * ZOOM,
          background: '#5b8a3a',
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
      app.canvas.style.imageRendering = 'pixelated';
      container.appendChild(app.canvas);
      app.stage.scale.set(ZOOM);

      const grassTexture = await loadFrameTexture(GRASS_TILE);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled.current is set by the effect's cleanup closure, below, which this rule can't see across an await
      if (cancelled.current) {
        return;
      }
      const grass = new TilingSprite({
        texture: grassTexture,
        width: plan.width,
        height: plan.height,
      });
      app.stage.addChild(grass);

      for (const building of plan.buildings) {
        const texture = await loadFrameTexture(building.sprite);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
        if (cancelled.current) {
          return;
        }
        const sprite = new Sprite({ texture, x: building.x, y: building.y });
        app.stage.addChild(sprite);
      }

      for (const villager of plan.villagers) {
        const texture = await loadFrameTexture(villager.sprite);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
        if (cancelled.current) {
          return;
        }
        const sprite = new Sprite({ texture, x: villager.x, y: villager.y });
        app.stage.addChild(sprite);
      }
    }

    void setup();

    return () => {
      cancelled.current = true;
      app?.destroy(true);
    };
  }, [data]);

  return <div ref={containerRef} data-testid="village-canvas" />;
}
