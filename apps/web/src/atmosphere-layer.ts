import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import type { Glow, Particles } from './atmosphere.js';
import type { Rgb } from './light.js';

/** What the layer should look like right now; read every frame. */
export interface AtmosphereState {
  /** The colour the whole scene is multiplied by (spec section 10's tint). */
  light: Rgb;
  /** 0-1: how brightly windows and doors glow. */
  glow: number;
  particles: Particles;
  /** How many particles on screen. */
  count: number;
  /** Sideways drift, in screen pixels a second. */
  wind: number;
  /** 0-1: the fog layer's thickness. */
  fog: number;
  /** Inside a room: no weather, no outdoor lights - only the tint. */
  inside: boolean;
  /** The map's zoom, so particles are drawn at the same pixel size as the art. */
  zoom: number;
  reducedMotion: boolean;
}

interface Particle {
  sprite: Sprite;
  x: number;
  y: number;
  /** Fall speed, screen pixels a second. */
  fall: number;
  /** Where it is in its side-to-side sway. */
  phase: number;
}

const GLOW_COLOUR = 0xffb45a;
const FOG_COLOUR = 0xdfe4e8;
/** How quickly the tint follows the clock: about a second to settle. */
const TINT_EASE_PER_MS = 0.004;

function toHex([r, g, b]: Rgb): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** A soft round light, bright in the middle and fading to nothing, drawn once and reused. */
function makeGlowTexture(): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}

/** The little pixel shapes that fall or drift, one per kind. */
function makeParticleTextures(app: Application): Record<Exclude<Particles, 'none'>, Texture> {
  const shape = (draw: (g: Graphics) => Graphics) =>
    app.renderer.generateTexture(draw(new Graphics()));
  return {
    rain: shape((g) => g.rect(0, 0, 1, 4).fill({ color: 0xc8dcff, alpha: 0.75 })),
    snow: shape((g) => g.rect(0, 0, 2, 2).fill(0xffffff)),
    petals: shape((g) => g.rect(0, 0, 2, 1).fill(0xffb7cf).rect(0, 1, 1, 1).fill(0xf58fb0)),
    leaves: shape((g) => g.rect(0, 0, 2, 1).fill(0xe0782a).rect(1, 1, 1, 1).fill(0xb8521c)),
  };
}

/**
 * Everything drawn over the map that isn't on it: weather falling past,
 * fog, the hour's tint, and the lights that shine through the dark. One
 * object per renderer; the canvas calls `update` every frame.
 *
 * Layer order, bottom to top: the map, weather and fog, the room (when
 * inside), the tint (multiplied over all of it), then the glows (added
 * on top, so the dark never dims them).
 */
export class AtmosphereLayer {
  /** Falling rain or snow, drifting petals or leaves - in screen space, under the tint. */
  readonly weather = new Container();
  readonly fog: Sprite;
  readonly tint: Sprite;
  /** Window and door lights, in map space - kept lined up with the map each frame. */
  readonly glows = new Container();

  private readonly app: Application;
  private readonly glowTexture: Texture;
  private readonly particleTextures: Record<Exclude<Particles, 'none'>, Texture>;
  private particles: Particle[] = [];
  private particleKind: Particles = 'none';
  private shownLight: [number, number, number] | null = null;

  constructor(app: Application) {
    this.app = app;
    this.glowTexture = makeGlowTexture();
    this.particleTextures = makeParticleTextures(app);
    this.fog = new Sprite({ texture: Texture.WHITE, tint: FOG_COLOUR, alpha: 0 });
    this.tint = new Sprite({ texture: Texture.WHITE });
    this.tint.blendMode = 'multiply';
    this.glows.alpha = 0;
    this.fitScreen();
  }

  /** Stretch the screen-wide layers over the whole canvas; call on resize. */
  fitScreen(): void {
    for (const sprite of [this.fog, this.tint]) {
      sprite.width = this.app.screen.width;
      sprite.height = this.app.screen.height;
    }
  }

