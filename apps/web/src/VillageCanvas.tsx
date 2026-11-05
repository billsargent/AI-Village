import {
  BACK_WALL,
  CAT_FRAMES,
  catSpot,
  FLOORBOARDS,
  getBuilding,
  GRASS_TILE,
  isBloom,
  isFoliage,
  TILE_PX,
  WALL_TOP_COLOR,
  walkGrid,
  type BuildingId,
  type FurnitureKind,
  type MapId,
  type SpriteFrame,
} from '@ai-village/content';
import {
  Application,
  ColorMatrixFilter,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  dimmed,
  glowsFor,
  glowStrength,
  particlesNow,
  seasonLook,
  weatherLook,
  type ColourMatrix,
} from './atmosphere.js';
import { AtmosphereLayer, type AtmosphereState } from './atmosphere-layer.js';
import { indoorLightAt, lightAt, lightWord } from './light.js';
import { buildingSummary, whoIsIn } from './building-card.js';
import { loadFrameTexture } from './load-frame-texture.js';
import { Minimap, type MinimapView } from './Minimap.js';
import { clampZoom, DEFAULT_ZOOM, stepZoom, zoomLevels } from './zoom.js';
import type { VillageFacts } from './village-api.js';
import { planInteriorDraw, roomZoom } from './interior-draw.js';
import { planCanvasDraw, villagersInside, villagersOnMap } from './village-draw.js';
import {
  placeWalker,
  retargetWalker,
  stepWalker,
  walkerPosition,
  type WalkerState,
} from './walkers.js';

/** Behind the map, and round a room: the dark beyond its walls. */
const MAP_BACKGROUND = '#2f4f2f';
const ROOM_SURROUND = '#16100b';

/** How far one arrow/WASD press pans, in map pixels. */
const PAN_STEP = 32;
/** A pointer that moves further than this between down and up was a drag, not a click. */
const DRAG_THRESHOLD = 5;

interface Camera {
  /** The map pixel at the centre of the screen. */
  x: number;
  y: number;
  /** One of `zoomLevels`: a whole step, or the whole-map fit. */
  zoom: number;
}

/**
 * Where each map's camera was left, kept outside the component so a data
 * refresh, or switching maps and back, doesn't snap the view back home.
 */
const cameras = new Map<MapId, Camera>();

