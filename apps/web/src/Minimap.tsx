import { groundGrid, TILE_PX, type MapId } from '@ai-village/content';
import { useEffect, useMemo, useRef } from 'react';

/** How many minimap pixels each map tile gets. */
const PX_PER_TILE = 2;
const COLOURS = { grass: '#5d8a3c', dirt: '#b0784a', water: '#3f6fc4' } as const;
const BUILDING_COLOUR = '#c0392b';
const DOT_COLOUR = '#fff6dc';
const VIEW_COLOUR = '#fff6dc';

export interface MinimapView {
  /** The part of the map on screen, in map pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapProps {
  map: MapId;
  /** Built buildings on this map, in map pixels. */
  buildings: readonly { x: number; y: number; width: number; height: number }[];
  /** Read a few times a second: what's on screen, and where the villagers are (map pixels). */
  readView: () => MinimapView | null;
  readDots: () => readonly { x: number; y: number }[];
  /** A click: centre the view on this map pixel. */
  onJump: (x: number, y: number) => void;
}

/**
 * Spec section 14's "minimap with villager dots": the whole map small,
 * a dot for each villager in the open, and a box round what's on screen.
 * Click anywhere on it to look there.
 */
export function Minimap({ map, buildings, readView, readDots, onJump }: MinimapProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const grid = useMemo(() => groundGrid(map), [map]);
  const widthTiles = grid[0]?.length ?? 0;
  const heightTiles = grid.length;
  const width = widthTiles * PX_PER_TILE;
  const height = heightTiles * PX_PER_TILE;
  const scale = PX_PER_TILE / TILE_PX;

  // The ground and buildings: drawn once per map, or when something's built.
  useEffect(() => {
    const context = baseRef.current?.getContext('2d');
    if (!context) {
      return;
    }
    grid.forEach((row, y) => {
      row.forEach((ground, x) => {
        context.fillStyle = COLOURS[ground];
        context.fillRect(x * PX_PER_TILE, y * PX_PER_TILE, PX_PER_TILE, PX_PER_TILE);
      });
    });
    context.fillStyle = BUILDING_COLOUR;
    for (const building of buildings) {
      context.fillRect(
        Math.round(building.x * scale),
        Math.round(building.y * scale),
        Math.max(2, Math.round(building.width * scale)),
        Math.max(2, Math.round(building.height * scale)),
      );
    }
  }, [grid, buildings, scale]);

  // The view box and the dots: redrawn a few times a second.
  useEffect(() => {
    const draw = () => {
      const context = overlayRef.current?.getContext('2d');
      if (!context) {
        return;
      }
      context.clearRect(0, 0, width, height);
      context.fillStyle = DOT_COLOUR;
      for (const dot of readDots()) {
        context.fillRect(Math.round(dot.x * scale) - 1, Math.round(dot.y * scale) - 1, 3, 3);
      }
      const view = readView();
      if (view) {
        context.strokeStyle = VIEW_COLOUR;
        context.lineWidth = 1;
        context.strokeRect(
          Math.round(view.x * scale) + 0.5,
          Math.round(view.y * scale) + 0.5,
          Math.max(2, Math.round(view.width * scale) - 1),
          Math.max(2, Math.round(view.height * scale) - 1),
        );
      }
    };
    draw();
    const timer = window.setInterval(draw, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [readView, readDots, width, height, scale]);

  return (
    <div
      className="wood-panel relative p-0 leading-none"
      style={{ width: width + 24, height: height + 24 }}
    >
      <canvas
        ref={baseRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 [image-rendering:pixelated]"
      />
      <canvas
        ref={overlayRef}
        width={width}
        height={height}
        role="img"
        aria-label="Minimap: click to look there"
        className="absolute top-0 left-0 cursor-pointer [image-rendering:pixelated]"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * width;
          const py = ((event.clientY - rect.top) / rect.height) * height;
          onJump(px / scale, py / scale);
        }}
      />
    </div>
  );
}
