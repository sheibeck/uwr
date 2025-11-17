# Unwritten Realms

A text-forward MMO sandbox inspired by Kyle Kirrin's *Shadeslinger* series. Unwritten Realms pairs a Vue 3 command console with SpaceTimeDB's real-time data fabric and an AI orchestration layer that dynamically expands the world as players act.

## Repo layout

```
.docs/
  systems/      # Deep dives per gameplay system
  roadmap/      # Delivery plans, milestones, staffing notes
```

Additional app packages (web client, orchestration services, SpaceTimeDB modules) will be added in subsequent milestones.

## Technology stack (Phase 0 focus)

- Language: **TypeScript** across all packages (orchestrator, web app, shared schema, SpaceTimeDB module bindings).
- Package management: **PNPM workspaces** (`apps/`, `services/`, `packages/`).
- Formatting & lint: **Prettier** (format), **ESLint** (rules), **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `strictNullChecks`).
- Testing: **Vitest** + **happy-dom** (UI) + lightweight scenario replay harness later.
- Validation: **Zod** for runtime schemas, auto-export JSON Schema for AI function calling guardrails.
- SpaceTimeDB: Use its TypeScript SDK for table definitions & procedure calls; keep domain types in `packages/shared-schema`.
- Path aliases (in `tsconfig.base.json`): `@shared/*`, `@schema/*`, `@spacetime/*`, `@orchestrator/*`.
- Build: Rely on TS incremental builds; avoid bundling early—use `tsx` or `esbuild` only when needed.

## Getting started

1. Ensure you have Git, Node 20+, and SpaceTimeDB CLI installed (Windows: visit https://spacetimedb.com/install or use the official installer; verify with `spacetime --version`).
2. Clone or open this repo: `git clone <url> c:\projects\uwr`.
3. Explore the specs under `docs/` to understand narrative, systems, and delivery plan.
4. Use the roadmap to pick the next actionable milestone before writing code.

### SpacetimeDB integration (accounts & sessions)

Commands (PowerShell):

```
# Start local host (leave running)
pnpm dev:spacetime

# Publish module (entrypoint packages/spacetime-modules/src/index.ts)
pnpm publish:spacetime

# Generate client bindings for orchestrator
pnpm generate:bindings

# Run orchestrator (will fallback to stubs unless SPACETIME_ENABLED=true)
SPACETIME_ENABLED=true pnpm dev:orchestrator
```

Environment variables:

```
SPACETIME_URI=ws://localhost:3000
SPACETIME_DBNAME=unwritten-realms
SPACETIME_TOKEN=<optional persisted token>
SPACETIME_ENABLED=true
```

If bindings are not yet generated the orchestrator adapter will use local stubs, allowing tests to pass offline.

## Guiding principles

- **Lore-first**: Every mechanic reinforces Shadeslinger canon and tone.
- **AI-augmented, not AI-ruled**: LLMs propose structured world events; deterministic validators keep the world coherent.
- **Player agency**: Text commands should feel like conversing with a living GM, with immediate, meaningful outcomes.
- **Operational excellence**: Observability, moderation, and rollback tooling are first-class citizens.
