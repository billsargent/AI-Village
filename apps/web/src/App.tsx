import type { BuildingId, FurnitureKind, MapId } from '@ai-village/content';
import { useState } from 'react';
import { buildingsWithInteriors } from './interior-draw.js';
import { InteriorCanvas } from './InteriorCanvas.js';
import { useVillageFacts } from './village-api.js';
import { VillageCanvas } from './VillageCanvas.js';
import { whereaboutsNow } from './village-draw.js';

const MAP_LABELS: Record<MapId, string> = {
  main: 'Village',
  riverside: 'Riverside',
  forest: 'Forest',
};

/**
 * Town hall's bookshelf is its "archive cabinet" and its chest is the
 * "treasury chest" (spec section 9) - the furniture wired to a real
 * feature so far. Every other piece, in every building, stays inert
 * rather than offering a click that does nothing.
 */
const TOWN_HALL_INTERACTIVE_KINDS = new Set<FurnitureKind>(['bookshelf', 'chest']);

/**
 * Shop's table stands in for its "counter" (spec section 9: "Counter:
 * catalogue and prices. Stores: the goods ledger.") - the sheet has no
 * separate counter sprite, so this reuses the same table sprite already
 * placed there, same as every other building.
 */
const SHOP_INTERACTIVE_KINDS = new Set<FurnitureKind>(['table']);

/** "+3" / "-2" / "0", for yesterday's treasury change. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** "town-hall" -> "Town Hall", for a building id with no dedicated label yet. */
function titleCase(buildingId: string): string {
  return buildingId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function App() {
  const { data, isPending, isError, error } = useVillageFacts();
  const [map, setMap] = useState<MapId>('main');
  const [interiorBuildingId, setInteriorBuildingId] = useState<BuildingId | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showTreasury, setShowTreasury] = useState(false);
  const [showStores, setShowStores] = useState(false);

  if (isPending) {
    return <p className="p-4 text-slate-600">Loading the village...</p>;
  }

  if (isError) {
    return <p className="p-4 text-red-700">Couldn't reach the village: {error.message}</p>;
  }

  const whereabouts = whereaboutsNow(data, map);
  const furnished = buildingsWithInteriors(data.builtBuildingIds);

  return (
    <main className="p-4 text-slate-900">
      <h1 className="text-2xl font-semibold">AI-Village</h1>
      <p>
        {data.weekday}, {data.season} day {data.seasonDay}, year {data.year} -{' '}
        {String(data.hour).padStart(2, '0')}:{String(data.minuteOfHour).padStart(2, '0')},{' '}
        {data.weather}
        {data.isMarketDay ? ' (market day)' : ''}
        {data.festival ? ` - ${data.festival}` : ''}
      </p>
      <p>Population: {data.population}</p>
      <p>Treasury: {data.treasuryCoins} coins</p>
      {interiorBuildingId ? (
        <>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                setInteriorBuildingId(null);
                setShowArchive(false);
                setShowTreasury(false);
                setShowStores(false);
              }}
              className="rounded bg-slate-200 px-3 py-1 text-slate-900"
            >
              Back to village
            </button>
          </div>
          {interiorBuildingId === 'town-hall' && (
            <p className="mt-2 text-sm text-slate-600">
              Click the bookshelf for the archive, or the chest for the treasury.
            </p>
          )}
          {interiorBuildingId === 'shop' && (
            <p className="mt-2 text-sm text-slate-600">Click the counter for the stores.</p>
          )}
          <div className="mt-2">
            <InteriorCanvas
              buildingId={interiorBuildingId}
              interactiveKinds={
                interiorBuildingId === 'town-hall'
                  ? TOWN_HALL_INTERACTIVE_KINDS
                  : interiorBuildingId === 'shop'
                    ? SHOP_INTERACTIVE_KINDS
                    : undefined
              }
              onFurnitureClick={(kind) => {
                if (kind === 'bookshelf') {
                  setShowArchive(true);
                } else if (kind === 'chest') {
                  setShowTreasury(true);
                } else if (kind === 'table' && interiorBuildingId === 'shop') {
                  setShowStores(true);
                }
              }}
            />
          </div>
          {showArchive && (
            <div className="mt-2 max-w-md rounded border border-slate-300 bg-white p-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Archive</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowArchive(false);
                  }}
                  className="rounded bg-slate-200 px-2 py-0.5 text-sm text-slate-900"
                >
                  Close
                </button>
              </div>
              {data.recentChronicle.length > 0 ? (
                <ul className="mt-2 list-disc pl-5">
                  {data.recentChronicle.map((entry, index) => (
                    <li key={`${entry.minute}-${index}`}>{entry.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-slate-600">Nothing in the chronicle yet.</p>
              )}
            </div>
          )}
          {showTreasury && (
            <div className="mt-2 max-w-md rounded border border-slate-300 bg-white p-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Treasury</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowTreasury(false);
                  }}
                  className="rounded bg-slate-200 px-2 py-0.5 text-sm text-slate-900"
                >
                  Close
                </button>
              </div>
              <p className="mt-2">{data.treasuryCoins} coins</p>
              <p className="text-sm text-slate-600">
                {signed(data.treasuryDeltaYesterday)} coins since yesterday
              </p>
            </div>
          )}
          {showStores && (
            <div className="mt-2 max-w-md rounded border border-slate-300 bg-white p-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Stores</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowStores(false);
                  }}
                  className="rounded bg-slate-200 px-2 py-0.5 text-sm text-slate-900"
                >
                  Close
                </button>
              </div>
              {Object.keys(data.stores).length > 0 ? (
                <ul className="mt-2 list-disc pl-5">
                  {Object.entries(data.stores).map(([good, quantity]) => (
                    <li key={good}>
                      {titleCase(good)}: {quantity}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-slate-600">Nothing in the stores yet.</p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            {(Object.keys(MAP_LABELS) as MapId[]).map((mapId) => (
              <button
                key={mapId}
                type="button"
                onClick={() => {
                  setMap(mapId);
                }}
                className={
                  mapId === map
                    ? 'rounded bg-slate-700 px-3 py-1 text-white'
                    : 'rounded bg-slate-200 px-3 py-1 text-slate-900'
                }
              >
                {MAP_LABELS[mapId]}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <VillageCanvas data={data} map={map} />
          </div>
          {furnished.length > 0 && (
            <div className="mt-2 flex gap-2">
              {furnished.map((buildingId) => (
                <button
                  key={buildingId}
                  type="button"
                  onClick={() => {
                    setInteriorBuildingId(buildingId);
                  }}
                  className="rounded bg-amber-100 px-3 py-1 text-slate-900"
                >
                  Look inside {titleCase(buildingId)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {data.recentChronicle.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {data.recentChronicle.map((entry, index) => (
            <li key={`${entry.minute}-${index}`}>{entry.text}</li>
          ))}
        </ul>
      )}
      {whereabouts.length > 0 && (
        <>
          <h2 className="mt-4 font-semibold">Right now</h2>
          <ul className="list-disc pl-5">
            {whereabouts.map(({ villager, x, y }) => (
              <li key={villager.id}>
                {villager.id} is working at ({x}, {y})
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
