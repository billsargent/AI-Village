# AI-Village

A cosy pixel-art village whose villagers are AI agents. They live a
simulated life on their own, and they do real computer work for the owner
when asked.

The full build plan is in [docs/BUILD_SPECIFICATION.md](docs/BUILD_SPECIFICATION.md).
It splits the project into a deterministic **game** (the village simulation,
`packages/sim`) and a guarded **agent** layer (models, tools, real-world
effects, `packages/agent`) — see section 1 and 2 for why.

## Repository layout

```text
apps/
  server/        routes, sign-in, live events, scheduler, wiring
  web/           React app, Pixi renderer, dialogs
packages/
  content/       goods, trades, buildings, traits, happenings, names, playbooks, prices
  sim/           systems, commands, facts, seeded randomness
  db/            schema, migrations, repositories
  agent/         prompts, runner, model routing, tools, risk, approvals, meter, memory
  integrations/  model clients, mail, calendars, search, fetch, push
tools/           art and map builders, sim runner, eval runner, seeders
docs/            build specification, changelog, art credits
.github/         workflows, issue and PR templates, labels
```

## Getting started

```sh
pnpm install
pnpm run doctor     # checks Node version etc.
pnpm run typecheck
pnpm run lint
pnpm run test
```

## Workflow

Every piece of work is a labelled GitHub issue, ships in a PR, and merges
only with the owner's go-ahead. See section 3 of the build specification for
the full issue, branch, PR and review conventions.
