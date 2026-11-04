import type { BuildingId, MapId } from '@ai-village/content';
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
              }}
              className="rounded bg-slate-200 px-3 py-1 text-slate-900"
            >
              Back to village
            </button>
          </div>
          <div className="mt-2">
            <InteriorCanvas buildingId={interiorBuildingId} />
          </div>
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
