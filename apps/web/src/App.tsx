import { positionForWorker } from '@ai-village/content';
import { useVillageFacts, type VillagerFact, type VillageFacts } from './village-api.js';

interface Whereabouts {
  villager: VillagerFact;
  x: number;
  y: number;
}

/**
 * Who's currently placed at their built workplace, per `positionForWorker`
 * (spec section 8's plot layout). Each trade's workers fill that
 * workplace's plots in order, so two farmers at a one-field village both
 * show at the same plot - there's no per-villager instance assignment
 * yet, so this never guesses which exact field is "theirs".
 */
function whereaboutsNow(data: VillageFacts): readonly Whereabouts[] {
  const slotByWorksAt = new Map<string, number>();
  const whereabouts: Whereabouts[] = [];
  for (const villager of data.villagers) {
    const plot = positionForWorker(villager.tradeId, data.builtBuildingIds, data.phase);
    if (!plot) {
      continue;
    }
    const slot = slotByWorksAt.get(plot.buildingId) ?? 0;
    const placed = positionForWorker(villager.tradeId, data.builtBuildingIds, data.phase, slot);
    slotByWorksAt.set(plot.buildingId, slot + 1);
    if (placed) {
      whereabouts.push({ villager, x: placed.x, y: placed.y });
    }
  }
  return whereabouts;
}

export function App() {
  const { data, isPending, isError, error } = useVillageFacts();

  if (isPending) {
    return <p className="p-4 text-slate-600">Loading the village...</p>;
  }

  if (isError) {
    return <p className="p-4 text-red-700">Couldn't reach the village: {error.message}</p>;
  }

  const whereabouts = whereaboutsNow(data);

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
