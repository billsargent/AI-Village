import { TILE_PX, waterOnMap, type MapId } from '@ai-village/content';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { makeGlowTexture } from './atmosphere-layer.js';

/**
 * Spec section 15's festivals, on the map: bunting round the green for
 * the Sowing Fair and the Harvest Festival, a bonfire and fireflies for
 * Midsummer Night, lanterns on the river for Lantern Night. Each shows on
 * its own day only. Things are drawn in `decor` (inside the map, under
 * the night's tint); their light in `lights` (lined up with the map,
 * added over the tint, so it shines in the dark).
 */

/** The ring path round the green, in tiles: bunting runs along its edge. */
const GREEN = { x0: 24, y0: 23, x1: 44, y1: 35 } as const;
const BONFIRE = { x: 34 * TILE_PX, y: 29 * TILE_PX };
const BUNTING_COLOURS = [0xe04a3a, 0xf2c14e, 0x4a90d9, 0x6cc070, 0xf28fb5];

export type FestivalLook = 'bunting' | 'bonfire' | 'lanterns' | 'none';

/** What a festival puts on the map. Unknown names - or no festival - put up nothing. */
export function festivalLook(festival: string | null): FestivalLook {
  switch (festival) {
    case 'Sowing Fair':
    case 'Harvest Festival':
      return 'bunting';
    case 'Midsummer Night':
      return 'bonfire';
    case 'Lantern Night':
      return 'lanterns';
    default:
      return 'none';
  }
}

/** A string of pennants between two points, sagging in the middle. */
function buntingLine(g: Graphics, ax: number, ay: number, bx: number, by: number): void {
  const length = Math.hypot(bx - ax, by - ay);
  const flags = Math.floor(length / 10);
  const sag = Math.min(10, length / 12);
  const at = (t: number) => ({
    x: ax + (bx - ax) * t,
    y: ay + (by - ay) * t + Math.sin(Math.PI * t) * sag,
  });
  for (let i = 0; i < 24; i++) {
    const p = at(i / 24);
    const q = at((i + 1) / 24);
    g.moveTo(p.x, p.y).lineTo(q.x, q.y);
  }
  g.stroke({ width: 1, color: 0x5a3a1a });
  for (let i = 0; i < flags; i++) {
    const p = at((i + 0.5) / flags);
    g.poly([p.x - 3, p.y, p.x + 3, p.y, p.x, p.y + 6]).fill(
      BUNTING_COLOURS[i % BUNTING_COLOURS.length] ?? 0xe04a3a,
    );
  }
}

interface Mote {
  sprite: Sprite;
  /** A lantern's paper body, drawn with its light. */
  body?: Sprite;
  x: number;
  y: number;
  phase: number;
  speed: number;
}

export class FestivalLayer {
  /** Inside the map, above everything standing on it. */
  readonly decor = new Container();
  /** Lined up with the map each frame, added over the tint. */
  readonly lights = new Container();

  private readonly glowTexture = makeGlowTexture();
  private look: FestivalLook = 'none';
  private flames: Graphics | null = null;
  private fireGlow: Sprite | null = null;
  private motes: Mote[] = [];
  private bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private clockMs = 0;

