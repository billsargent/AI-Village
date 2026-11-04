import type { SpriteFrame } from '@ai-village/content';
import { Assets, Rectangle, Texture } from 'pixi.js';

/** Crops one `SpriteFrame` out of its sheet, loaded nearest-neighbour (spec section 10: no smoothing). */
export async function loadFrameTexture(frame: SpriteFrame): Promise<Texture> {
  const base = await Assets.load<Texture>({
    src: `/${frame.file}`,
    data: { scaleMode: 'nearest' },
  });
  return new Texture({
    source: base.source,
    frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
  });
}