/** Where each map's camera starts: the main map opens between Civic Row and the green. */
function homeCamera(map: MapId, width: number, height: number): Camera {
  if (map === 'main') {
    return { x: 35 * 16, y: 12 * 16, zoom: DEFAULT_ZOOM };
  }
  return { x: width / 2, y: height / 2, zoom: DEFAULT_ZOOM };
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

/** A room the owner has gone into: one building, or one copy of it (`slot`) when there are several. */
export interface RoomView {
  buildingId: BuildingId;
  slot?: number | undefined;
}

export interface VillageCanvasProps {
  data: VillageFacts;
  map?: MapId;
  /** Clicking a building - the app opens its card. */
  onBuildingClick?: ((buildingId: string, slot: number) => void) | undefined;
  /**
   * The room the owner is inside, drawn full-screen in place of the map
   * by this same renderer (one renderer per page: a second PixiJS
   * Application, destroyed on the way out, broke the map's own drawing).
   */
  room?: RoomView | null | undefined;
  /** Furniture in the room that does something when clicked. Everything else stays inert. */
  interactiveKinds?: ReadonlySet<FurnitureKind> | undefined;
  onFurnitureClick?: ((kind: FurnitureKind) => void) | undefined;
  /** How fast villagers walk against real time: 0 while the clock is paused (see `walkPace`). */
  pace?: number | undefined;
  /** Clicking a villager - the app opens their card. */
  onVillagerClick?: ((villagerId: string) => void) | undefined;
  /** A villager for the camera to follow as they walk (spec section 14's Follow button). */
  follow?: string | null | undefined;
  /** The owner took the camera back - dragged, panned or used the minimap - so following ends. */
  onStopFollowing?: (() => void) | undefined;
}

/** Something that walks the map: a villager, or the cat. */
interface Mover {
  id: string;
  kind: 'villager' | 'cat';
  sprite: SpriteFrame;
  /** Tile coordinates. */
  x: number;
  y: number;
  hidden: boolean;
  where: string;
}

/** The cat stands as a villager would on its tile, its wider sprite centred. */
const CAT_OFFSET = { x: -3, y: -1 };
/** How long each of the cat's two idle frames shows. */
const CAT_FRAME_MS = 900;

/** One villager's sprite on the map, and where their walk has got to. */
interface Walker {
  kind: 'villager' | 'cat';
  sprite: Sprite;
  state: WalkerState;
  /** For the cat: its idle frames, swapped in turn. */
  frames?: readonly Texture[];
  /** Read by the sprite's hover handler, so it always shows the latest. */
  where: string;
}

/** What the pointer is over, for the label under the map. */
type Hovered =
  | { kind: 'building'; id: string; slot: number }
  | { kind: 'cat'; id: 'cat'; where: string }
  | { kind: 'villager'; id: string; where: string }
  | { kind: 'furniture'; id: FurnitureKind };

function matrixFilter(matrix: ColourMatrix): ColorMatrixFilter {
  const filter = new ColorMatrixFilter();
  filter.matrix = [...matrix] as ColorMatrixFilter['matrix'];
  return filter;
}

/**
 * A texture redrawn through a season's palette swap, made once per
 * texture and season and kept, so autumn's trees cost no more to draw
 * than summer's.
 */
function recoloured(
  app: Application,
  cache: Map<string, Texture>,
  texture: Texture,
  matrix: ColourMatrix,
  season: string,
): Texture {
  const key = `${season}:${texture.uid}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const sprite = new Sprite({ texture });
  sprite.filters = [matrixFilter(matrix)];
  const made = app.renderer.generateTexture({
    target: sprite,
    frame: new Rectangle(0, 0, texture.width, texture.height),
    textureSourceOptions: { scaleMode: 'nearest' },
  });
  sprite.destroy();
  cache.set(key, made);
  return made;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** A live scene for one map: the renderer, and the two layers the village's contents are drawn into. */
interface Scene {
  app: Application;
  /** The grass, roads and flat decor: what winter's snow covers. */
  groundGroup: Container;
  /** Season-recoloured copies of tree and bush textures, by season and texture. */
  recoloured: Map<string, Texture>;
  /** Weather, fog, the hour's tint and the night's lights, over everything. */
  atmosphere: AtmosphereLayer;
  /** The map, hidden while a room is shown. */
  world: Container;
  /** The room, when there is one, drawn over the dark instead of the map. */
  roomHost: Container;
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
  onBuildingClick,
  onVillagerClick,
  room = null,
  interactiveKinds,
  onFurnitureClick,
  pace = 1,
  follow = null,
  onStopFollowing,
}: VillageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomByRef = useRef<((step: number) => void) | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  // Refs, not effect dependencies: a new callback identity on every
  // parent render shouldn't tear down and rebuild the whole scene.
  const followRef = useRef(follow);
  followRef.current = follow;
  const onStopFollowingRef = useRef(onStopFollowing);
  onStopFollowingRef.current = onStopFollowing;
  // Set up with the renderer: what's on screen, and a way to look somewhere else.
  const viewRef = useRef<MinimapView | null>(null);
  const jumpRef = useRef<((x: number, y: number) => void) | null>(null);
  const onClickRef = useRef(onBuildingClick);
  onClickRef.current = onBuildingClick;
  const onVillagerClickRef = useRef(onVillagerClick);
  onVillagerClickRef.current = onVillagerClick;
  const dataRef = useRef(data);
  dataRef.current = data;
  const interactiveKindsRef = useRef(interactiveKinds);
  interactiveKindsRef.current = interactiveKinds;
  const onFurnitureClickRef = useRef(onFurnitureClick);
  onFurnitureClickRef.current = onFurnitureClick;
  // Read by the map's own input handlers: no panning or zooming the map from inside a room.
  const inside = room !== null;
  const insideRef = useRef(inside);
  insideRef.current = inside;
  const paceRef = useRef(pace);
  paceRef.current = pace;

  // The light, the season and the weather, read by the renderer every frame.
  const season = useMemo(() => seasonLook(data.season), [data.season]);
  const weather = weatherLook(data.weather);
  const light = inside
    ? indoorLightAt(data.hour, data.minuteOfHour)
    : dimmed(lightAt(data.hour, data.minuteOfHour), weather.dim);
  const atmosphereRef = useRef<Omit<AtmosphereState, 'zoom' | 'reducedMotion'>>({
    light,
    glow: 0,
    particles: 'none',
    count: 0,
    wind: 0,
    fog: 0,
    inside,
  });
  atmosphereRef.current = {
    light,
    glow: glowStrength(data.hour, data.minuteOfHour),
    particles: particlesNow(season, weather),
    count: weather.count,
    wind: weather.wind,
    fog: weather.fog,
    inside,
  };

  const key = contentsKey(data, map);
  // Re-planned only when what's standing on the map changes, not on every
  // fresh copy of the facts.
  const plan = useMemo(() => planCanvasDraw(dataRef.current, map), [key, map]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const whoKey = villagersKey(data, map);
  const catKey = `${data.year}-${data.season}-${data.seasonDay}|${data.hour}`;
  const movers = useMemo((): readonly Mover[] => {
    const current = dataRef.current;
    const villagers: Mover[] = villagersOnMap(current, map).map((placement) => ({
      id: placement.villager.id,
      kind: 'villager',
      sprite: placement.sprite,
      x: placement.x,
      y: placement.y,
      hidden: placement.hidden,
      where: placement.where,
    }));
    if (map !== 'main') {
      return villagers;
    }
    const cat = catSpot(
      `${current.year}-${current.season}-${current.seasonDay}`,
      current.hour,
      current.builtBuildingIds,
    );
    const catFrame = CAT_FRAMES[0];
    return catFrame
      ? [
          ...villagers,
          {
            id: 'cat',
            kind: 'cat',
            sprite: catFrame,
            x: cat.x,
            y: cat.y,
            hidden: false,
            where: cat.where,
          },
        ]
      : villagers;
  }, [whoKey, catKey, map]);
  const grid = useMemo(() => walkGrid(map, dataRef.current.builtBuildingIds), [key, map]);
  const roomBuildingId = room?.buildingId ?? null;
  const roomSlot = room?.slot;
  const occupants = useMemo(
    () => (roomBuildingId ? villagersInside(dataRef.current, roomBuildingId, roomSlot) : []),
    [whoKey, roomBuildingId, roomSlot],
  );

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
          background: MAP_BACKGROUND,
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
        const levels = zoomLevels(app.screen.width, app.screen.height, width, height);
        // Zoomed right out, stay fitted to the whole map as the window changes size.
        if (camera.zoom < 1) {
          camera.zoom = levels[0] ?? 1;
        }
        camera.zoom = clampZoom(levels, camera.zoom);
        const zoom = camera.zoom;
        const viewW = app.screen.width / zoom;
        const viewH = app.screen.height / zoom;
        camera.x =
          width <= viewW ? width / 2 : Math.min(Math.max(camera.x, viewW / 2), width - viewW / 2);
        camera.y =
          height <= viewH
            ? height / 2
            : Math.min(Math.max(camera.y, viewH / 2), height - viewH / 2);
        world.scale.set(zoom);
        viewRef.current = {
          x: camera.x - viewW / 2,
          y: camera.y - viewH / 2,
          width: viewW,
          height: viewH,
        };
        // Whole screen pixels only, so pixel art never shimmers between them.
        world.position.set(
          Math.round(app.screen.width / 2 - camera.x * zoom),
          Math.round(app.screen.height / 2 - camera.y * zoom),
        );
      };
      applyCamera();
      app.renderer.on('resize', applyCamera);

      const takeCameraBack = () => {
        if (followRef.current) {
          onStopFollowingRef.current?.();
        }
      };
      jumpRef.current = (x: number, y: number) => {
        takeCameraBack();
        camera.x = x;
        camera.y = y;
        applyCamera();
      };

      zoomByRef.current = (step: number) => {
        if (!app) {
          return;
        }
        camera.zoom = stepZoom(
          zoomLevels(app.screen.width, app.screen.height, width, height),
          camera.zoom,
          step,
        );
        applyCamera();
      };

      // Drag to pan. A small wobble still counts as a click.
      let drag: { startX: number; startY: number; camX: number; camY: number } | null = null;
      let dragged = false;
      const onPointerDown = (event: PointerEvent) => {
        if (insideRef.current) {
          return;
        }
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
        if (!dragged) {
          takeCameraBack();
        }
        dragged = true;
        canvas.style.cursor = 'grabbing';
        const zoom = camera.zoom;
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
        if (insideRef.current) {
          return;
        }
        zoomByRef.current?.(event.deltaY < 0 ? 1 : -1);
      };
      canvas.addEventListener('wheel', onWheel, { passive: false });

      const onKeyDown = (event: KeyboardEvent) => {
        if (isTyping(event.target) || insideRef.current) {
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
          takeCameraBack();
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
      const groundGroup = new Container();
      groundGroup.addChild(grass, groundLayer, flatHost);
      world.addChild(groundGroup, objectsHost);
      const roomHost = new Container();
      const atmosphere = new AtmosphereLayer(app);
      app.stage.addChild(
        atmosphere.weather,
        atmosphere.fog,
        roomHost,
        atmosphere.tint,
        atmosphere.glows,
      );
      const fitAtmosphere = () => {
        atmosphere.fitScreen();
      };
      app.renderer.on('resize', fitAtmosphere);
      cleanups.push(() => {
        app?.renderer.off('resize', fitAtmosphere);
        atmosphere.destroy();
      });
      const walkers = new Map<string, Walker>();
      const recolouredTextures = new Map<string, Texture>();
      cleanups.push(() => {
        for (const texture of recolouredTextures.values()) {
          texture.destroy(true);
        }
      });

      // Each frame: every villager takes their next step, or fades at a door;
      // the light and weather move on.
      const reducedMotion = prefersReducedMotion();
      let idleMs = 0;
      app.ticker.add((ticker) => {
        atmosphere.update(
          ticker.deltaMS,
          {
            ...atmosphereRef.current,
            zoom: Math.max(1, Math.round(camera.zoom)),
            reducedMotion,
          },
          world,
        );
        const walkMs = ticker.deltaMS * paceRef.current;
        idleMs += ticker.deltaMS;
        for (const walker of walkers.values()) {
          walker.state = stepWalker(walker.state, walkMs, reducedMotion);
          const at = walkerPosition(walker.state, reducedMotion);
          const offset = walker.kind === 'cat' ? CAT_OFFSET : { x: 0, y: 0 };
          walker.sprite.position.set(
            Math.round(at.x * TILE_PX) + offset.x,
            Math.round(at.y * TILE_PX) + offset.y,
          );
          walker.sprite.zIndex = walker.sprite.y + walker.sprite.height;
          walker.sprite.alpha = walker.state.alpha;
          walker.sprite.visible = walker.state.visible;
          if (walker.frames && !reducedMotion) {
            const frame = walker.frames[Math.floor(idleMs / CAT_FRAME_MS) % walker.frames.length];
            if (frame && walker.sprite.texture !== frame) {
              walker.sprite.texture = frame;
            }
          }
        }
        // Following someone: keep them in the middle of the screen.
        const followed = followRef.current ? walkers.get(followRef.current) : undefined;
        if (followed && !insideRef.current) {
          camera.x = followed.sprite.x + followed.sprite.width / 2;
          camera.y = followed.sprite.y + followed.sprite.height / 2;
          applyCamera();
        }
      });

      setScene({
        app,
        groundGroup,
        recoloured: recolouredTextures,
        atmosphere,
        world,
        roomHost,
        flatHost,
        objectsHost,
        statics: [],
        walkers,
        isDragging: () => dragged,
      });
    }

    void setup();

    return () => {
      cancelled.current = true;
      zoomByRef.current = null;
      jumpRef.current = null;
      viewRef.current = null;
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
        if (!season.blooms && isBloom(item.sprite)) {
          continue;
        }
        flat.addChild(
          new Sprite({ texture: await loadFrameTexture(item.sprite), x: item.x, y: item.y }),
        );
      }

      const objects: Sprite[] = [];
      for (const item of plan.standing) {
        let texture = await loadFrameTexture(item.sprite);
        if (item.kind === 'decor' && season.foliage && isFoliage(item.sprite)) {
          texture = recoloured(
            current.app,
            current.recoloured,
            texture,
            season.foliage,
            season.season,
          );
        }
        const sprite = new Sprite({
          texture,
          x: item.x,
          y: item.y,
          zIndex: item.y + item.sprite.height,
        });
        if (item.kind === 'building') {
          const { buildingId, slot } = item;
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          sprite.on('pointerover', () => {
            setHovered({ kind: 'building', id: buildingId, slot });
          });
          sprite.on('pointerout', () => {
            setHovered((now) => (now?.id === buildingId ? null : now));
          });
          sprite.on('pointertap', () => {
            if (!current.isDragging()) {
              onClickRef.current?.(buildingId, slot);
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
      current.atmosphere.setGlows(glowsFor(plan.buildings));
      if (objects.length > 0) {
        current.objectsHost.addChild(...objects);
      }
      current.statics = objects;
    }

    void populate(scene);

    return () => {
      cancelled.current = true;
    };
  }, [scene, plan, season]);

  // The season's ground: autumn's gold over the grass, winter's snow over grass and paths.
  useEffect(() => {
    if (!scene) {
      return;
    }
    scene.groundGroup.filters = season.ground ? [matrixFilter(season.ground)] : [];
  }, [scene, season]);

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
      for (const placement of movers) {
        const id = placement.id;
        seen.add(id);
        const target = { x: placement.x, y: placement.y, hidden: placement.hidden };
        const existing = current.walkers.get(id);
        if (existing) {
          existing.state = retargetWalker(existing.state, target, grid, reducedMotion);
          existing.where = placement.where;
          continue;
        }
        const texture = await loadFrameTexture(placement.sprite);
        const frames =
          placement.kind === 'cat'
            ? await Promise.all(CAT_FRAMES.map((frame) => loadFrameTexture(frame)))
            : undefined;
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
        const walker: Walker = {
          kind: placement.kind,
          sprite,
          state,
          where: placement.where,
          ...(frames ? { frames } : {}),
        };
        if (placement.kind === 'cat') {
          // The cat can be looked at, but it's nobody's to inspect.
          sprite.on('pointerover', () => {
            setHovered({ kind: 'cat', id: 'cat', where: walker.where });
          });
          sprite.on('pointerout', () => {
            setHovered((now) => (now?.kind === 'cat' ? null : now));
          });
          current.objectsHost.addChild(sprite);
          current.walkers.set(id, walker);
          continue;
        }
        sprite.cursor = 'pointer';
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
  }, [scene, movers, grid]);

  // For the minimap: villagers out in the open, in map pixels.
  const readDots = useCallback(
    () =>
      scene
        ? [...scene.walkers.values()]
            .filter((walker) => walker.kind === 'villager' && walker.state.visible)
            .map((walker) => ({ x: walker.sprite.x + 8, y: walker.sprite.y + 8 }))
        : [],
    [scene],
  );
  const readView = useCallback(() => viewRef.current, []);
  const jump = useCallback((x: number, y: number) => {
    jumpRef.current?.(x, y);
  }, []);
  const minimapBuildings = useMemo(
    () =>
      plan.buildings.map((building) => {
        const [fw, fh] = getBuilding(building.buildingId)?.footprintTiles ?? [1, 1];
        const plotX = building.x + building.sprite.width / 2 - (fw * TILE_PX) / 2;
        return {
          x: plotX,
          y: building.y + building.sprite.height - fh * TILE_PX,
          width: fw * TILE_PX,
          height: fh * TILE_PX,
        };
      }),
    [plan],
  );

  // The room: drawn over the dark in place of the map while the owner is inside.
  useEffect(() => {
    if (!scene) {
      return;
    }
    const { app, world, roomHost } = scene;
    const plan = roomBuildingId ? planInteriorDraw(roomBuildingId) : undefined;
    if (!plan) {
      return;
    }
    const roomPlan = plan;
    const cancelled = { current: false };
    let onResize: (() => void) | undefined;

    async function build() {
      const built = new Container();

      // The pale wall top all round, with a dark edge.
      built.addChild(
        new Graphics()
          .rect(0, 0, roomPlan.width, roomPlan.height)
          .fill('#5c4a2e')
          .rect(1, 1, roomPlan.width - 2, roomPlan.height - 2)
          .fill(WALL_TOP_COLOR),
      );

      const wallTexture = await loadFrameTexture(BACK_WALL);
      const floorTexture = await loadFrameTexture(FLOORBOARDS);
      built.addChild(
        new TilingSprite({ texture: wallTexture, ...roomPlan.wall }),
        new TilingSprite({ texture: floorTexture, ...roomPlan.floor }),
        // The doorway: the floor runs on out through the gap in the front wall.
        new TilingSprite({ texture: floorTexture, ...roomPlan.door }),
      );
      for (const item of roomPlan.wallDecor) {
        built.addChild(
          new Sprite({ texture: await loadFrameTexture(item.sprite), x: item.x, y: item.y }),
        );
      }

      for (const item of roomPlan.furniture) {
        const sprite = new Sprite({
          texture: await loadFrameTexture(item.sprite),
          x: item.x,
          y: item.y,
        });
        const kind = item.kind;
        if (kind && interactiveKindsRef.current?.has(kind)) {
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          sprite.on('pointerover', () => {
            setHovered({ kind: 'furniture', id: kind });
          });
          sprite.on('pointerout', () => {
            setHovered((now) => (now?.kind === 'furniture' ? null : now));
          });
          sprite.on('pointertap', () => {
            onFurnitureClickRef.current?.(kind);
          });
        }
        built.addChild(sprite);
      }

      // Whoever's in here, standing about on the open floor.
      for (const [index, occupant] of occupants.entries()) {
        const spot = roomPlan.standingSpots[index % roomPlan.standingSpots.length];
        if (!spot) {
          continue;
        }
        const sprite = new Sprite({
          texture: await loadFrameTexture(occupant.sprite),
          x: spot.x,
          y: spot.y,
        });
        const id = occupant.villager.id;
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';
        sprite.on('pointerover', () => {
          setHovered({ kind: 'villager', id, where: occupant.where });
        });
        sprite.on('pointerout', () => {
          setHovered((now) => (now?.id === id ? null : now));
        });
        sprite.on('pointertap', () => {
          onVillagerClickRef.current?.(id);
        });
        built.addChild(sprite);
      }

      // Set by the cleanup below, across the awaits.
      if (cancelled.current) {
        built.destroy({ children: true });
        return;
      }
      roomHost.addChild(built);
      // The biggest whole zoom that fits, centred on the screen.
      const place = () => {
        const zoom = roomZoom(roomPlan, app.screen.width, app.screen.height);
        roomHost.scale.set(zoom);
        roomHost.position.set(
          Math.round((app.screen.width - roomPlan.width * zoom) / 2),
          Math.round((app.screen.height - roomPlan.height * zoom) / 2),
        );
      };
      place();
      onResize = place;
      app.renderer.on('resize', place);
      world.visible = false;
      app.renderer.background.color = ROOM_SURROUND;
    }

    void build();

    return () => {
      cancelled.current = true;
      if (onResize) {
        app.renderer.off('resize', onResize);
      }
      for (const old of roomHost.removeChildren()) {
        old.destroy({ children: true });
      }
      world.visible = true;
      app.renderer.background.color = MAP_BACKGROUND;
      setHovered(null);
    };
  }, [scene, roomBuildingId, occupants]);

  return (
    <div
      ref={containerRef}
      data-testid="village-canvas"
      data-light={lightWord(data.hour)}
      data-indoors={inside ? 'true' : 'false'}
      data-season={data.season}
      data-weather={data.weather}
      className="relative h-full w-full overflow-hidden"
    >
      {hovered && (
        <div className="wood-panel pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 px-1 text-lg whitespace-nowrap">
          {hovered.kind === 'building'
            ? buildingLabel(data, hovered.id, hovered.slot)
            : hovered.kind === 'cat'
              ? `The village cat, ${hovered.where}`
              : hovered.kind === 'furniture'
                ? `${titleCase(hovered.id)} - click to look`
                : `${titleCase(hovered.id)}, ${hovered.where} - click to meet them`}
        </div>
      )}
      {/*
        Spec section 14: every hotspot and villager is a focusable button with
        a label. Out of sight until a keyboard reaches it, then shown over the map.
      */}
      {!inside && (
        <nav
          aria-label="On the map"
          className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-3 focus-within:left-1/2 focus-within:z-20 focus-within:max-h-[60%] focus-within:-translate-x-1/2 focus-within:overflow-auto"
        >
          <ul className="wood-panel flex flex-col gap-1 p-1 text-sm">
            {plan.buildings.map((building) => {
              const summary = buildingSummary(data, building.buildingId, building.slot);
              const who = whoIsIn(building.buildingId, summary.inside);
              return (
                <li key={`${building.buildingId}-${building.slot}`}>
                  <button
                    type="button"
                    className="wood-button w-full text-left"
                    onClick={() => {
                      onBuildingClick?.(building.buildingId, building.slot);
                    }}
                  >
                    The {summary.title.toLowerCase()}: {who ?? 'nobody is in'}
                  </button>
                </li>
              );
            })}
            {movers
              .filter((mover) => mover.kind === 'villager')
              .map((mover) => (
                <li key={mover.id}>
                  <button
                    type="button"
                    className="wood-button w-full text-left"
                    onClick={() => {
                      onVillagerClick?.(mover.id);
                    }}
                  >
                    {titleCase(mover.id)}, {mover.where}
                  </button>
                </li>
              ))}
          </ul>
        </nav>
      )}

      <div
        className={`absolute right-3 bottom-3 z-10 flex flex-col items-end gap-1 ${inside ? 'hidden' : ''}`}
      >
        <Minimap
          map={map}
          buildings={minimapBuildings}
          readView={readView}
          readDots={readDots}
          onJump={jump}
        />
        <div className="flex gap-1">
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
    </div>
  );
}

/** "Cottage - Hesper and Ada are home - click to look" for the hover label. */
function buildingLabel(data: VillageFacts, buildingId: string, slot: number): string {
  const summary = buildingSummary(data, buildingId, slot);
  const who = whoIsIn(buildingId, summary.inside);
  return `${summary.title}${who ? ` - ${who}` : ''} - click to look`;
}