  /** Put up (or take down) what this festival brings, on this map. */
  setFestival(festival: string | null, map: MapId): void {
    this.clear();
    this.look = map === 'main' ? festivalLook(festival) : 'none';
    if (this.look === 'bunting') {
      const g = new Graphics();
      const x0 = GREEN.x0 * TILE_PX;
      const y0 = GREEN.y0 * TILE_PX;
      const x1 = GREEN.x1 * TILE_PX;
      const y1 = GREEN.y1 * TILE_PX;
      const corners = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ] as const;
      // A pole at each corner, and a string to the next.
      corners.forEach(([x, y], i) => {
        g.rect(x - 1, y - 14, 2, 14).fill(0x7a4a22);
        const [nx, ny] = corners[(i + 1) % corners.length] ?? corners[0];
        buntingLine(g, x, y - 13, nx, ny - 13);
      });
      this.decor.addChild(g);
    } else if (this.look === 'bonfire') {
      const logs = new Graphics()
        .rect(BONFIRE.x - 8, BONFIRE.y + 4, 16, 3)
        .fill(0x5a3a1a)
        .rect(BONFIRE.x - 6, BONFIRE.y + 2, 12, 3)
        .fill(0x6b4423);
      this.flames = new Graphics()
        .poly([-7, 4, 7, 4, 0, -12])
        .fill(0xe8541e)
        .poly([-4, 4, 4, 4, 0, -7])
        .fill(0xf8c34a);
      this.flames.position.set(BONFIRE.x, BONFIRE.y + 2);
      this.decor.addChild(logs, this.flames);
      this.fireGlow = this.glow(BONFIRE.x, BONFIRE.y, 60, 0xff9a3c);
      this.bounds = { x0: 26 * TILE_PX, y0: 25 * TILE_PX, x1: 42 * TILE_PX, y1: 33 * TILE_PX };
      for (let i = 0; i < 36; i++) {
        this.motes.push(this.mote(4, 0xd8ff6a, 0.3));
      }
    } else if (this.look === 'lanterns') {
      const river = waterOnMap('main').find((rect) => rect.h > rect.w);
      if (river) {
        this.bounds = {
          x0: river.x * TILE_PX + 6,
          y0: river.y * TILE_PX,
          x1: (river.x + river.w) * TILE_PX - 6,
          y1: (river.y + river.h) * TILE_PX,
        };
        for (let i = 0; i < 16; i++) {
          this.motes.push(this.mote(14, 0xffa94d, 6));
        }
      }
    }
  }

  /** One frame: flicker the fire, drift the fireflies and lanterns, follow the map. */
  update(dtMs: number, strength: number, world: Container, reducedMotion: boolean): void {
    this.clockMs += dtMs;
    this.lights.position.copyFrom(world.position);
    this.lights.scale.copyFrom(world.scale);
    this.lights.visible = strength > 0 && this.look !== 'none';
    this.lights.alpha = strength;
    if (this.flames && !reducedMotion) {
      this.flames.scale.set(1, 0.85 + Math.abs(Math.sin(this.clockMs / 130)) * 0.3);
    }
    if (this.fireGlow) {
      this.fireGlow.alpha = reducedMotion ? 0.8 : 0.7 + Math.sin(this.clockMs / 170) * 0.1;
    }
    if (reducedMotion) {
      return;
    }
    const seconds = dtMs / 1000;
    const { x0, y0, x1, y1 } = this.bounds;
    for (const mote of this.motes) {
      mote.phase += seconds;
      if (this.look === 'lanterns') {
        // Downstream, bobbing a little.
        mote.y += mote.speed * seconds;
        if (mote.y > y1) {
          mote.y = y0;
        }
        mote.sprite.position.set(mote.x + Math.sin(mote.phase) * 2, mote.y);
        mote.body?.position.copyFrom(mote.sprite.position);
      } else {
        mote.x += Math.cos(mote.phase * 0.9 + mote.speed) * 10 * seconds;
        mote.y += Math.sin(mote.phase * 1.3 + mote.speed) * 10 * seconds;
        mote.x = Math.min(Math.max(mote.x, x0), x1);
        mote.y = Math.min(Math.max(mote.y, y0), y1);
        mote.sprite.position.set(mote.x, mote.y);
        mote.sprite.alpha = 0.4 + Math.abs(Math.sin(mote.phase * 2 + mote.speed)) * 0.6;
      }
    }
  }

  destroy(): void {
    this.clear();
    this.glowTexture.destroy(true);
  }

  private clear(): void {
    for (const child of this.decor.removeChildren()) {
      child.destroy();
    }
    for (const child of this.lights.removeChildren()) {
      child.destroy();
    }
    this.flames = null;
    this.fireGlow = null;
    this.motes = [];
  }

  private glow(x: number, y: number, size: number, colour: number): Sprite {
    const sprite = new Sprite({
      texture: this.glowTexture,
      anchor: 0.5,
      x,
      y,
      width: size,
      height: size,
      tint: colour,
    });
    sprite.blendMode = 'add';
    this.lights.addChild(sprite);
    return sprite;
  }

  /** A firefly or a lantern, somewhere in the bounds: a small light, and a body for a lantern. */
  private mote(size: number, colour: number, speed: number): Mote {
    const { x0, y0, x1, y1 } = this.bounds;
    const x = x0 + Math.random() * (x1 - x0);
    const y = y0 + Math.random() * (y1 - y0);
    const sprite = this.glow(x, y, size, colour);
    const mote: Mote = {
      sprite,
      x,
      y,
      phase: Math.random() * Math.PI * 2,
      speed: speed * (0.7 + Math.random() * 0.6),
    };
    if (this.look === 'lanterns') {
      mote.body = new Sprite({ texture: Texture.WHITE, width: 3, height: 3, tint: 0xffd27a });
      mote.body.anchor.set(0.5);
      mote.body.position.set(x, y);
      this.lights.addChild(mote.body);
    }
    return mote;
  }
}
