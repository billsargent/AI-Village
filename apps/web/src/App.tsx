import type { BuildingId, FurnitureKind, MapId } from '@ai-village/content';
import { useState, type ReactNode } from 'react';
import { buildingsWithInteriors } from './interior-draw.js';
import { InteriorCanvas } from './InteriorCanvas.js';
import { SettingsPanel } from './SettingsPanel.js';
import {
  useClockStatus,
  useLiveUpdates,
  useSetClockSpeed,
  useVillageFacts,
  type ClockSpeed,
  type VillageFacts,
} from './village-api.js';
import { VillageCanvas } from './VillageCanvas.js';
import { whereaboutsNow } from './village-draw.js';

const MAP_LABELS: Record<MapId, string> = {
  main: 'Village',
  riverside: 'Riverside',
  forest: 'Forest',
};

/**
 * Town hall's bookshelf is its "archive cabinet", its chest the
 * "treasury chest" and its book the "almanac" (spec section 9) - the
 * furniture wired to a real feature so far. Every other piece, in every
 * building, stays inert rather than offering a click that does nothing.
 */
const TOWN_HALL_INTERACTIVE_KINDS = new Set<FurnitureKind>(['bookshelf', 'chest', 'book']);

/**
 * Shop's table stands in for its "counter" (spec section 9: "Counter:
 * catalogue and prices. Stores: the goods ledger.") - the sheet has no
 * separate counter sprite, so this reuses the same table sprite already
 * placed there, same as every other building.
 */
const SHOP_INTERACTIVE_KINDS = new Set<FurnitureKind>(['table']);

type FurniturePanel = 'archive' | 'treasury' | 'stores' | 'almanac';

