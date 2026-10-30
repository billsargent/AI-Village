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
