import { greeting } from '@ai-village/content';
import { Container, Graphics, Text } from 'pixi.js';

/** Someone on the map who might say hello, as the talk layer sees them. */
export interface Talker {
  id: string;
  /** Map pixels of their sprite's top-left corner. */
  x: number;
  y: number;
  /** Out and about, not fading through a door. */
  present: boolean;
}

export interface TalkContext {
  hour: number;
  weather: string;
  festival: string | null;
  /** A home's roof, in map pixels, for each home with someone asleep in it. */
  sleepers: readonly { x: number; y: number }[];
  inside: boolean;
  reducedMotion: boolean;
}

interface Floating {
  view: Container;
  /** Map pixels it hangs from. */
  x: number;
  y: number;
  ageMs: number;
  lifeMs: number;
  /** How far it drifts up over its life, in screen pixels. */
  rise: number;
}

/** Two villagers this close (map pixels) are passing each other. */
const PASSING_PX = 26;
/** A pair waits this long (real time) before greeting again. */
const PAIR_COOLDOWN_MS = 45_000;
const BUBBLE_MS = 3200;
const MAX_BUBBLES = 3;
const SCAN_MS = 400;
const ZZZ_EVERY_MS = 1600;
const ZZZ_MS = 2600;
const INK = 0x4a2a12;
const PARCHMENT = 0xf6e7c1;

function bubble(text: string): Container {
  const label = new Text({
    text,
    style: { fontFamily: 'Pixelify Sans', fontSize: 14, fill: INK },
  });
  const padX = 6;
  const padY = 3;
  const width = Math.ceil(label.width) + padX * 2;
  const height = Math.ceil(label.height) + padY * 2;
  const back = new Graphics()
    .rect(0, 0, width, height)
    .fill(PARCHMENT)
    .stroke({ width: 2, color: INK })
    // The little tail pointing down at the speaker.
    .poly([width / 2 - 4, height, width / 2 + 4, height, width / 2, height + 5])
    .fill(PARCHMENT);
  label.position.set(padX, padY);
  const view = new Container();
  view.addChild(back, label);
  view.pivot.set(width / 2, height + 5);
  return view;
}

function zzz(): Container {
  const view = new Container();
  view.addChild(
    new Text({
      text: 'z',
      style: { fontFamily: 'Pixelify Sans', fontSize: 16, fill: 0xeef2ff, fontWeight: '700' },
    }),
  );
  return view;
}

/**
 * Words over the map, drawn in screen space so they stay crisp at any
 * zoom: greetings as villagers pass each other, and a slow Zzz rising
 * from every home where someone's asleep (spec section 15's small touches).
 */
export class TalkLayer {
  readonly view = new Container();
  private readonly bubbles: Floating[] = [];
  private readonly zs: Floating[] = [];
  private readonly lastGreeted = new Map<string, number>();
  private clockMs = 0;
  private sinceScanMs = 0;
  private sinceZzzMs = 0;
  private meetings = 0;

  update(dtMs: number, talkers: readonly Talker[], world: Container, context: TalkContext): void {
    this.clockMs += dtMs;
    this.view.visible = !context.inside;
    if (context.inside || context.reducedMotion) {
      this.clear();
      return;
    }

    this.sinceScanMs += dtMs;
    if (this.sinceScanMs >= SCAN_MS) {
      this.sinceScanMs = 0;
      this.greetPassers(talkers, context);
    }

    this.sinceZzzMs += dtMs;
    if (this.sinceZzzMs >= ZZZ_EVERY_MS) {
      this.sinceZzzMs = 0;
      for (const roof of context.sleepers) {
        const view = zzz();
        this.view.addChild(view);
        this.zs.push({ view, x: roof.x + 6, y: roof.y, ageMs: 0, lifeMs: ZZZ_MS, rise: 30 });
      }
    }

    const zoom = world.scale.x;
    for (const list of [this.bubbles, this.zs]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (!item) {
          continue;
        }
        item.ageMs += dtMs;
        if (item.ageMs >= item.lifeMs) {
          item.view.destroy({ children: true });
          list.splice(i, 1);
          continue;
        }
        const t = item.ageMs / item.lifeMs;
        item.view.position.set(
          Math.round(
            world.position.x + item.x * zoom + (list === this.zs ? Math.sin(t * 6) * 4 : 0),
          ),
          Math.round(world.position.y + item.y * zoom - item.rise * t),
        );
        item.view.alpha = t > 0.8 ? (1 - t) / 0.2 : 1;
      }
    }
  }

  destroy(): void {
    this.clear();
  }

  private clear(): void {
    for (const item of [...this.bubbles, ...this.zs]) {
      item.view.destroy({ children: true });
    }
    this.bubbles.length = 0;
    this.zs.length = 0;
  }

  private greetPassers(talkers: readonly Talker[], context: TalkContext): void {
    const present = talkers.filter((talker) => talker.present);
    for (let a = 0; a < present.length; a++) {
      for (let b = a + 1; b < present.length; b++) {
        if (this.bubbles.length >= MAX_BUBBLES) {
          return;
        }
        const one = present[a];
        const other = present[b];
        if (!one || !other || Math.hypot(one.x - other.x, one.y - other.y) > PASSING_PX) {
          continue;
        }
        const pair = [one.id, other.id].sort().join('|');
        const last = this.lastGreeted.get(pair);
        if (last !== undefined && this.clockMs - last < PAIR_COOLDOWN_MS) {
          continue;
        }
        this.lastGreeted.set(pair, this.clockMs);
        this.meetings += 1;
        // Take turns as to who speaks first.
        const [speaker, listener] = this.meetings % 2 === 0 ? [one, other] : [other, one];
        const view = bubble(
          greeting({
            to: listener.id,
            hour: context.hour,
            weather: context.weather,
            festival: context.festival,
            seed: `${pair}:${this.meetings}`,
          }),
        );
        this.view.addChild(view);
        this.bubbles.push({
          view,
          x: speaker.x + 8,
          y: speaker.y - 2,
          ageMs: 0,
          lifeMs: BUBBLE_MS,
          rise: 0,
        });
      }
    }
  }
}
