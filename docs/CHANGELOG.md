# Changelog

## Unreleased

- Project scaffolding: pnpm workspace, TypeScript, lint/format, dependency
  boundaries, CI, GitHub labels and templates (#8).
- Village content tables: goods, trades, buildings and traits (#21).
- The headless sim runtime: seeded randomness, the village clock, the
  calendar, weather, the ledger, and the `pnpm sim run` headless runner
  wiring the fixed system order (#21).
- The work, wage, upkeep and scarcity-pricing systems (#27).
- Needs, mood and eating, including relief baskets so nobody starves (#33).
- Happening cards, the storyteller, and the chronicle (#38).
- Two stints a day and the relationships/affinity system, unlocking the
  Quarrel and Proposal happenings (#43).
- `.gitattributes` forcing LF line endings (#45).
- Database persistence: a Drizzle/libsql schema, migrations, and
  repositories for everything the sim simulates, with a round-trip test
  (run a village, save it, reload it, confirm it matches) (#54).
- The agent layer's facts(), tool registry, and risk/approval decisions -
  the parts of the agent that need no model provider or keys (#60).
- A DeepSeek model client, purpose-based model routing, the meter, and a
  minimal `runChat` runner tying facts/models/meter/client together - fully
  testable against scripted fakes, with no real API key or network call yet
  (#67).
- `apply(command)`: `GiveGift` and `ProposeBuilding`, the sim's write side
  of the sim-agent interface (#68).
- The tool registry's first two real tools, `gift` and `propose_building`,
  wired to run against the sim via `apply()` (#73).
- The DeepSeek client's tool-calling support: `tools` in the request,
  `tool_calls` in the response, and the assistant/tool-reply message
  shapes a real tool-calling turn needs (#76).
- `runTurn`: the chat turn loop, calling the model with a villager's tools,
  running approved calls through the registry and `apply()`, feeding
  results back, and repeating up to the chat purpose's maxSteps (#78).
- A `weatherStreak` happening condition, unlocking "bumper harvest", plus
  real mechanical effects (not just a chronicle line) for bumper harvest
  and visiting bard (#80).
- Multi-instance buildings (fields, cottages), a `freeBedAvailable`
  happening condition unlocking "a traveller asks for work", and a DB
  migration so more than one instance of a building can be persisted
  (#82).
- A minimal downriver orders system (a seeded daily chance of a new
  order, automatic delivery with a late-order half-reward penalty), the
  `AcceptOrder`/`DeclineOrder` commands, their tool-registry wiring, and
  DB persistence for orders (#84).
- A minimal village notice board (posts archived after 14 days), the
  `PostOnBoard` command, its tool-registry wiring, and DB persistence
  (#86).
- Villager roles: a `role` field (defaulting to `villager`, at most one
  Mayor per village), flowing through `facts()` - the spec's own facts
  block shows the Mayor by role rather than trade - and DB persistence
  (#88).
- `CallVote`: a generic "ask the village and tally" vote, closing out
  `apply(command)`'s last named command. Every villager casts one
  seeded-random vote among the options, tallied immediately (#90).
- The approvals inbox: a tool call needing the owner's approval is now
  queued, with a rendered preview, instead of just reported and dropped.
  Approving a queued request runs the tool now, against the current
  state - declining just records the decision (#92).
- The full prompt layout (spec section 11): a static charter, the
  village-wide and a Mayor-specific playbook, the villager card, the
  facts block, and real conversation history (an optional last-10
  messages plus an older-turns summary). Memories/promises and "who
  else is here" are left as pre-rendered slots for the modules that
  will produce them (#94).
- Villager memory and promises (spec sections 7 and 15): the `remember`
  and `promise` tools, an owner-side `DecidePromise` and `ThankVillager`
  (mood lift + an auto-recorded memory), and a renderer feeding #94's
  `memoriesText` prompt slot with the top memories and open promises.
  The diary layer is left out - the sim only advances by whole days,
  not hours, so an hourly diary isn't meaningfully buildable yet (#96).
- Real model pricing (`content/prices.ts`) wired into the meter, so
  `costUsd` is a real $ figure instead of 0, plus a budget check (the
  monthly ceiling - never applied to the owner's own chat - and an
  off-by-default per-villager-per-day cap) gating `runChat`/`runTurn`
  before a call is made. The daily soft budget, chatter share and
  per-work-session ask each gate purposes that aren't built yet, so
  there's nothing real to enforce for them (#98).
- A real Hono server for `apps/server`: `createApp()` returns an app with
  a `GET /api/village` endpoint serving a bootstrapped village's facts
  snapshot as JSON, plus a `pnpm --filter @ai-village/server run dev`
  entry point that starts it on a real port. Persistence, auth and any
  route beyond this one read endpoint are left for later batches of the
  web renderer/map/interiors epic (#101).
- A real Vite + React 19 + Tailwind 4 + TanStack Query client for
  `apps/web`: a page that fetches `/api/village` (through a dev-time Vite
  proxy to the server) and shows the weekday, season, weather, market
  day, population, treasury and recent chronicle, with loading and error
  states. PixiJS rendering, the Tiled map and interiors, and any art
  pipeline work are left for later batches - they need assets that don't
  exist in this repo yet (#103).
- A fixed plot layout for every building (spec section 8's districts,
  plus the Riverside and Forest side maps), validated for map bounds and
  overlapping footprints, and `positionForWorker`, deriving where a
  villager working a given trade is right now from their workplace, its
  build state and the day's phase - `undefined`, not a guess, whenever
  that can't be said honestly (off-duty hours; villagers have no
  assigned home yet). `FactsSnapshot` gains `phase` so this is usable
  end to end; `apps/web` shows a "Right now" list proving it reaches the
  browser. Still plain text - the PixiJS canvas, real Tiled maps and art
  are later batches (#105).
- Picked art sources (spec section 10): Serene Village Revamped (LimeZu,
  CC-BY 4.0) for terrain and village buildings, Ninja Adventure (CC0)
  for characters/props/icons/sounds. LimeZu's companion "Modern
  Interiors" pack was ruled out - its EULA forbids redistribution, which
  fails this repo's own public-redistribution rule. Both approved packs
  are now downloaded and vendored locally under the git-ignored
  `art/vendor/` (#107, a human step - needs a real browser/itch.io
  session).
- `pnpm art:check`: parses `docs/ART_CREDITS.md`'s table and checks
  every file under `art/src` is listed with an allowed licence (CC0,
  CC-BY, OFL, or the project's own hand-made work), and every listed
  file actually exists. Wired into CI. Runs clean today since `art/src`
  is still empty - this is the gate, ahead of any art actually being
  copied in (#109).
- Added the original Serene Village pack (LimeZu, CC-BY 4.0 - same
  artist and licence already approved for Serene Village Revamped) as a
  third art source, for generic interior furniture (beds, table,
  bookshelf, chairs, chest, rug, plants). Trade-specific furniture
  (anvil, forge, altar, millstones, loom, pews) is still a gap -
  deferred to hand-made Aseprite work, same as spec section 10 already
  planned for missing buildings.
- A real PixiJS canvas drawing the village from the vendored art at its
  real plot positions: `content/sprites.ts` picks specific pixel
  rectangles within the art/src sheets for the grass tile, two
  buildings (town-hall, cottage) and one villager pose; `VillageCanvas`
  loads and crops them with nearest-neighbour scaling, no smoothing.
  `apps/server`'s bootstrap village now seeds a small real starting
  scenario (a Mayor at the town hall, a farmer, a cottage, the clock set
  to a work-stint hour) so there's something real to render. Verified
  with a real headless-Chromium screenshot of the running dev servers.
  Left over: sprites for the rest of `BUILDINGS`, and a real scrollable
  camera once there's an actual Tiled map (#112).
- Sprites for the rest of `BUILDINGS` except `clocktower` (still tall
  and narrow with nothing in this tileset reading as a tower, and
  late-game anyway) - 15 new deliberate picks across four house shapes
  and three roof colours, plus a walled garden, a bush cluster, a dock
  and a worked-ground tile. Also fixes a real bug found while verifying
  them: `riverside-jetty`, `smokehouse` and `forest-hut` live on the
  Riverside/Forest maps, not the main map, but were being drawn using
  their own map's coordinates as main-map coordinates - and skewing the
  camera fit for everything else in the process. Both are later work
  once there's a way to view those maps at all (#114).
- Distinct per-villager appearances: every villager used to render as
  the same single sprite. `spriteForVillager(villagerId)` now picks
  from 8 of Ninja Adventure's plain "villager" archetypes (Villager2/3,
  Boy, Child, Woman, OldMan, OldWoman, alongside the one already in
  use) via a stable string hash, so the same villager always looks the
  same without a new "look" field on `WorkerAssignment` yet (#116).
- Riverside and Forest map navigation: the draw-planning functions
  (`builtBuildingsNow`, `whereaboutsNow`, `planCanvasDraw`) now take
  which map to draw instead of always assuming the main one, and
  `apps/web` gets a Village/Riverside/Forest switcher so the buildings
  and villagers already placed on those side maps (since #114) are
  actually reachable. An empty side map renders as a real,
  correctly-sized patch of grass (its own `MAPS` dimensions from spec
  section 8), not the main map's arbitrary placeholder box (#118).
- Interiors: vendors the original Serene Village pack's actual interior
  sheet into `art/src` (credited in `docs/ART_CREDITS.md`), picks 9
  furniture sprites off it (bed, nightstand, wardrobe, table, bookshelf,
  chair, two rugs, a plant) the same deliberate, grid-read way the
  outdoor building sprites were picked, and gives `cottage` and
  `town-hall` - the two buildings in the bootstrap scenario - an
  explicit furniture layout. `apps/web` gets a "Look inside" button per
  furnished built building, rendering a small fixed-camera PixiJS scene
  (`InteriorCanvas`) with a way back to the village view. No villagers
  are drawn inside - there's no assigned-home data yet, so this never
  guesses who's "home". Every other built building has nowhere to look
  inside yet, the same precedent as `clocktower`'s missing outdoor
  sprite (#120).
- Interiors for `inn` (two guest beds in different colours, a
  nightstand, rug and plant), `school` (two desks with chairs, a
  bookshelf, a rug), `post-office` (a desk, chair, bookshelf and plant)
  and `shop` (a counter, two shelves, rug and plant) - all reusing the
  same generic furniture picked for #120. Buildings needing furniture
  that isn't vendored yet (bakery's oven, smithy's forge, chapel's
  pews, mill's millstones, workshop's workbench) are still left
  without an interior rather than a misrepresented one (#122).
- An interior for `forest-hut` - the same cosy-dwelling furniture as
  `cottage` (bed, nightstand, rug, plant), since it's the same simple
  5x5 footprint class. `riverside-jetty` (a dock, not an enclosed
  space) and the garden plots stay without an interior - outdoor by
  definition, not a gap waiting to be filled (#124).
- Clickable furniture: spec section 9 ties real features to specific
  furniture ("the bookshelf", "the desk"), not just a room to look at.
  Every picked furniture sprite now has a semantic `kind`
  (`kindOfFurniture` in `packages/content`), and town hall's bookshelf
  - its "archive cabinet" - is wired to a real panel showing the
    village chronicle (`VillageFacts.recentChronicle`, already fetched).
    Only that one piece, in that one building, is actually clickable
    (pointer cursor, a visible hint); every other piece of furniture
    everywhere else stays inert rather than offering a click that does
    nothing - a small, honest first slice of section 9's much larger
    furniture-opens-a-dialog vision, not a general dialog framework
    (#126).
- A second clickable piece in town hall: a chest/trunk sprite picked
  from the interior sheet is its "treasury chest" (spec section 9),
  wired to a Treasury panel showing `treasuryCoins` and
  `treasuryDeltaYesterday` (both already fetched, previously shown
  only in the top stats line) (#128).
- Shop's table doubles as its "counter" (spec section 9: "catalogue
  and prices... the goods ledger") - the sheet has no separate counter
  sprite, so this reuses the table already placed there. Clicking it
  opens a Stores panel listing `VillageFacts.stores` (good id ->
  quantity), fetched since the server's first version but never shown
  anywhere until now (#130).
- Town hall's third clickable piece: a single-book sprite picked from
  the interior sheet is its "almanac" (spec section 9: "Calendar").
  `FactsSnapshot`/`VillageFacts` gained `festivals` - the four fixed
  seasonal festivals (`@ai-village/sim`'s `FESTIVALS`), real static sim
  data that had never been surfaced to the web client before. The
  almanac panel shows today's date and the full festival calendar,
  marking today's festival if one is running (#132).
- The `request_work` chat tool (spec section 11's chat-tool table, the
  last of its three to be missing): a `RequestWork` command and a
  `WorkRequestQueue` in `packages/sim`, granted to the `villager` role
  through a new `REQUEST_WORK_TOOL`. Chat still never runs real tools
  itself - this only queues the request; running a queued work session
  is the separate "Work session" purpose, not built yet. Fully
  persisted (schema, migration, repository, snapshot mapping) so a
  queued request survives save/reload like everything else (#134).
- The `propose_hire` tool: a `HireVillager` command adds a new villager
  to the sim with a free, app-picked name (a new `VILLAGER_NAMES` list
  in `packages/content`), picked deterministically for a given trade.
  `PROPOSE_HIRE_TOOL` is the first `SIM_TOOLS` entry that isn't risk
  none - spec section 15: "Hire ... The owner decides" - so it's
  `risk: 'medium'`/`approval: 'each-time'`, the first tool to actually
  exercise `needsApproval`'s gate. Added the `mayor-duties` purpose's
  model settings alongside `chat` (spec section 11's table). Left out,
  and documented as such: traits, a "room"/free-cottage check, and the
  newcomer walking in or staying at the inn first - none of that state
  exists in the sim yet (#136).
- `runChat`/`runTurn` take an optional `purpose` (defaulting to `chat`
  for every call site that predates it), using it for the model
  settings, the budget check and the meter record instead of a
  hardcoded `'chat'` literal. Closes the gap #136 left open: a real
  `runTurn` call can now run `PROPOSE_HIRE_TOOL` end to end under the
  `mayor-duties` purpose and land a pending approval request. Nothing
  yet calls `runTurn` with `mayor-duties` on a schedule - the Mayor's
  daily duties (spec section 11) still need a scheduler, separate work
  (#138).
- The Mayor's-day scheduler mechanism (spec section 2: "The sim hands
  its events back to the scheduler, which decides whether a model turn
  should follow."): `runMayorDay` in `packages/agent` advances one
  village day, then - only if there's a Mayor - runs their
  `mayor-duties` turn with their governance tools. `runVillageDay` has
  no finer-grained tick than a whole day, so this runs once per
  simulated day rather than literally at 08:00 village time. Not wired
  into a live loop yet: that needs a real `ModelClient` and a provider
  API key, which stays out of server code by standing policy until
  there's an established story for where a production key comes from
  (#140).
- The owner's DeepSeek API key, with a settings UI and a new `settings`
  table in `packages/db`. The spec is explicit that secrets belong in
  the OS keychain, never the database or the browser - flagged that
  conflict, and the owner explicitly chose to store it in the database
  anyway, a deliberate session decision called out plainly in code
  rather than silently matching the spec. Defense in depth stays:
  `apps/server`'s `/api/settings` routes (`GET`/`POST`/`DELETE`) never
  send the key's value back to the browser, only whether one is set.
  `createApp` is now async and opens a real SQLite database for the
  first time. Settings storage only - doesn't wire `runMayorDay` (#140)
  into a live loop (#142).
- A living map (W17): the village is always drawn whole, with a camera
  that pans (drag, arrow keys, WASD) and zooms in whole steps (2x, 3x,
  4x). Dirt roads follow spec section 8's own roads with a full blob
  autotile, the river curves round the east and south with grassy banks
  and a bridge, and a deterministic scatter grows a tree line round the
  edges, groves, flower drifts and scrub on empty plots that clears once
  something's built. Buildings sit facing the road with their keeper at
  the door; hover to name one, click a furnished one to go inside. All
  from the already-vendored outdoor sheet (#144).
- A cosy game UI (W18): the map fills the window, with a wooden clock
  (day, time, season, weather, coins) top right, a collapsible journal
  (places, who's at work, the chronicle) under it, and interiors and
  settings opening as framed dialogs over the map. Panels and buttons
  are 9-slice wood from the Ninja Adventure pack's theme (CC0), and the
  UI is set in Pixelify Sans (OFL 1.1), as spec section 10 names (#146).
- A live clock in the sim: `settleDay` runs the current day's systems
  without moving the clock (`runVillageDay` is now `settleDay` plus the
  one-day jump, unchanged for the headless runner), and `tickLiveClock`
  / `catchUpLiveClock` advance the clock by real time and settle each
  day as it begins. An empty treasury no longer throws: work goes
  unpaid, upkeep pays what it can, and the chronicle says so (#148).
- A live server: the village is loaded from and saved to SQLite (with
  capped catch-up for time away), a `LiveVillage` ticks its clock on
  real time, `/api/clock` sets pause/1x/2x/4x, and `/api/events`
  streams the facts to the browser as server-sent events. The canvas
  sets up its ground once per map and rebuilds only what stands on it,
  depth-sorted by `zIndex`, leaving room for villagers that move (#150).
- Nobody works, or is paid, at a workplace that isn't built: a trade's
  workers fill its workplace's built instances in order, the same rule
  the map uses to place them, and anyone left over waits (#152).
- The approvals inbox (spec section 12): an `approvals` table, owned by
  the live village beside its state and saved with it;
  `GET /api/approvals` and `POST /api/approvals/:id` to list and decide
  requests (approving runs the tool; a tool that refuses leaves the
  request pending); and an Inbox button with a count over the map (#154).
- The Mayor's mornings: an opt-in `MayorScheduler` runs the Mayor's
  duties as each live village day begins - only with the Mayor switched
  on, a key saved and a monthly ceiling set, never for caught-up days.
  The meter is persisted so the ceiling holds across restarts, a hire
  waits in the inbox, the village holds still during a turn, and the
  server now listens on 127.0.0.1 only (#156).
- Talk turns use `deepseek-flash` and switch thinking off explicitly
  (DeepSeek's default is on). The meter counts cache-hit and reasoning
  tokens separately, prices follow DeepSeek's doubled peak hours, and the
  Mayor's morning proposes a hire rather than asking whether to (#158).
- Chat with a villager: a chat dialog opened from the journal's People list
  or with C, answered by the talk model with the villager's game tools,
  memories and promises. It's metered, needs only a key, and is never stopped by
  the monthly ceiling. Tool schemas are now sent as JSON Schema draft 7,
  since DeepSeek rejected the OpenAPI form of `positive()` numbers (#160).
- Villagers on the map all day. Each has a daily routine: home at dawn and
  night, work in the stints, the inn or the green at lunch and in the evening.
  They walk between places along the roads (A* on a walk grid) and fade out
  at a door going in, or in at the door coming out. Clicking a villager opens
  a chat, and the journal says where everyone is. Reduced motion moves them
  tile by tile without fades (#162).
- The villager card, opened by clicking a villager on the map or their name
  in the People list. It shows their portrait, where they are, needs bars
  with numbers, mood with a word, the people they know, what they remember
  and their open promises, with a Chat button. It's read from the sim state
  and kept current by the live updates (#164).
- Villager traits: 2-3 each, at most one flaw, picked from the village seed
  when a hire doesn't name them. They're saved in the new `villager_traits`
  table (older saves get their villagers' traits on load), shown on the
  villager card, and given to the model as a speaking style that changes tone
  and length, never facts (#166).
- Traits that act in the village: hardworking villagers' stints make 15%
  more, and green-thumbed ones make 15% more in fields and gardens. Lazy
  villagers nap through about 1 stint in 5, unpaid, with a private chronicle
  line. Cheerful villagers' friendships grow 25% faster, and grumpy ones'
  25% slower (#168).
- Chats with villagers are saved (a new `chat_lines` table), so a
  conversation and its history for the next turn survive a restart (#170).
- The notice board: the newest posts are in the facts (so villagers know
  them) and in the journal. Settings shows what the Mayor said at the end of
  their morning (#171).
- Villager card actions: Thank lifts their fun and they remember it, and each
  open promise has Kept and Let them off buttons (#172).
- Day and night light: the map is tinted amber at dawn, violet at dusk and
  deep blue at night (about 45% brightness), blending smoothly. Panels and
  dialogs are never tinted (#173).
- Leaving a building no longer leaves the map blank: rooms are drawn by the
  map's own renderer, so the page has only one (#175).
- Walk-in rooms: going inside fills the screen with the room, with a back wall,
  windows, a picture, floorboards and a doorway, and a moment of dark as you
  step through. Whoever is in that building stands in the room and can be
  clicked. A sign at the top says who's in and leads back out, as does Esc.
  Indoors the light follows the clock more softly (#176).
- The owner can pin a note on the notice board from the journal. It's an
  `OwnerPostOnBoard` command of its own, so a villager can't post as the
  owner (#177).
- Thanking counts once a day per villager. A second thanks is refused, and
  the card says so (#178).
- Night lights: the day/night tint now comes from the map's renderer, and
  every lived-in building's windows and door glow warm from 19:00 to dawn,
  shining through the dark rather than being dimmed by it (#180).
- Seasons: pink petals drift in spring, trees turn orange and the grass gold
  in autumn with falling leaves, and in winter the ground and paths lie under
  snow, the trees are frosted and the flowers are gone. These are palette
  swaps of the same art, not new drawings (#181).
- Weather on the map: rain (with a darker tint), heavier rain in storms,
  falling snow, a fog layer, and petals or leaves blown faster in wind.
  Nothing shows indoors, and nothing moves under reduced motion (#182).
- Villagers walk at the clock's pace: they stop while it's paused, walk 1.6x
  as fast at 2x and 2.5x at 4x, and 20% slower in snow (#183).
