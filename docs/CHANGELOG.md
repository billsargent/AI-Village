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
