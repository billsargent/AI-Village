import { BUILDINGS, getPlot, TILE_PX, type MapId } from '@ai-village/content';
import { useState } from 'react';
import { titleCase } from './building-card.js';
import { useBuild, type VillageFacts } from './village-api.js';
import type { PixelRect } from './village-draw.js';

const MAP_NAMES: Record<MapId, string> = {
  main: 'the village',
  riverside: 'Riverside',
  forest: 'the forest',
};

export interface BuildOption {
  buildingId: string;
  coins: number;
  materials: readonly { good: string; qty: number }[];
  days: number;
  /** Null when it can be built now; otherwise why not, in a few words. */
  blocked: string | null;
  /** Where it would go, if there's room. */
  plot: (PixelRect & { map: MapId }) | null;
}

/**
 * Everything the owner could build, and what stands in the way of each:
 * already built or going up (for one-off buildings), too few villagers,
 * no plot left, or not enough coins or materials.
 */
export function buildOptions(data: VillageFacts): readonly BuildOption[] {
  return BUILDINGS.map((building) => {
    const built = data.builtBuildingIds.filter((id) => id === building.id).length;
    const going = data.constructionSites.filter((site) => site.buildingId === building.id).length;
    const plotInfo = getPlot(building.id, built + going);
    const plot = plotInfo
      ? {
          map: plotInfo.map,
          x: plotInfo.x * TILE_PX,
          y: plotInfo.y * TILE_PX,
          width: building.footprintTiles[0] * TILE_PX,
          height: building.footprintTiles[1] * TILE_PX,
        }
      : null;
    const short = building.cost.materials.find(
      (material) => (data.stores[material.good] ?? 0) < material.qty,
    );
    const blocked =
      !building.multiInstance && built > 0
        ? 'Already built'
        : !building.multiInstance && going > 0
          ? 'Being built'
          : building.unlocksAtPopulation !== null && data.population < building.unlocksAtPopulation
            ? `Needs ${building.unlocksAtPopulation} villagers`
            : !plot
              ? 'No room for another'
              : data.treasuryCoins < building.cost.coins
                ? `Needs ${building.cost.coins} coins`
                : short
                  ? `Needs ${short.qty} ${short.good}`
                  : null;
    return {
      buildingId: building.id,
      coins: building.cost.coins,
      materials: building.cost.materials,
      days: building.buildDays,
      blocked,
      plot,
    };
  });
}

/**
 * The owner's own building (spec section 6's buildings table): every
 * building, its cost and time, and a Build button for the ones the
 * village can have now. Hovering over one outlines its plot on the map.
 */
export function BuildPanel({
  data,
  onHighlight,
}: {
  data: VillageFacts;
  onHighlight: (plot: (PixelRect & { map: MapId }) | null) => void;
}) {
  const build = useBuild();
  const [started, setStarted] = useState<string | null>(null);
  const options = buildOptions(data);
  return (
    <div className="flex w-[34rem] max-w-full flex-col gap-2">
      <p className="text-sm text-ink-soft">
        The treasury has {data.treasuryCoins} coins. Hover over a building to see where it would go.
      </p>
      {build.isError && (
        <p className="text-sm text-red-800">Couldn't build: {build.error.message}</p>
      )}
      {started && !build.isError && (
        <p role="status" className="text-sm">
          Work has begun on the {titleCase(started).toLowerCase()}.
        </p>
      )}
      <ul className="flex max-h-[60vh] flex-col gap-1 overflow-auto">
        {options.map((option) => (
          <li
            key={option.buildingId}
            className="flex items-center justify-between gap-3 border-b border-parchment-dark py-1"
            onMouseEnter={() => {
              onHighlight(option.plot);
            }}
            onMouseLeave={() => {
              onHighlight(null);
            }}
          >
            <div>
              <div>
                {titleCase(option.buildingId)}
                {option.plot && option.plot.map !== 'main' && (
                  <span className="text-sm text-ink-soft"> - in {MAP_NAMES[option.plot.map]}</span>
                )}
              </div>
              <div className="text-sm text-ink-soft">
                {option.coins} coins
                {option.materials.map((m) => `, ${m.qty} ${m.good}`).join('')}
                {' - '}
                {option.days === 0
                  ? 'ready at once'
                  : `${option.days} ${option.days === 1 ? 'day' : 'days'}`}
              </div>
            </div>
            {option.blocked ? (
              <span className="text-sm whitespace-nowrap text-ink-soft">{option.blocked}</span>
            ) : (
              <button
                type="button"
                className="wood-button text-sm"
                aria-label={`Build the ${titleCase(option.buildingId)}`}
                disabled={build.isPending}
                onClick={() => {
                  build.mutate(option.buildingId, {
                    onSuccess: () => {
                      setStarted(option.buildingId);
                    },
                  });
                }}
              >
                Build
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