  /** Put up the lights for what's built on the map now. */
  setGlows(glows: readonly Glow[]): void {
    for (const old of this.glows.removeChildren()) {
      old.destroy();
    }
    for (const glow of glows) {
      const sprite = new Sprite({
        texture: this.glowTexture,
        anchor: 0.5,
        x: glow.x,
        y: glow.y,
        width: glow.radius * 2,
        height: glow.radius * 2,
        tint: GLOW_COLOUR,
        alpha: glow.kind === 'door' ? 0.7 : 0.9,
      });
      sprite.blendMode = 'add';
      this.glows.addChild(sprite);
    }
  }

  /** One frame: ease the tint, line the glows up with the map, move the weather on. */
  update(dtMs: number, state: AtmosphereState, world: Container): void {
    // The tint eases towards the hour's colour rather than jumping each village minute.
    const target = state.light;
    if (!this.shownLight || state.reducedMotion) {
      this.shownLight = [target[0], target[1], target[2]];
    } else {
      const t = Math.min(1, dtMs * TINT_EASE_PER_MS);
      for (const c of [0, 1, 2] as const) {
        this.shownLight[c] += (target[c] - this.shownLight[c]) * t;
      }
    }
    this.tint.tint = toHex(this.shownLight);

    this.glows.visible = !state.inside && state.glow > 0;
    this.glows.alpha = state.glow;
    this.glows.position.copyFrom(world.position);
    this.glows.scale.copyFrom(world.scale);

    this.fog.visible = !state.inside && state.fog > 0;
    this.fog.alpha = state.fog;

    this.weather.visible = !state.inside;
    const kind = state.inside ? 'none' : state.particles;
    this.syncParticles(kind, kind === 'none' ? 0 : state.count, state.zoom);
    if (!state.reducedMotion) {
      this.moveParticles(dtMs, state.wind);
    }
  }

  destroy(): void {
    this.glowTexture.destroy(true);
    for (const texture of Object.values(this.particleTextures)) {
      texture.destroy(true);
    }
  }

  private syncParticles(kind: Particles, count: number, zoom: number): void {
    if (kind !== this.particleKind) {
      for (const particle of this.particles) {
        particle.sprite.destroy();
      }
      this.particles = [];
      this.particleKind = kind;
    }
    if (kind === 'none') {
      return;
    }
    const { width, height } = this.app.screen;
    while (this.particles.length < count) {
      const sprite = new Sprite({ texture: this.particleTextures[kind] });
      sprite.scale.set(zoom);
      const particle: Particle = {
        sprite,
        x: Math.random() * width,
        y: Math.random() * height,
        fall: fallSpeed(kind) * (0.8 + Math.random() * 0.4),
        phase: Math.random() * Math.PI * 2,
      };
      sprite.position.set(Math.round(particle.x), Math.round(particle.y));
      this.weather.addChild(sprite);
      this.particles.push(particle);
    }
    while (this.particles.length > count) {
      this.particles.pop()?.sprite.destroy();
    }
    for (const particle of this.particles) {
      particle.sprite.scale.set(zoom);
    }
  }

  private moveParticles(dtMs: number, wind: number): void {
    const { width, height } = this.app.screen;
    const seconds = dtMs / 1000;
    const sways = this.particleKind !== 'rain';
    for (const particle of this.particles) {
      particle.phase += seconds * 2;
      particle.y += particle.fall * seconds;
      particle.x += (wind + (sways ? Math.sin(particle.phase) * 20 : 0)) * seconds;
      // Off one edge, back in at the other.
      if (particle.y > height) {
        particle.y -= height + 8;
        particle.x = Math.random() * width;
      }
      if (particle.x > width) {
        particle.x -= width;
      } else if (particle.x < 0) {
        particle.x += width;
      }
      particle.sprite.position.set(Math.round(particle.x), Math.round(particle.y));
    }
  }
}

function fallSpeed(kind: Particles): number {
  switch (kind) {
    case 'rain':
      return 700;
    case 'snow':
      return 60;
    default:
      return 35;
  }
}
