# Unwritten Realms (UWR)

A browser-based multiplayer RPG built on SpacetimeDB and Vue 3. Players create characters, form groups, engage in turn-based combat, and explore a world shaped by collective player action. Narratively driven in the style of Shadeslinger — charm, wit, and biting sarcasm in every interaction.

> "Congratulations. You've achieved the bare minimum. The guild acknowledges your existence."

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | SpacetimeDB 1.12.0 (TypeScript SDK) |
| Backend language | TypeScript 5.6.2 |
| Frontend framework | Vue 3.5.13 + Vite 6.4.1 |
| Authentication | SpacetimeAuth OIDC |
| LLM provider | Anthropic Claude API (via SpacetimeDB procedures) |
| Deployment | GitHub Pages (frontend) + SpacetimeDB maincloud (backend) |

---

## Project Structure

```
uwr/
├── spacetimedb/          # Backend — SpacetimeDB TypeScript module
│   └── src/
│       ├── index.ts      # Main entry point
│       ├── schema/       # Table definitions
│       ├── reducers/     # State mutation handlers (auth, combat, items, groups, etc.)
│       ├── helpers/      # Shared business logic
│       ├── data/         # Game constants (abilities, classes, items, enemies, etc.)
│       ├── views/        # Per-user filtered data views
│       └── seeding/      # World, enemy, and item initialization
│
├── src/                  # Frontend — Vue 3 SPA
│   ├── main.ts           # App entry, SpacetimeDB connection setup
│   ├── App.vue           # Root component and UI orchestrator
│   ├── components/       # Vue SFC components (panels, modals, HUD)
│   ├── composables/      # Vue composition functions (game data, combat, inventory, etc.)
│   ├── auth/             # SpacetimeAuth OIDC login/token handling
│   └── module_bindings/  # Auto-generated client bindings — DO NOT EDIT
│
├── .planning/            # Architecture docs, phase plans, quick task history
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [SpacetimeDB CLI](https://spacetimedb.com/install) (`spacetime` command available in PATH)

### 1. Clone and install dependencies

```bash
git clone https://github.com/sheibeck/uwr.git
cd uwr
pnpm install
```

### 2. Configure environment

Create a `.env.local` file in the root:

```bash
# SpacetimeDB connection (defaults to local dev server)
VITE_SPACETIMEDB_HOST=ws://localhost:3000
VITE_SPACETIMEDB_DB_NAME=uwr

# SpacetimeAuth OIDC (required for login)
VITE_SPACETIMEAUTH_CLIENT_ID=<your-client-id>
VITE_SPACETIMEAUTH_REDIRECT_URI=http://localhost:5173/uwr
# VITE_SPACETIMEAUTH_ISSUER=https://auth.spacetimedb.com  # optional, this is the default
```

The `CLIENT_ID` is registered at [auth.spacetimedb.com](https://auth.spacetimedb.com). For production the redirect URI should match your deployed URL.

### 3. Start local SpacetimeDB server

```bash
spacetime start
```

Runs at `ws://localhost:3000`.

### 4. Publish the backend module

```bash
pnpm spacetime:publish
```

Or to wipe and republish from scratch:

```bash
spacetime publish uwr --clear-database -y --project-path spacetimedb --server local
```

### 5. Generate client bindings

Run this whenever the backend schema or reducers change:

```bash
pnpm spacetime:generate
```

### 6. Start the frontend dev server

```bash
pnpm dev
```

App runs at `http://localhost:5173/uwr`.

---

## Available Scripts

```bash
pnpm dev                  # Start frontend dev server (http://localhost:5173/uwr)
pnpm build                # Type-check and build frontend for production → ./dist
pnpm preview              # Serve the production build locally

pnpm spacetime:generate   # Regenerate src/module_bindings/ from backend schema
pnpm spacetime:publish    # Publish backend module to local SpacetimeDB
```

---

## Deployment

### Backend — SpacetimeDB Maincloud

