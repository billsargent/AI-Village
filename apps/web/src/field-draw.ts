/**
 * The fields, drawn over their whole plot: tilled soil inside the sheet's
 * wooden fence, with crop rows that follow the season (spec section 10:
 * "farmland (tilled, sown, 4 growth stages per crop)"). The sheet has no
 * crop art, so the crops are a few hand-placed pixels in its palette -
 * spec section 10's "fill the gaps with hand-made pieces in the same
 * palette".
 */
import { TILE_PX } from '@ai-village/content';

export type CropStage = 'sprouts' | 'green' | 'golden' | 'bare';

/** Spring is sown, summer grows, autumn ripens, winter lies fallow. */
export function cropStage(season: string): CropStage {
  switch (season) {
    case 'spring':
      return 'sprouts';
    case 'summer':
      return 'green';
    case 'autumn':
      return 'golden';
    default:
      return 'bare';
  }
}

/** One rectangle of colour, in pixels from the field's top-left corner. */
export interface Pixel {
  x: number;
  y: number;
  width: number;
  height: number;
  colour: number;
}

const FURROW = 0x8a5a32;
const PLANTS: Record<
  Exclude<CropStage, 'bare'>,
  { colour: number; tip: number; height: number }
> = {
  sprouts: { colour: 0x6cc070, tip: 0x9be08a, height: 2 },
  green: { colour: 0x3f9a4a, tip: 0x6cc070, height: 6 },
  golden: { colour: 0xf0c040, tip: 0xfff0a0, height: 7 },
};

/** Rows run across the field every this many pixels; plants stand this far apart along them. */
const ROW_PX = 8;
const PLANT_PX = 5;

/**
 * The furrows and crops for a field of this size (in pixels), keeping a
 * tile clear inside the fence all round. Pure, so it can be tested; the
 * canvas draws each rectangle.
 */
export function fieldPixels(width: number, height: number, stage: CropStage): readonly Pixel[] {
  const pixels: Pixel[] = [];
  const inset = TILE_PX;
  for (let y = inset + ROW_PX - 2; y < height - inset; y += ROW_PX) {
    pixels.push({ x: inset, y, width: width - 2 * inset, height: 1, colour: FURROW });
    if (stage === 'bare') {
      continue;
    }
    const plant = PLANTS[stage];
    for (let x = inset + 2; x + 3 <= width - inset; x += PLANT_PX) {
      pixels.push(
        { x, y: y - plant.height, width: 3, height: plant.height, colour: plant.colour },
        { x, y: y - plant.height, width: 3, height: 1, colour: plant.tip },
      );
    }
  }
  return pixels;
}
