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

## Startup (full dev environment)

This section collects the exact commands and environment settings to get the full stack running locally on Windows (PowerShell). It assumes you have Node 20+, Git, pnpm and the `spacetime` CLI installed on your PATH.

1) Install dependencies (from the repo root):

```powershell
pnpm install
```

2) Optional: run typecheck to catch any local issues early:

```powershell
pnpm typecheck
```

3) Start a local SpaceTimeDB host (separate terminal). This uses the `spacetime` dev server included with the SDK:

```powershell
# start a local spacetime host (leave running)
pnpm dev:spacetime
```

4) Publish the SpaceTime module (required for real bindings). In a separate terminal run:

```powershell
pnpm publish:spacetime
```

5) Generate TypeScript client bindings for the orchestrator (this writes to services/orchestrator/src/module_bindings):

```powershell
pnpm generate:bindings
```

6) Start the orchestrator server (this exposes /api/sessionSync at port 3001 by default). Prefer a dedicated terminal for this process:

```powershell
# Optionally enable the spacetime adapter if you want real DB calls
$env:SPACETIME_ENABLED = 'true'; $env:ORCHESTRATOR_PORT = '3001'; pnpm dev:orchestrator
```

If you prefer the default environment style instead of inline PowerShell env assignment, set the variables in your environment or use a .env loader.

7) Start the web dev server (Vite). From the repo root:

```powershell
# runs the web client (Vite will proxy /api to the orchestrator at localhost:3001)
pnpm dev:web
```

8) Open the browser to the Vite dev URL (usually http://localhost:5173). Use the web UI to sign in via the small auth form. The front-end calls `/api/sessionSync` which is proxied to the orchestrator server.

Note about ports and 404s

Vite's standard dev port is 5173. If you navigate to a different port (for example http://localhost:5174) and see a 404, the Vite dev server is not serving on that port. Always run `pnpm dev:web` from the repo root and check the Vite terminal output — Vite prints the local URL it is listening on (for example: "Local: http://localhost:5173/").

If you need a fixed dev port in CI or automation, set it in your CI environment or add a dedicated script, but for local development we recommend relying on Vite's default behavior and checking the terminal for the actual URL.

Quick troubleshooting
- If you see TypeScript errors referencing generated bindings, re-run `pnpm generate:bindings` and then `pnpm typecheck`.
- If the web UI cannot reach `/api`, confirm the orchestrator is running on port 3001 and that `apps/web/vite.config.ts` proxy is present. You can change `ORCHESTRATOR_PORT` and update the proxy target if needed.
- If Spacetime client errors appear, make sure the local SpaceTime host process (step 3) is running and that `SPACETIME_ENABLED=true` is set when starting the orchestrator.

Node version note

If you see an error from Vite like "Vite requires Node.js version 20.19+ or 22.12+", upgrade Node. Two common options on Windows:

- Install nvm-windows (https://github.com/coreybutler/nvm-windows) and run:

```powershell
nvm install 22.12.0
nvm use 22.12.0
```

- Or download the latest Node.js installer from https://nodejs.org and run the Windows installer.

Commands summary (copyable PowerShell block)

```powershell
pnpm install
pnpm typecheck
# in terminal A
pnpm dev:spacetime
# in terminal B
pnpm publish:spacetime
pnpm generate:bindings
# in terminal C
$env:SPACETIME_ENABLED = 'true'; $env:ORCHESTRATOR_PORT = '3001'; pnpm dev:orchestrator
# in terminal D
pnpm dev:web
```

If you'd like, I can also add a small PowerShell script or PS1 task that orchestrates these terminals for you.

If bindings are not yet generated the orchestrator adapter will use local stubs, allowing tests to pass offline.

## Guiding principles

- **Lore-first**: Every mechanic reinforces Shadeslinger canon and tone.
- **AI-augmented, not AI-ruled**: LLMs propose structured world events; deterministic validators keep the world coherent.
- **Player agency**: Text commands should feel like conversing with a living GM, with immediate, meaningful outcomes.
- **Operational excellence**: Observability, moderation, and rollback tooling are first-class citizens.
