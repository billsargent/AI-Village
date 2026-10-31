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
