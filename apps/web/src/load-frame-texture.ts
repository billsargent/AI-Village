import type { SpriteFrame } from '@ai-village/content';
import { Assets, Rectangle, Texture } from 'pixi.js';

const cache = new Map<string, Promise<Texture>>();

/** One sub-rectangle of a sheet as a texture, made once per distinct frame and reused. */
export function loadFrameTexture(frame: SpriteFrame): Promise<Texture> {
  const key = `${frame.file}:${frame.x}:${frame.y}:${frame.width}:${frame.height}`;
  let texture = cache.get(key);
  if (!texture) {
    texture = Assets.load<Texture>({
      src: `/${frame.file}`,
      data: { scaleMode: 'nearest' },
    }).then(
      (base) =>
        new Texture({
          source: base.source,
          frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
        }),
    );
    cache.set(key, texture);
    // A failed load shouldn't stay cached forever.
    texture.catch(() => cache.delete(key));
  }
  return texture;
}