/** "+3" / "-2" / "0", for yesterday's treasury change. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** "town-hall" -> "Town Hall", for an id with no dedicated label yet. */
function titleCase(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A framed dialog over the map, closed with its button or Escape. */
function Dialog({
  title,
  onClose,
  closeLabel = 'Close',
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-label={title}
        className="wood-panel flex max-h-full max-w-full flex-col gap-3 overflow-auto p-2"
      >
        <div className="flex items-center justify-between gap-6">
          <h2 className="text-2xl">{title}</h2>
          <button type="button" className="wood-button" onClick={onClose} autoFocus>
            {closeLabel}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Spec section 14's top bar, styled as a farming-game clock: day, time, season, weather, coins. */
function Clock({ data }: { data: VillageFacts }) {
  const time = `${String(data.hour).padStart(2, '0')}:${String(data.minuteOfHour).padStart(2, '0')}`;
  const label =
    `${data.weekday}, ${data.season} day ${data.seasonDay}, year ${data.year}, ${time}, ${data.weather}` +
    (data.isMarketDay ? ', market day' : '') +
    (data.festival ? `, ${data.festival}` : '');
  return (
    <div className="wood-panel w-52 px-1 text-center" aria-label={label} role="group">
      <div className="text-lg leading-tight">
        {data.weekday} {data.seasonDay}
      </div>
      <div className="text-4xl leading-none">{time}</div>
      <div className="text-sm text-ink-soft">
        {capitalise(data.season)}, year {data.year} - {capitalise(data.weather)}
      </div>
      {(data.isMarketDay || data.festival) && (
        <div className="text-sm">{data.festival ?? 'Market day'}</div>
      )}
      <div
        className="mt-1 flex items-center justify-center gap-2 border-t-2 border-parchment-dark pt-1 text-xl"
        aria-label={`Treasury: ${data.treasuryCoins} coins`}
      >
        <img src="/ui/coin.png" alt="" className="h-[21px] w-[21px] [image-rendering:pixelated]" />
        {data.treasuryCoins}
      </div>
      <SpeedControls />
    </div>
  );
}

const SPEEDS: readonly { speed: ClockSpeed; label: string; name: string }[] = [
  { speed: 0, label: 'II', name: 'Pause' },
  { speed: 1, label: '1x', name: 'Normal speed' },
  { speed: 2, label: '2x', name: 'Double speed' },
  { speed: 4, label: '4x', name: 'Four times speed' },
];

/** Spec section 14's speed controls: pause, 1x, 2x, 4x. */
function SpeedControls() {
  const { data: clock } = useClockStatus();
  const setSpeed = useSetClockSpeed();
  return (
    <div className="mt-1 flex justify-center gap-1" role="group" aria-label="Clock speed">
      {SPEEDS.map(({ speed, label, name }) => (
        <button
          key={speed}
          type="button"
          aria-label={name}
          aria-pressed={clock?.speed === speed}
          disabled={setSpeed.isPending}
          onClick={() => {
            setSpeed.mutate(speed);
          }}
          className="wood-button w-10 text-sm"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const { data, isPending, isError, error } = useVillageFacts();
  useLiveUpdates();
  const [map, setMap] = useState<MapId>('main');
  const [interiorBuildingId, setInteriorBuildingId] = useState<BuildingId | null>(null);
  const [panel, setPanel] = useState<FurniturePanel | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showJournal, setShowJournal] = useState(true);

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="map-text text-2xl">Loading the village...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="wood-panel p-2">Couldn't reach the village: {error.message}</p>
      </div>
    );
  }

  const whereabouts = whereaboutsNow(data, map);
  const furnished = buildingsWithInteriors(data.builtBuildingIds);

  const closeInterior = () => {
    setInteriorBuildingId(null);
    setPanel(null);
  };

  return (
    <main className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <VillageCanvas
          data={data}
          map={map}
          clickableBuildingIds={new Set(furnished)}
          onBuildingClick={(buildingId) => {
            setInteriorBuildingId(buildingId as BuildingId);
          }}
        />
      </div>

      {/* Top left: the village's name, its size, and the maps. */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col gap-2">
        <h1 className="map-text text-4xl leading-none">AI-Village</h1>
        <p className="map-text text-lg">Population: {data.population}</p>
        <div className="pointer-events-auto flex gap-1" role="group" aria-label="Maps">
          {(Object.keys(MAP_LABELS) as MapId[]).map((mapId) => (
            <button
              key={mapId}
              type="button"
              aria-pressed={mapId === map}
              onClick={() => {
                setMap(mapId);
              }}
              className="wood-button"
            >
              {MAP_LABELS[mapId]}
            </button>
          ))}
        </div>
      </div>

      {/* Top right: the clock, and the journal under it. */}
      <div className="absolute top-3 right-3 z-10 flex max-h-[calc(100%-1.5rem)] flex-col items-end gap-2">
        <Clock data={data} />
        <div className="flex gap-1">
          <button
            type="button"
            className="wood-button"
            aria-expanded={showJournal}
            onClick={() => {
              setShowJournal((shown) => !shown);
            }}
          >
            Journal
          </button>
          <button
            type="button"
            className="wood-button"
            onClick={() => {
              setShowSettings(true);
            }}
          >
            Settings
          </button>
        </div>
        {showJournal && (
          <div className="wood-panel flex w-72 min-h-0 flex-col gap-3 overflow-auto p-1 text-base">
            {furnished.length > 0 && (
              <section>
                <h2 className="text-lg">Places</h2>
                <div className="mt-1 flex flex-wrap gap-1">
                  {furnished.map((buildingId) => (
                    <button
                      key={buildingId}
                      type="button"
                      className="wood-button text-sm"
                      onClick={() => {
                        setInteriorBuildingId(buildingId);
                      }}
                    >
                      Look inside {titleCase(buildingId)}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="text-lg">Right now</h2>
              {whereabouts.length > 0 ? (
                <ul className="list-disc pl-5 text-sm">
                  {whereabouts.map(({ villager, x, y }) => (
                    <li key={villager.id}>
                      {villager.id} is working at ({x}, {y})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">Nobody's at work on this map.</p>
              )}
            </section>
            <section>
              <h2 className="text-lg">Chronicle</h2>
              {data.recentChronicle.length > 0 ? (
                <ul className="list-disc pl-5 text-sm">
                  {data.recentChronicle.map((entry, index) => (
                    <li key={`${entry.minute}-${index}`}>{entry.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">Nothing in the chronicle yet.</p>
              )}
            </section>
          </div>
        )}
      </div>

      <p className="map-text pointer-events-none absolute bottom-3 left-3 z-10 text-sm">
        Drag or WASD to look around - click a building to go inside
      </p>

      {interiorBuildingId && (
        <Dialog
          title={titleCase(interiorBuildingId)}
          onClose={closeInterior}
          closeLabel="Back to village"
        >
          {interiorBuildingId === 'town-hall' && (
            <p className="text-sm text-ink-soft">
              Click the bookshelf for the archive, the chest for the treasury, or the book for the
              almanac.
            </p>
          )}
          {interiorBuildingId === 'shop' && (
            <p className="text-sm text-ink-soft">Click the counter for the stores.</p>
          )}
          <div className="flex flex-wrap items-start gap-3">
            <div className="border-4 border-ink/70">
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
                    setPanel('archive');
                  } else if (kind === 'chest') {
                    setPanel('treasury');
                  } else if (kind === 'book') {
                    setPanel('almanac');
                  } else if (kind === 'table' && interiorBuildingId === 'shop') {
                    setPanel('stores');
                  }
                }}
              />
            </div>
            {panel && (
              <FurnitureDetail
                panel={panel}
                data={data}
                onClose={() => {
                  setPanel(null);
                }}
              />
            )}
          </div>
        </Dialog>
      )}

      {showSettings && (
        <Dialog
          title="Settings"
          onClose={() => {
            setShowSettings(false);
          }}
        >
          <SettingsPanel />
        </Dialog>
      )}
    </main>
  );
}

const PANEL_TITLES: Record<FurniturePanel, string> = {
  archive: 'Archive',
  treasury: 'Treasury',
  stores: 'Stores',
  almanac: 'Almanac',
};

/** What one clicked piece of furniture opens, on a parchment page beside the room. */
function FurnitureDetail({
  panel,
  data,
  onClose,
}: {
  panel: FurniturePanel;
  data: VillageFacts;
  onClose: () => void;
}) {
  return (
    <section className="w-64 border-4 border-parchment-dark bg-parchment-dark/40 p-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xl">{PANEL_TITLES[panel]}</h3>
        <button type="button" className="wood-button text-sm" onClick={onClose}>
          Close
        </button>
      </div>
      {panel === 'archive' &&
        (data.recentChronicle.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {data.recentChronicle.map((entry, index) => (
              <li key={`${entry.minute}-${index}`}>{entry.text}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Nothing in the chronicle yet.</p>
        ))}
      {panel === 'treasury' && (
        <>
          <p className="mt-2 flex items-center gap-2 text-2xl">
            <img
              src="/ui/coin.png"
              alt=""
              className="h-[21px] w-[21px] [image-rendering:pixelated]"
            />
            {data.treasuryCoins} coins
          </p>
          <p className="text-sm text-ink-soft">
            {signed(data.treasuryDeltaYesterday)} coins since yesterday
          </p>
        </>
      )}
      {panel === 'stores' &&
        (Object.keys(data.stores).length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {Object.entries(data.stores).map(([good, quantity]) => (
              <li key={good}>
                {titleCase(good)}: {quantity}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Nothing in the stores yet.</p>
        ))}
      {panel === 'almanac' && (
        <>
          <p className="mt-2 text-sm">
            Today: {data.weekday}, {data.season} day {data.seasonDay}, year {data.year}
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {data.festivals.map((festival) => (
              <li key={festival.name}>
                {festival.name} - {festival.season} day {festival.seasonDay}
                {festival.name === data.festival ? ' (today!)' : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
