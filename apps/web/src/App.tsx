import type { BuildingId, FurnitureKind, MapId } from '@ai-village/content';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { buildingSummary, namesList } from './building-card.js';
import { ChatPanel } from './ChatPanel.js';
import { CommandPalette, type PaletteItem } from './CommandPalette.js';
import { applyTextSize, loadTextSize } from './text-size.js';
import { VillagerCardPanel } from './VillagerCardPanel.js';
import { walkPace } from './atmosphere.js';
import { buildingsWithInteriors } from './interior-draw.js';
import { InboxPanel } from './InboxPanel.js';
import { SettingsPanel } from './SettingsPanel.js';
import {
  useClockStatus,
  useLiveUpdates,
  usePendingApprovalCount,
  usePinNote,
  useSetClockSpeed,
  useVillageFacts,
  type ClockSpeed,
  type VillageFacts,
} from './village-api.js';
import { VillageCanvas, type RoomView } from './VillageCanvas.js';
import { villagersInside, whereaboutsNow } from './village-draw.js';

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
          // Handled: the room behind shouldn't take this Escape as its own.
          event.preventDefault();
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
  const [room, setRoom] = useState<RoomView | null>(null);
  // Bumped on every step through a door, so the fade through dark plays again.
  const [doorways, setDoorways] = useState(0);
  const [panel, setPanel] = useState<FurniturePanel | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showJournal, setShowJournal] = useState(true);
  const [showInbox, setShowInbox] = useState(false);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [buildingCard, setBuildingCard] = useState<{ buildingId: string; slot: number } | null>(
    null,
  );
  const [following, setFollowing] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const pendingApprovals = usePendingApprovalCount();
  const { data: clockStatus } = useClockStatus();
  const setSpeed = useSetClockSpeed();
  // The speed to go back to when Space resumes a paused clock.
  const lastSpeedRef = useRef<ClockSpeed>(1);
  if (clockStatus && clockStatus.speed !== 0 && !clockStatus.paused) {
    lastSpeedRef.current = clockStatus.speed;
  }
  const clockPaused = clockStatus ? clockStatus.paused || clockStatus.speed === 0 : false;
  const firstVillagerId = data?.villagers[0]?.id ?? null;
  const overlayOpen =
    showSettings ||
    showInbox ||
    showPalette ||
    chatWith !== null ||
    cardFor !== null ||
    buildingCard !== null;

  // The owner's text size, from last time (spec section 14).
  useEffect(() => {
    applyTextSize(loadTextSize());
  }, []);

  const enterRoom = (next: RoomView) => {
    setRoom(next);
    setPanel(null);
    setDoorways((n) => n + 1);
  };
  const leaveRoom = () => {
    setRoom(null);
    setPanel(null);
    setDoorways((n) => n + 1);
  };
  const leaveRoomRef = useRef(leaveRoom);
  leaveRoomRef.current = leaveRoom;

  // Spec section 14's keys: Ctrl+K the command palette, Space to pause, C
  // opens the chat (with the first villager), I the inbox.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowPalette((shown) => !shown);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
        // A focused button takes Space and Enter for itself.
        if (target.tagName !== 'BUTTON' || event.key === ' ') {
          return;
        }
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === ' ' && !overlayOpen) {
        event.preventDefault();
        setSpeed.mutate(clockPaused ? lastSpeedRef.current : 0);
        return;
      }
      // Escape steps back out: first off an open furniture panel, then out of the room.
      if (event.key === 'Escape' && room && !overlayOpen && !event.defaultPrevented) {
        if (panel) {
          setPanel(null);
        } else {
          leaveRoomRef.current();
        }
        return;
      }
      if (event.key === 'c' && firstVillagerId) {
        setChatWith((current) => current ?? firstVillagerId);
      } else if (event.key === 'i') {
        setShowInbox(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [firstVillagerId, room, panel, overlayOpen, clockPaused, setSpeed]);

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

  const whereabouts = whereaboutsNow(data);
  const furnished = buildingsWithInteriors(data.builtBuildingIds);

  const occupants = room ? villagersInside(data, room.buildingId, room.slot) : [];

  // Everything the command palette can find (spec section 14).
  const paletteItems: PaletteItem[] = [
    ...data.villagers.flatMap((villager) => {
      const name = capitalise(villager.id);
      const trade = villager.role === 'mayor' ? 'the mayor' : villager.tradeId;
      return [
        {
          id: `meet-${villager.id}`,
          label: name,
          hint: `Meet ${trade}`,
          keywords: villager.tradeId,
          run: () => {
            setCardFor(villager.id);
          },
        },
        {
          id: `chat-${villager.id}`,
          label: `Chat with ${name}`,
          hint: 'Chat',
          keywords: villager.tradeId,
          run: () => {
            setChatWith(villager.id);
          },
        },
        {
          id: `follow-${villager.id}`,
          label: `Follow ${name}`,
          hint: 'Follow on the map',
          keywords: villager.tradeId,
          run: () => {
            setRoom(null);
            setFollowing(villager.id);
          },
        },
      ];
    }),
    ...furnished.map((buildingId) => ({
      id: `enter-${buildingId}`,
      label: titleCase(buildingId),
      hint: 'Go inside',
      keywords: 'place building room',
      run: () => {
        enterRoom({ buildingId });
      },
    })),
    ...(Object.keys(MAP_LABELS) as MapId[]).map((mapId) => ({
      id: `map-${mapId}`,
      label: MAP_LABELS[mapId],
      hint: 'Go to this map',
      keywords: 'map place',
      run: () => {
        setRoom(null);
        setMap(mapId);
      },
    })),
    {
      id: 'inbox',
      label: 'Inbox',
      hint: 'Approvals waiting on you',
      keywords: 'approvals',
      run: () => {
        setShowInbox(true);
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      hint: 'Models, budget, text size',
      keywords: 'budget key text size',
      run: () => {
        setShowSettings(true);
      },
    },
    {
      id: 'journal',
      label: 'Journal',
      hint: showJournal ? 'Fold it away' : 'Open it',
      keywords: 'chronicle notice board people',
      run: () => {
        setShowJournal((shown) => !shown);
      },
    },
    {
      id: 'pause',
      label: clockPaused ? 'Resume' : 'Pause',
      hint: 'The village clock',
      keywords: 'clock speed time',
      run: () => {
        setSpeed.mutate(clockPaused ? lastSpeedRef.current : 0);
      },
    },
    ...([1, 2, 4] as const).map((speed) => ({
      id: `speed-${speed}`,
      label: `${speed}x speed`,
      hint: 'The village clock',
      keywords: 'clock speed time faster',
      run: () => {
        setSpeed.mutate(speed);
      },
    })),
  ];

  return (
    <main className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <VillageCanvas
          data={data}
          map={map}
          onBuildingClick={(buildingId, slot) => {
            setBuildingCard({ buildingId, slot });
          }}
          follow={following}
          onStopFollowing={() => {
            setFollowing(null);
          }}
          room={room}
          pace={walkPace(clockStatus, data.weather)}
          interactiveKinds={
            room?.buildingId === 'town-hall'
              ? TOWN_HALL_INTERACTIVE_KINDS
              : room?.buildingId === 'shop'
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
            } else if (kind === 'table' && room?.buildingId === 'shop') {
              setPanel('stores');
            }
          }}
          onVillagerClick={(villagerId) => {
            setCardFor(villagerId);
          }}
        />
      </div>

      {/* Stepping through a door: a moment of dark, then the other side. */}
      {doorways > 0 && (
        <div
          key={doorways}
          aria-hidden="true"
          className="door-fade pointer-events-none absolute inset-0 z-[6] bg-[#16100b]"
        />
      )}

      {/* Top left: the village's name, its size, and the maps. */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col gap-2">
        <h1 className="map-text text-4xl leading-none">AI-Village</h1>
        <p className="map-text text-lg">Population: {data.population}</p>
        <div
          className={`pointer-events-auto flex gap-1 ${room ? 'hidden' : ''}`}
          role="group"
          aria-label="Maps"
        >
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
            aria-label={
              pendingApprovals === 0 ? 'Inbox' : `Inbox: ${pendingApprovals} waiting on you`
            }
            onClick={() => {
              setShowInbox(true);
            }}
          >
            Inbox
            {pendingApprovals > 0 && (
              <span className="ml-1 rounded-sm bg-[#b3261e] px-1 text-[#fff6dc]">
                {pendingApprovals}
              </span>
            )}
          </button>
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
                        enterRoom({ buildingId });
                      }}
                    >
                      Look inside {titleCase(buildingId)}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="text-lg">People</h2>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {data.villagers.map((villager) => (
                  <li key={villager.id} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left underline decoration-dotted underline-offset-2"
                      aria-label={`About ${capitalise(villager.id)}`}
                      onClick={() => {
                        setCardFor(villager.id);
                      }}
                    >
                      {capitalise(villager.id)},{' '}
                      {villager.role === 'mayor' ? 'the mayor' : villager.tradeId}
                    </button>
                    <button
                      type="button"
                      className="wood-button text-sm"
                      aria-label={`Chat with ${capitalise(villager.id)}`}
                      onClick={() => {
                        setChatWith(villager.id);
                      }}
                    >
                      Chat
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-lg">Right now</h2>
              {whereabouts.length > 0 ? (
                <ul className="list-disc pl-5 text-sm">
                  {whereabouts.map(({ villager, where }) => (
                    <li key={villager.id}>
                      {capitalise(villager.id)} is {where}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">Nobody lives here yet.</p>
              )}
            </section>
            <section>
              <h2 className="text-lg">Notice board</h2>
              {data.boardPosts.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {data.boardPosts.map((post, index) => (
                    <li
                      key={`${post.postedDay}-${index}`}
                      className="border-l-4 border-parchment-dark pl-2"
                    >
                      "{post.text}"{' '}
                      <span className="text-ink-soft">
                        - {post.author === 'owner' ? 'you' : capitalise(post.author)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">Nothing pinned up yet.</p>
              )}
              <PinNote />
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

      {following && !room && (
        <div className="wood-panel absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 px-2">
          <span>Following {capitalise(following)}</span>
          <button
            type="button"
            className="wood-button text-sm"
            onClick={() => {
              setFollowing(null);
            }}
          >
            Stop
          </button>
        </div>
      )}

      {showPalette && (
        <CommandPalette
          items={paletteItems}
          onClose={() => {
            setShowPalette(false);
          }}
        />
      )}

      {room ? (
        <>
          {/* Inside: the room's name over the door, who's in, and the way out. */}
          <section
            aria-label={`Inside the ${titleCase(room.buildingId)}`}
            className="wood-panel absolute top-3 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 px-2 text-center"
          >
            <h2 className="text-2xl leading-none">{titleCase(room.buildingId)}</h2>
            <p className="text-sm text-ink-soft">
              {occupants.length === 0
                ? 'Nobody is in.'
                : `${occupants.map((o) => capitalise(o.villager.id)).join(' and ')} ${occupants.length === 1 ? 'is' : 'are'} here.`}
            </p>
            <p className="max-w-sm text-xs">
              <span>
                {room.buildingId === 'town-hall'
                  ? 'Click the bookshelf for the archive, the chest for the treasury, or the book for the almanac.'
                  : room.buildingId === 'shop'
                    ? 'Click the counter for the stores.'
                    : occupants.length > 0
                      ? 'Click someone to meet them.'
                      : ''}
              </span>{' '}
              <span>Esc to leave.</span>
            </p>
            <button type="button" className="wood-button text-sm" onClick={leaveRoom}>
              Back to village
            </button>
          </section>
          {panel && (
            <div className="wood-panel absolute top-1/2 left-3 z-10 max-h-[80%] -translate-y-1/2 overflow-auto">
              <FurnitureDetail
                panel={panel}
                data={data}
                onClose={() => {
                  setPanel(null);
                }}
              />
            </div>
          )}
        </>
      ) : (
        <p className="map-text pointer-events-none absolute bottom-3 left-3 z-10 text-sm">
          Drag or WASD to look around - click a building or a villager - Ctrl+K to find anything
        </p>
      )}

      {cardFor && (
        <Dialog
          title={capitalise(cardFor)}
          onClose={() => {
            setCardFor(null);
          }}
        >
          <VillagerCardPanel
            villagerId={cardFor}
            where={whereabouts.find((entry) => entry.villager.id === cardFor)?.where ?? null}
            onChat={() => {
              setCardFor(null);
              setChatWith(cardFor);
            }}
            onFollow={() => {
              setCardFor(null);
              setRoom(null);
              setFollowing(cardFor);
            }}
          />
        </Dialog>
      )}

      {buildingCard &&
        (() => {
          const summary = buildingSummary(data, buildingCard.buildingId, buildingCard.slot);
          return (
            <Dialog
              title={summary.title}
              onClose={() => {
                setBuildingCard(null);
              }}
            >
              <div className="flex w-72 flex-col gap-2 text-sm">
                {summary.places > 0 && (
                  <p>
                    {summary.workers.length > 0
                      ? `Worked by ${namesList(summary.workers)}`
                      : 'Nobody works here yet'}{' '}
                    ({summary.workers.length} of {summary.places}{' '}
                    {summary.places === 1 ? 'place' : 'places'}).
                  </p>
                )}
                {summary.residents.length > 0 && <p>Home to {namesList(summary.residents)}.</p>}
                <p>
                  {summary.inside.length > 0
                    ? `${namesList(summary.inside)} ${summary.inside.length === 1 ? 'is' : 'are'} inside now.`
                    : 'Nobody is inside right now.'}
                </p>
                {[...summary.workers, ...summary.residents]
                  .filter((villager, index, all) => all.indexOf(villager) === index)
                  .map((villager) => (
                    <button
                      key={villager.id}
                      type="button"
                      className="text-left underline decoration-dotted underline-offset-2"
                      onClick={() => {
                        setBuildingCard(null);
                        setCardFor(villager.id);
                      }}
                    >
                      About {capitalise(villager.id)}
                    </button>
                  ))}
                {summary.canEnter ? (
                  <button
                    type="button"
                    className="wood-button self-start"
                    onClick={() => {
                      setBuildingCard(null);
                      enterRoom({
                        buildingId: summary.buildingId as BuildingId,
                        slot: summary.slot,
                      });
                    }}
                  >
                    Go inside
                  </button>
                ) : (
                  <p className="text-ink-soft">There's no room to look inside yet.</p>
                )}
              </div>
            </Dialog>
          );
        })()}

      {chatWith && (
        <Dialog
          title={`Chat with ${capitalise(chatWith)}`}
          onClose={() => {
            setChatWith(null);
          }}
        >
          <ChatPanel
            villagerId={chatWith}
            tradeId={data.villagers.find((villager) => villager.id === chatWith)?.tradeId ?? ''}
          />
        </Dialog>
      )}

      {showInbox && (
        <Dialog
          title="Inbox"
          onClose={() => {
            setShowInbox(false);
          }}
        >
          <InboxPanel />
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
/** A note of the owner's own for the board, which villagers read like any other. */
function PinNote() {
  const [text, setText] = useState('');
  const pin = usePinNote();
  return (
    <form
      className="mt-1 flex gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const note = text.trim();
        if (note.length === 0) {
          return;
        }
        pin.mutate(note, {
          onSuccess: () => {
            setText('');
          },
        });
      }}
    >
      <input
        type="text"
        aria-label="A note for the board"
        placeholder="Pin a note..."
        maxLength={200}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        className="min-w-0 flex-1 border-2 border-parchment-dark bg-parchment px-1 text-sm"
      />
      <button
        type="submit"
        className="wood-button text-sm"
        disabled={pin.isPending || text.trim().length === 0}
      >
        Pin it
      </button>
    </form>
  );
}

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