```bash
# Log in (one-time)
spacetime login

# Verify the default server is maincloud
spacetime server list

# Publish (uses default server)
spacetime publish uwr --project-path spacetimedb

# View database dashboard
# https://spacetimedb.com/@sheibeck/uwr

# Tail server logs
spacetime logs uwr
```

To hard-reset the database (destroys all data):

```bash
spacetime publish uwr --clear-database -y --project-path spacetimedb
```

### Frontend — GitHub Pages

The frontend deploys automatically via GitHub Actions on push to `master`. To deploy manually:

```bash
pnpm build
# push dist/ contents to gh-pages branch, or use your CI/CD pipeline
```

Set the `BUILD_VERSION` environment variable during CI to stamp the build:

```bash
BUILD_VERSION=1.2.3 pnpm build
```

### Post-Deploy In-Game Steps (Admin Required)

After every production deployment, log into the game with an admin account and run these two commands in the chat bar:

#### `/synccontent`

Re-seeds all static game content tables from code to the live database. Run this after any backend publish that adds or changes:

- Abilities, item templates, crafting recipes, recipe scrolls
- Enemies, enemy abilities, loot tables, vendor inventory
- NPCs, quest templates, dialogue options
- Races, factions, world layout, locations

This is safe to run on a live database — it upserts rows, it does not wipe player data.

#### `/setappversion`

Writes the current client build version into the `AppVersion` SpacetimeDB table. Connected clients compare their build version against this value and automatically reload when there is a mismatch (i.e. after a new frontend deploy). Run this after every frontend deploy so players pick up the new build.

**Full post-deploy checklist:**

1. `spacetime publish uwr --project-path spacetimedb` — publish backend
2. `pnpm build && git push` — build and deploy frontend
3. Log into the game with an admin account
4. Type `/synccontent` in chat — syncs all game content to the live DB
5. Type `/setappversion` in chat — tells connected clients a new build is available

---

## Admin Reference

### After schema changes

Any time a table, column, or reducer changes in `spacetimedb/src/`:

1. Publish the updated module: `spacetime publish uwr --project-path spacetimedb`
2. Regenerate bindings: `pnpm spacetime:generate`
3. Commit the updated `src/module_bindings/` (do not hand-edit these files)

### Debugging

```bash
# Live server logs
spacetime logs uwr --follow

# Is the server running?
spacetime server list

# Is the module published?
spacetime describe uwr
```

Common issues:

| Symptom | Fix |
|---------|-----|
| Client can't connect | Verify `spacetime start` is running and `VITE_SPACETIMEDB_HOST` matches |
| Auth redirect fails | Check `VITE_SPACETIMEAUTH_REDIRECT_URI` matches registered client redirect URI |
| Type errors in module_bindings | Re-run `pnpm spacetime:generate` after backend changes |
| Stale data after schema change | Republish with `--clear-database` (destroys all rows) |

---

## Architecture

**All persistent state lives in SpacetimeDB tables.** The client never writes to local state for game data — everything flows through reducers on the backend.

```
UI action
  → conn.reducers.doSomething({ param })   # object syntax, always
      → SpacetimeDB reducer (transactional, server-authoritative)
          → mutates tables
              → useTable() subscription delivers update
                  → Vue reactivity re-renders UI
```

Key architectural rules:
- **Reducers** are the only mutation path — they are transactional and deterministic
- **Views** filter data per-user for privacy and performance
- **`src/module_bindings/`** is generated — never edit manually
- Reducer calls use **object syntax**: `conn.reducers.foo({ bar: 'value' })` not positional args
- Timestamps on the client are `{ microsSinceUnixEpoch: bigint }` objects — use `new Date(Number(ts.microsSinceUnixEpoch / 1000n))`

---

## Planning Docs

Internal architecture and planning docs live in `.planning/`:

- `.planning/PROJECT.md` — Project charter, milestone goals, success criteria
- `.planning/codebase/ARCHITECTURE.md` — System architecture deep-dive
- `.planning/codebase/STRUCTURE.md` — Directory structure and file purposes
- `.planning/codebase/CONVENTIONS.md` — Code style and naming conventions
- `.planning/STATE.md` — Current milestone progress and completed quick tasks
