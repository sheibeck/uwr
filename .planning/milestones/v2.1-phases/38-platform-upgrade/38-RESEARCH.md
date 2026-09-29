# Phase 38: Platform Upgrade - Research

**Researched:** 2026-09-29
**Domain:** Toolchain / platform upgrade (SpacetimeDB 2.0.1 to 2.10.1, Vite 8 / TS 6 / Vitest 5 / vue-tsc 3, llm-proxy deps, pnpm-only)
**Confidence:** HIGH (nearly every claim below was verified by an executable dry run in a scratch directory outside the repo; see "Dry-run evidence")

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Locked by the exploration session (see research note)
- **TypeScript pinned to `~6.0.3`, NOT 7.** TS 7.0.x has no compiler JS API, so vue-tsc cannot run on it (vuejs/language-tools#5381).
- **Target versions:** spacetimedb 2.10.x (CLI + root + `spacetimedb/`), Vue 3.5 latest, Vite 8, @vitejs/plugin-vue 6, vue-tsc 3, Vitest 5 in both root and `spacetimedb/`, hono latest 4.x, openai 7.x, wrangler latest 4.x, @cloudflare/workers-types 5.x.
- **Upgrade order, with build + tests after each step:** (1) SpacetimeDB: CLI, both packages, regenerate bindings, publish locally, test -> (2) Vitest 5 in `spacetimedb/` -> (3) llm-proxy deps + `wrangler dev` smoke test -> (4) root: Vue patch, then TS ~6.0 + vue-tsc 3 (fix template errors), then Vite 8 + plugin-vue 6 + Vitest 5 -> (5) lockfile cleanup, `engines`, CLAUDE.md refresh.
- **Publish locally WITHOUT `--clear-database`.** The upgrade must not force a schema wipe.
- **Back up the local SpacetimeDB data directory before the first 2.10 server start.** It is unknown whether a database created under 2.0.1 loads cleanly on 2.10.1 (medium confidence).
- **pnpm is the single package manager.** Regenerate `pnpm-lock.yaml` (stale since 2026-02-24), delete the stray root `package-lock.json`, and declare `"engines": {"node": ">=22.12"}` (the Vitest 5 floor; local Node is 22.23.2).
- **Update CLAUDE.md's stale SpacetimeDB rules** to match 2.10: the "tested with 1.11.x" header, index `name:` -> `accessor:`, and the multi-column index `.filter()` warning (fixed in 2.7/2.8). Keep the edits surgical, and don't rewrite unrelated sections.
- **Deferred to todos, not this phase:** the camelCase table-handle migration and the procedure-HTTP spike.

#### Safety constraints (project-level, non-negotiable)
- No `git push` (production is tied to master). No `spacetime publish --server maincloud`. No `wrangler deploy`. All work stays local.
- Local publishing is allowed: `spacetime publish uwr -p spacetimedb` (local is the default server).
- Every step must leave the repo buildable. Commit per logical step so any single bump can be reverted in isolation.

### Claude's Discretion
- **Standalone pnpm projects vs a pnpm workspace for `spacetimedb/` and `llm-proxy/`.** The research explicitly deferred this to planning. The lean is standalone per-directory pnpm lockfiles (no workspace), because root and `spacetimedb/` both use package name `"uwr"`, which would collide in a workspace, and because `spacetime publish` and `wrangler` each bundle from their own directory. Switch to a workspace only if research shows it is clean for both.
- Whether to bump llm-proxy `compatibility_date` (currently `2025-01-01`). Bump it if the workers-types 5 or wrangler upgrade calls for it.
- How to handle the 2.10 `onDisconnect`/`onConnectError` change. `src/main.ts` currently only logs in both callbacks; there is no stale-token logic there. Audit `src/` (auth, App.vue, composables) for anything that relied on `onConnectError` firing for established-connection errors, and adapt.
- How deep the scheduled-table concurrency audit goes (16 scheduled tables). At minimum, identify any logic that assumes strict `scheduled_at` ordering between overdue jobs, and document the result.
- Whether to add unit tests for changed behaviour (e.g. connection-error routing). The project rule is that phases include tests enforcing implemented rules. For a pure version bump, the existing suites passing is the primary gate, but any new or changed logic gets a test.
- Whether to refresh PROJECT.md's stale tech-stack table (it still says SpacetimeDB 1.12.0 / Vite 6.4.1) as part of closing the phase.

### Deferred Ideas (OUT OF SCOPE)
- Migrate ~273 snake_case client table-handle references to camelCase, and type the connection as `DbConnection`: `todos/pending/2026-09-29-migrate-client-table-handles-to-camelcase.md`
- Spike procedure `ctx.http.fetch` on 2.10 to retire llm-proxy: `todos/pending/2026-09-29-spike-procedure-http-to-retire-llm-proxy.md`
- Adopt new 2.10 features (Vue `useProcedure`, view primary keys, `table.clear()`, `spacetime logs --level`, `spacetime lock`, `spacetime mcp`)
- TypeScript 7 once vue-tsc supports it (expected with TS 7.1, around October 2026)
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP lists "Requirements: TBD"; no REQ-IDs are mapped. The 7 success criteria are the contract.

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-1 | CLI, server SDK, client SDK on 2.10.x; bindings regenerated; local publish without `--clear-database` | "SpacetimeDB upgrade mechanics"; publish needs `--break-clients` (14 views are removed and re-created, no table changes) |
| SC-2 | Connection-error handling OK under 2.10 change; scheduled logic not order-dependent | "Client-side 2.10 changes" (Vue provider unchanged, no code change required); "Scheduled-table audit" (no ordering assumption found) |
| SC-3 | TS ~6.0, vue-tsc 3, Vite 8, plugin-vue 6, Vitest 5 (root + `spacetimedb/`), Vue 3.5 latest | Dry run: all install and work together; baseline `vue-tsc` is already red (137 errors) so this must be fixed for SC-6 |
| SC-4 | llm-proxy upgraded; `/api/llm` works under `wrangler dev` | Dry run: hono 4.13, openai 7.23, wrangler 4.142, workers-types 5 all work; needs pnpm `allowBuilds` |
| SC-5 | pnpm only; lockfile regenerated; stray lockfiles removed; `engines.node >=22.12` | "pnpm conversion" (standalone recommended, with hard evidence) |
| SC-6 | `pnpm build` and all suites pass; game runs locally | Baseline: `pnpm build` FAILS today (vue-tsc); 2 pre-existing test failures; live run is a human checkpoint |
| SC-7 | Stale CLAUDE.md rules updated | Exact stale-line inventory below (AGENTS.md is a byte-identical copy and must be updated too) |
</phase_requirements>

## Summary

The whole upgrade was rehearsed end to end in a scratch directory (outside the repo, nothing in the repo or the installed SpacetimeDB was modified). The result is that the locked target versions work together with very few code changes. A copy of the real 2.0.1 local data directory (11.5 GB) loaded on a 2.10.1 server on another port with data intact. A module built by the 2.0.1 CLI and SDK was published to a 2.10.1 server, then the 2.10.1-built module was published over it with no data deletion. Regenerated bindings differ from the committed ones in only 15 files. Vue provider code in the SDK is byte-identical between 2.0.1 and 2.10.1. The upgraded root toolchain (TS 6.0.3, vue-tsc 3.3.11, Vite 8.3.1, plugin-vue 6.0.9, Vitest 5.0.2) builds, serves, and passes exactly the same tests as today. The upgraded llm-proxy runs under `wrangler dev`.

Four things the planner would otherwise miss: (1) **`pnpm build` is already red today** (`vue-tsc -b` reports 137 pre-existing errors: 110 unused-declaration errors and 27 real type errors, 106 of the 137 in `App.vue`), so SC-6 needs an explicit fix task; the upgrade does not make it worse (134 errors after, a strict subset plus one new `TS2719`). (2) **Publishing needs `--break-clients`**: with the 2.10.1 SDK the 14 `my_*` views gain primary keys, so the publish plan removes and re-creates all 14 views ("All clients will be disconnected"). No tables change and no data is deleted, but a non-interactive publish without the flag will stop at a prompt. (3) **`spacetime build/publish/generate` silently type-checks with `tsc` whenever `typescript` is resolvable from `spacetimedb/node_modules`, and `spacetimedb/` has 233 pre-existing type errors, so the build then exits 2 with no bundle.** A pnpm workspace makes root `typescript` visible there (proven), so `spacetimedb/` must stay a standalone pnpm project with no `typescript` dependency. (4) **pnpm 11 hard-fails installs with unapproved build scripts** (`ERR_PNPM_IGNORED_BUILDS`, exit 1) and stores settings in `pnpm-workspace.yaml`; llm-proxy needs `allowBuilds` for `esbuild` and `workerd`.

**Primary recommendation:** Execute the locked order, but (a) make a Wave 0 that fixes the two `buildLookOutput` tests and drives `vue-tsc` to zero errors on the CURRENT toolchain so every later failure is attributable, (b) convert each package directory to pnpm at the moment it is first touched (each with its own `pnpm-workspace.yaml`, no workspace, no `typescript` in `spacetimedb/`), and (c) publish locally with `--break-clients`, never `--clear-database`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Server runtime + local data (`spacetime start`, data dir, `metadata.toml`) | SpacetimeDB host (CLI/standalone) | - | Data dir is stamped and migrated by the host; module code has no say |
| Module bundle (`spacetimedb/`, reducers, scheduled tables, views) | SpacetimeDB module (JS bundle in DB) | Host scheduler | Scheduling order/concurrency is a host behavior that the module must tolerate |
| Bindings (`src/module_bindings/`) | Build step (`spacetime generate`) | Client SPA | Generated, never hand-edited; must be regenerated in lockstep with the published schema |
| Connection lifecycle (`onConnect/onDisconnect/onConnectError`) | Client SPA (`src/main.ts`, SDK Vue provider) | - | Vue provider has no reconnect logic; only isActive/connectionError state |
| Type-check and bundle of the SPA | Client tooling (vue-tsc, Vite) | - | `pnpm build` = `vue-tsc -b && vite build` |
| LLM calls | Cloudflare Worker (`llm-proxy/`) | Client composable `useLlmProxy` | Proxy holds the OpenAI key; client only calls `/api/llm` |
| Package management | pnpm (three independent projects) | - | Each of root, `spacetimedb/`, `llm-proxy/` is bundled by a different tool from its own directory |

## Project Constraints (from CLAUDE.md and project memory)

- SpacetimeDB rules in CLAUDE.md are authoritative for module code; **do NOT invent SpacetimeDB APIs**; "Make the smallest change necessary; do NOT touch unrelated files, configs, or dependencies."
- Never edit generated bindings; regenerate with `spacetime generate` (`pnpm spacetime:generate`).
- Reducer calls use object syntax; `ctx.sender` is the authenticated principal.
- Project memory (treat as locked): **never auto-publish to maincloud** (local only: `spacetime publish uwr -p spacetimedb`); the CLI flag is `-p` (also `--module-path`); **never `--clear-database` unless schema changes require it** (they do not here); all phases must include unit tests enforcing implemented rules; prefer `fail()` over `SenderError` where character context exists (not relevant to this phase).
- Server is the source of truth: the client imports constants from `spacetimedb/src/data/` (`src/composables/useCommands.ts` imports `renown_data` and `mechanical_vocabulary`). Root `vue-tsc` and Vite therefore also process those server files; root deps must resolve them. Keep this in mind when reorganizing installs.
- **`AGENTS.md` is a byte-identical copy of `CLAUDE.md`** (`cmp` = identical, both tracked, 611 lines). SC-7 edits must be applied to both files (or the copy will keep the stale rules).

## Standard Stack

### Core
| Library | Version (verified `npm view`, 2026-09-29) | Purpose | Notes |
|---------|---------|---------|-------|
| spacetimedb (npm, root + `spacetimedb/`) | 2.10.1 | Server SDK + client SDK + `spacetimedb/vue` | Use `^2.10.1` |
| SpacetimeDB CLI | 2.10.1 (GitHub release v2.10.1, 2026-09-15) | build/publish/generate/start | Installed today: 2.0.1 |
| vue | 3.5.43 | UI | `^3.5.43` |
| vite | 8.3.1 | dev/build (Rolldown + Oxc) | Node `^20.19 \|\| >=22.12` |
| @vitejs/plugin-vue | 6.0.9 | SFC compile | peer vite 5-8, vue ^3.2.25 |
| typescript | 6.0.3 (`latest` dist-tag is 7.0.2; DO NOT use) | type-check | `~6.0.3` |
| vue-tsc | 3.3.11 | `.vue` type-check | peer `typescript >=5.0.0` |
| vitest | 5.0.2 | tests (root and `spacetimedb/`) | Node `^22.12 \|\| ^24 \|\| >=26`; peer vite `^6.4 \|\| ^7 \|\| ^8` |
| hono | 4.13.x | llm-proxy router | resolved 4.13.10 with a mature-version range |
| openai | 7.23.0 | llm-proxy client | Node >=22 |
| wrangler | 4.142.x / 4.143.0 | llm-proxy dev/bundle | peer workers-types `^5.20260926.1` |
| @cloudflare/workers-types | 5.20260928.1 (5.20260926.1 is the peer floor) | worker types | v5 removed dated entrypoints (unused here) |

### Supporting / unchanged
| Library | Version | Purpose |
|---------|---------|---------|
| @types/node | ^25.2.3 (keep; resolved 25.9.8) | root types; Vitest 5 peer accepts `>=24` |
| html2canvas | ^1.4.1 (keep) | screenshot feature in `App.vue` |
| pnpm | 11.23.0 (installed) | single package manager |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Standalone pnpm projects | pnpm workspace (`packages: [spacetimedb, llm-proxy]`) | Installs fine (duplicate name `uwr` does NOT error), but it makes root `typescript` visible in `spacetimedb/node_modules/.bin`, which turns on the CLI's hidden `tsc` gate and breaks `spacetime build` (exit 2, 233 errors). Rejected with evidence. |
| Keep `compatibility_date = "2025-01-01"` | Bump to a 2026 date | Works unchanged under wrangler 4.143 (no warning). Bumping changes runtime semantics for no benefit. Recommend leaving it. |

**Installation (per directory, after deleting that directory's `node_modules` and `package-lock.json`):**
```bash
# spacetimedb/   (NO typescript here, ever)
pnpm install                      # deps: spacetimedb ^2.10.1 ; dev: vitest ^5.0.2
# llm-proxy/
pnpm install                      # needs allowBuilds (see Code Examples), deps hono ^4.13.0, openai ^7.0.0
                                  # dev: @cloudflare/workers-types ^5.20260926.1, wrangler ^4.140.0
# root
pnpm install                      # spacetimedb ^2.10.1, vue ^3.5.43 ; dev: typescript ~6.0.3, vite ^8.3.1,
                                  # @vitejs/plugin-vue ^6.0.9, vue-tsc ^3.3.11, vitest ^5.0.2, @types/node ^25.2.3
```

**Version verification:** all versions above were confirmed with `npm view <pkg> version` on 2026-09-29 and installed in the dry run.

## Package Legitimacy Audit

Ran `gsd-tools query package-legitimacy check --ecosystem npm ...`. Every "SUS" verdict has the single reason `too-new`, meaning the LATEST release was published within about two weeks; all are long-established packages with tens of millions of weekly downloads and official source repos, and all are ALREADY dependencies of this project at older versions. No package returned `SLOP`. No package has a `postinstall` except `esbuild` and `workerd` (transitive deps of wrangler; both are the official Cloudflare/evanw packages and only run `node install.js`).

| Package | Registry | First published | Downloads/wk | Source repo | Verdict | Disposition |
|---------|----------|-----------------|--------------|-------------|---------|-------------|
| spacetimedb | npm | 2025-09 | 25.7k | github.com/clockworklabs/SpacetimeDB | SUS (too-new, latest 2026-09-15) | Keep; existing dep; official vendor |
| vue | npm | 2013 | 18.1M | github.com/vuejs/core | SUS (too-new, latest 2026-09-17) | Keep; existing dep |
| vite | npm | 2020 | 208M | github.com/vitejs/vite | SUS (too-new, latest 2026-09-24) | Keep; existing dep |
| @vitejs/plugin-vue | npm | - | 10.4M | github.com/vitejs/vite-plugin-vue | SUS (too-new) | Keep; existing dep |
| typescript | npm | - | 331M | github.com/microsoft/TypeScript | OK | Approved (pin `~6.0.3`) |
| vue-tsc | npm | - | 6.7M | github.com/vuejs/language-tools | OK | Approved |
| vitest | npm | 2021 | 122M | github.com/vitest-dev/vitest | SUS (too-new, latest 2026-09-25) | Keep; existing dep |
| hono | npm | 2021 | 73M | github.com/honojs/hono | SUS (too-new, latest 2026-09-29) | Keep; existing dep |
| openai | npm | 2020 | 44.9M | github.com/openai/openai-node | SUS (too-new, latest 2026-09-23) | Keep; existing dep |
| wrangler | npm | 2012 | 26.3M | github.com/cloudflare/workers-sdk | SUS (too-new, latest 2026-09-28) | Keep; existing dep |
| @cloudflare/workers-types | npm | - | 11.9M | github.com/cloudflare/workerd | SUS (too-new, latest 2026-09-29) | Keep; existing dep |
| html2canvas | npm | 2022 | 20.1M | github.com/niklasvh/html2canvas | OK | Unchanged |

**Packages removed due to SLOP verdict:** none
**Packages flagged SUS:** 9 (all `too-new` only). Recommendation: ONE consolidated `checkpoint:human-verify` at the start of the first install step ("these are existing deps at new versions; pnpm 11's default `minimumReleaseAge` = 1 day already acts as a supply-chain gate") rather than nine separate checkpoints. To honor that gate, use lower-bound ranges (below) so pnpm picks the newest version that is at least 24 h old; do not commit `minimumReleaseAgeExclude` entries.

## Architecture Patterns

### Upgrade flow (data and tooling)

```
 [backup data dir + config]  --robocopy-->  <backup>\data (11.5 GB), <backup>\config
            |
 spacetime version install 2.10.1 --use -y   (old versions stay in bin\, `current` symlink re-pointed)
            |
 spacetimedb/: rm node_modules+package-lock, pnpm-workspace.yaml, pnpm install (spacetimedb ^2.10.1, vitest ^5)
            |--> vitest run (476/478, same 2 known failures)
            |--> spacetime generate (root script) --> src/module_bindings (15 files change)
            |
 spacetime start --non-interactive (bg, 127.0.0.1:3000)  --> ping /v1/ping
            |--> spacetime publish uwr -p spacetimedb --server local --break-clients
                     (plan: remove+create 14 views; tables untouched; clients disconnected)
            |
 llm-proxy/: pnpm install (+allowBuilds) --> wrangler dev --> curl /api/llm (401, 400, real call)
            |
 root: pnpm install (Vue patch) -> TS 6.0.3 + vue-tsc 3 -> Vite 8 + plugin-vue 6 + Vitest 5
            |--> vue-tsc (0 errors target) , vite build , vitest run (all 18 files)
            |
 cleanup: delete 3 package-lock.json, engines, CLAUDE.md+AGENTS.md, README/PROJECT.md tech tables
            |
 [human] pnpm dev + local server: login, create/load character, combat, view-backed panels
```

### Recommended structure changes
```
repo/
├── package.json            # + engines.node >=22.12, + "test": "vitest run", versions bumped
├── pnpm-lock.yaml          # regenerated
├── spacetimedb/
│   ├── package.json        # spacetimedb ^2.10.1, vitest ^5.0.2 -- NO typescript
│   ├── pnpm-lock.yaml
│   └── pnpm-workspace.yaml # minimal settings file so this dir is its own pnpm root
├── llm-proxy/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── pnpm-workspace.yaml # allowBuilds: esbuild, workerd
└── (delete) package-lock.json, spacetimedb/package-lock.json, llm-proxy/package-lock.json
```

### Pattern 1: each package dir is its own pnpm root
**What:** Give `spacetimedb/` and `llm-proxy/` their own `pnpm-workspace.yaml` (settings only, no `packages:`), own `pnpm-lock.yaml`, and delete the npm lockfile and npm-layout `node_modules` first.
**Why:** pnpm 11 resolves the nearest `pnpm-workspace.yaml` upward. If the ROOT ever gains that file (pnpm writes `allowBuilds`/`minimumReleaseAgeExclude` placeholders into it), a bare `pnpm install` inside `spacetimedb/` silently installs the ROOT project instead and installs nothing in `spacetimedb/` (reproduced, exit 0, no `node_modules` created). A local file pins the root. [VERIFIED: dry run]

### Pattern 2: bindings regeneration is mechanical
Run `pnpm spacetime:generate` after `spacetimedb/` has the new SDK. Expect exactly: `index.ts` (header version, camelCase table keys, `accessor:` on indexes, deprecated snake_case alias block) plus 14 `my_*_table.ts` view files (row `id` column gains `.primaryKey()`). Review with `git diff --stat src/module_bindings` and expect 15 files. [VERIFIED: dry run diff against committed bindings]

### Anti-Patterns to Avoid
- **Adding `typescript` to `spacetimedb/package.json`, or putting `spacetimedb/` in a workspace whose root has TypeScript.** `spacetime build/publish/generate` then run `tsc` and exit 2 (233 errors, no bundle). The CLI prints "tsc not found in node_modules" today; that message is the healthy state. PATH is irrelevant (proven: root `.bin` on PATH did not trigger it); only `spacetimedb/node_modules` matters.
- **Running `pnpm install` in a dir that still has an npm-layout `node_modules`.** Root `node_modules` has both `.modules.yaml` (pnpm, 2026-02-24) and `.package-lock.json` (npm, 2026-03-10): mixed. Delete `node_modules` in all three dirs before the first pnpm install.
- **`--clear-database` / `--delete-data`.** Not needed; the publish plan shows no table changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reconnect logic for the Vue client | Custom reconnect wrapper in `main.ts` | Nothing (out of scope); document that Vue provider has no reconnect | The SDK's `ConnectionManager` (auto-reconnect on focus/online, identity reuse) is used only by React/Solid/Svelte providers; the Vue provider does not reference it (grep-verified). Adding reconnect is a feature, not this phase. |
| Data-dir backup | Custom copy scripts | `robocopy /E /MT:16` | Handles 16.8k files; restore with `/MIR` |
| Non-interactive publish | Piping `y` into prompts | `--break-clients` (or `--yes=break-clients`) | Skips only the break-clients prompt and never forces data deletion |
| Build-script approval for pnpm | Ignoring the error / `--ignore-scripts` | `allowBuilds:` map in `pnpm-workspace.yaml` | `strictDepBuilds` defaults to true in pnpm 11; ignoring leaves `workerd` unusable |
| Type errors from stale generated types | Hand-editing `src/module_bindings/` | Regenerate; fix call sites | CLAUDE.md hard rule |

## Runtime State Inventory

This is an upgrade/migration phase, so every category is answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Local SpacetimeDB data dir `C:\Users\Dell\AppData\Local\SpacetimeDB\data` = **11.5 GB** (`replicas` 10.4 GB / 16.8k files / 485 replica dirs, `program-bytes` 953 MB, `cache` 192 MB, `control-db`, `logs` 22 MB). `metadata.toml` says `version = "2.0.1"`. Server-side rule (source `crates/core/src/config.rs`): starting a newer server on it rewrites `metadata.toml` to the new version; an older server then refuses it ("newer, incompatible"). | **Data migration: none needed** (dry run: copy loaded on 2.10.1, `uwr` DB and rows intact). **Backup before first 2.10 start** because the metadata bump is one-way. |
| Live service config | Maincloud DB already runs the latest server (per note). First manual maincloud publish after this phase will show the same view remove/re-create plan (by analogy, [ASSUMED]). | None in this phase (never publish to maincloud); tell the user. |
| OS-registered state | CLI version manager: `%LOCALAPPDATA%\SpacetimeDB\bin\` holds `1.8.0, 1.11.0, 1.12.0, 2.0.1` side by side and `current` is a symlink to `2.0.1`; `spacetime.exe` proxy at `%LOCALAPPDATA%\SpacetimeDB\`. No scheduled tasks/services found for it. | `spacetime version install 2.10.1 --use` re-points `current`; old dirs stay, so CLI rollback = `spacetime version use 2.0.1`. |
| Secrets / env vars | `.env.local` (SpacetimeAuth client id, host, db name) and `llm-proxy/.dev.vars` (`PROXY_SECRET`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`) exist and are gitignored. Client localStorage holds `llm_proxy_secret`. Local CLI identity/JWT keys live in `%LOCALAPPDATA%\SpacetimeDB\config` (`id_ecdsa`, `id_ecdsa.pub`, `cli.toml`). | None to rename. **Back up `config\` together with `data\`** (keys tie the DB owner identity to the local server). Do not print secrets. |
| Build artifacts / installed packages | npm-layout `node_modules` in `spacetimedb/` and `llm-proxy/`; mixed layout at root; three `package-lock.json`; `dist/` dirs (gitignored); `client/src/module_bindings` is a STALE tracked duplicate of old bindings (last touched 2026-03-08, not referenced by root tsconfig/vite). | Delete `node_modules` + `package-lock.json` per dir before pnpm install; leave `client/` alone (flag as follow-up). |

## Common Pitfalls

### Pitfall 1: `pnpm build` is already failing before any bump
**What goes wrong:** Success criterion 6 cannot be met by "just upgrading". `vue-tsc -b` (first half of `pnpm build`) reports 137 errors today (baseline below); `vite build` alone succeeds.
**How to avoid:** Wave 0 task that reaches 0 vue-tsc errors on the current toolchain. Breakdown: 109 `TS6133` + 1 `TS6196` unused declarations (`src/App.vue` alone accounts for 106 of the 137 errors, the rest of the unused ones are spread over 12 other files), and 27 real type errors: `App.vue` (14: `EventTarget` typing in template handlers at 117/118/305/306, `boolean | null` at 99, unknown `races` and `inventoryItems` args at 782 and 2420, implicit `any` at 861/862, `string` vs `bigint` at 2516/2574, `abilityKey` at 2657), `CharacterInfoPanel.vue` (7, uses the OLD ability shape `id/levelRequired/resourceType` while bindings now expose `key/level/resource`), `NarrativeConsole.vue` (5, `undefined` vs `null` prop types) and `useCombat.ts` (1, fixed for free once optional fields become `foo?:`). Some may be latent runtime bugs (`abilityKey` missing on `HotbarDisplaySlot`, `string` passed where `bigint` expected at `App.vue` 2516 and 2574): fix deliberately, do not blanket-cast.
**Post-upgrade delta:** vue-tsc 3 + TS 6 + regenerated bindings give 134 errors: same set minus 4 (three `emit`/`props` false positives vanish under vue-tsc 3, one `targetCharacterId` error vanishes because optional fields are now `foo?:`) plus 1 new: `App.vue(87)` `TS2719` "two different types with this name exist" because `HotbarDisplaySlot` is declared three times (`NarrativeConsole.vue:144`, `NarrativeHotbar.vue:59`, `useHotbar.ts:13`). Fix by exporting one shared type.
**Warning signs:** `pnpm build` red at the `vue-tsc` step.

### Pitfall 2: publish stops at a prompt (or aborts) on the first 2.10.1 publish
**What goes wrong:** The 2.10.1 SDK carries the tables' primary keys onto view row types. Publishing over a 2.0.1-published DB prints "Database Migration Plan" with `Removed view` and `Created view` for `my_bank_slots, my_character_effects, my_combat_loot, my_combat_results, my_faction_standings, my_friend_requests, my_friends, my_group_events, my_group_invites, my_group_members, my_npc_dialog, my_panel_layout, my_player, my_quests` and "All clients will be disconnected due to breaking schema changes". No table changes; no deletion.
**How to avoid:** `spacetime publish uwr -p spacetimedb --server local --break-clients`. Tested with `--yes` in the dry run (identical outcome: "Updated database"); `--break-clients` is documented as equivalent to `--yes=break-clients` in the 2.10.1 `publish --help`. Never combine with `--delete-data`/`--clear-database`. Root script `spacetime:publish` has neither flag; either pass `-- --break-clients` once or run the CLI directly. Re-publishing the same schema afterwards is a no-op plan.
**Client impact:** all 7 `src/composables/data/use*Data.ts` composables register `onInsert`, `onUpdate` and `onDelete` and rebuild, so the new update events on PK views are handled.

### Pitfall 3: `spacetime build` runs `tsc` if it can see TypeScript
See Anti-Patterns. Also note `spacetimedb/tsconfig.json` sits under "options required by SpacetimeDB, do not modify". Keep the 233 pre-existing type errors out of scope. Counts are identical (233) under TS 5.6/SDK 2.0.1 and TS 6.0.3/SDK 2.10.1, so they are not an upgrade regression. Ten of them change code (`TS2345` to `TS2559`) at `spacetimedb.reducer('name', ...)` string-first calls, which the monkey-patch in `index.ts` rewrites to `{ name }` at runtime; harmless.

### Pitfall 4: pnpm 11 ignored-builds error and release-age gate
**What goes wrong:** `pnpm install` in llm-proxy exits 1 with `ERR_PNPM_IGNORED_BUILDS: esbuild, workerd` and writes placeholder `allowBuilds: esbuild: set this to true or false` into a new `pnpm-workspace.yaml`. Also, versions published less than 24 h ago are auto-added to `minimumReleaseAgeExclude` in that file when you request them explicitly (`hono@4.13.11`, `wrangler@4.143.0`, `workers-types@5.20260929.1` were all < 24 h old today).
**How to avoid:** Commit `pnpm-workspace.yaml` with `allowBuilds: {esbuild: true, workerd: true}` and use lower-bound ranges (`hono ^4.13.0`, `openai ^7.0.0`, `wrangler ^4.140.0`, `@cloudflare/workers-types ^5.20260926.1`): exit 0, resolves hono 4.13.10, openai 7.23.0, wrangler 4.142.0, workers-types 5.20260928.1, no excludes. Root and `spacetimedb/` need no `allowBuilds` (no build scripts). The `pnpm` field in `package.json` is no longer read by pnpm 11; do not put settings there.

### Pitfall 5: Vitest 5 defaults (`clearMocks: true`, top-level `vi.mock`, unawaited assertions)
Verified harmless here: root run and `spacetimedb/` run give identical pass/fail counts before and after. Note that root `vitest run` has no config, so it also collects all 16 `spacetimedb/src/**/*.test.ts` files (18 files, 509 tests in one run) and resolves `spacetimedb` from `spacetimedb/node_modules`, which therefore must be installed for the root run to work.

### Pitfall 6: assuming 2.10 gives the Vue app auto-reconnect
It does not. `ConnectionManager` (reconnect on visibility/focus/online, exponential backoff, identity reuse from 2.9) is wired only into React/Solid/Svelte providers. The Vue `SpacetimeDBProvider`, `useTable`, `useReducer`, `useSpacetimeDB` and `connection_state` files are **byte-identical** between 2.0.1 and 2.10.1 (`diff -r` clean); `useProcedure` is the only addition. Do not write tests or docs claiming reconnect behavior.

## Client-side 2.10 changes affecting this code

- **`onDisconnect` vs `onConnectError` (2.10.0, PR #5707):** after `InitialConnection` was received, a websocket `error` now records the error, closes the socket and fires `onDisconnect(ctx, err)`; before that (`#everConnected` false) it still fires `onConnectError`. [VERIFIED: `db_connection_impl.ts` lines 405-418 in the 2.10.1 package]
- **Effect on this app: none functional.** `main.ts` handlers only `console.log`. Vue provider sets `state.isActive = ctx.isActive` (false) in both paths; under the new routing `state.connectionError` is no longer set for mid-session errors. Grep of `src/` shows **no reader of `connectionError`**, no stale-token logic, and `conn.isActive` is read only by `useGameData`/`use*Data` watchers and `:conn-active` props (all still correct). `getStoredIdToken()` already drops expired tokens before connecting. **Recommendation:** no logic change; optionally make `onDisconnect` log the error (`console.warn('Disconnected from SpacetimeDB', err)`) so mid-session failures stay visible. That is logging only, so no new test is required by the project rule; if the planner extracts a handler helper with branching, add a vitest for it.
- **Runtime proof against a migrated DB:** with regenerated bindings, a vitest smoke test connected to a 2.10.1 server, subscribed, read `conn.db.location.count()`, confirmed both `conn.db.abilityCooldown` and the deprecated `conn.db.ability_cooldown` alias exist, then `disconnect()` produced events `["connect","disconnect:clean"]`. Mid-session websocket error routing was verified from source only (not simulated).
- **Bindings API:** `DbConnection.builder().withUri().withDatabaseName().withToken().onConnect().onDisconnect().onConnectError()` unchanged (builder diff only adds `brotli` compression and a `WebSocketFactory` type). `src/main.ts` needs no edit.
- **Compile-time:** regenerated bindings + vue-tsc 3 introduced no new error category (delta above). `tables.my_*` and `db.<snake_case>` accesses compile through the generated deprecated aliases. Optional fields become `foo?:`; `useCombat.ts(184)` improves.

## Scheduled-table audit (SC-2, second half)

2.10.1 change (#5736): scheduled calls are submitted to the executor concurrently; already-expired jobs are no longer guaranteed to run in `scheduled_at` order; `ctx.timestamp` stays monotonic. Reducers remain transactional. 2.8.3 anchors recurring intervals to the intended time (applies to `ScheduleAt.interval`; **this module uses only `ScheduleAt.time`**, one-shot rows that reducers re-insert). This module defines no procedures and no `ctx.http` use, so the head-of-line-blocking case that motivated the change does not occur here; the only observable change is ordering among simultaneously overdue rows (after downtime or restart).

Result: **no ordering assumption found** in any of the 16 scheduled tables.

| Table -> reducer | Behavior | Order-sensitive? |
|------------------|----------|------------------|
| `resource_gather_tick` -> `finish_gather` | looks up gather by id, no-op if gone; validates node lock and location | No (id-keyed, guarded) |
| `enemy_respawn_tick` -> `respawn_enemy` | spawn cap check then spawn | No (cap re-evaluated per run) |
| `pull_tick` -> `resolve_pull` | returns unless pull `pending`; re-validates spawn/character | No |
| `combat_loop_tick` -> `combat_loop` | returns unless combat `active`; timing from `ctx.timestamp` and per-row `nextAutoAttackAt`; reschedules itself with `ctx.timestamp + interval` | No |
| `health_regen_tick` -> `regen_health`, `cast_tick` -> `tick_casts` | full-table sweeps keyed on `ctx.timestamp`; self-reinsert | No |
| `effect_tick`, `hot_tick`, `round_timer_tick` | no-op reducers (`tick_effects`, `tick_hot`, `resolve_round_timer`) | N/A |
| `day_night_tick` -> `tick_day_night` | compares `world.nextTransitionAtMicros` to now, reinserts if early | No (idempotent) |
| `disconnect_logout_tick` -> `disconnect_logout` | skips if `player.lastSeenAt > arg.disconnectAtMicros` (timestamp-based, not order-based) | No |
| `character_logout_tick` -> `character_logout` | skips if any player still has the character active | No |
| `event_despawn_tick` -> `despawn_event_content` | `resolveWorldEvent` guards double-resolve (`status !== 'active'`) | No |
| `inactivity_tick` -> `sweep_inactivity`, `llm_cleanup_tick` -> `sweep_llm_errors` | reinsert first, then time-based sweeps | No |
| `bard_song_tick` -> `tick_bard_songs` | cleans up if combat not active; reinserts | No |

Residual, pre-existing (not caused by 2.10): each recurring tick relies on a guard (`tableHasRows`) to avoid duplicate rows, and one-shot rows are inserted only from inside serialized reducers, so concurrency does not create duplicates. Optional test (Claude's discretion): add unit tests using `helpers/test-utils.ts` `createMockDb` proving `tick_day_night`/`disconnect_logout`/`character_logout` are idempotent when invoked twice or in reversed order.

**Other server SDK API changes (2.0.1 to 2.10.1) that touch this module:** none break it. `Schema.reducer/init/clientConnected/clientDisconnected/view/procedure` overload shapes only gain optional-name variants; `exportGroup` is unchanged, so the monkey-patch registration in `spacetimedb/src/index.ts` (lines 249-286, 1831) still works (the module built and published on 2.10.1). Legacy `table({ scheduled: () => reducer })` is still supported (`onSchedule` is additive, 2.7.0). New 2.10.1 schedule validation ("table defines multiple schedules", "registered more than once") did not trigger. `ctx.sender` in procedures fixed in 2.6.1 (no procedures here).

## pnpm conversion (SC-5): recommendation = standalone per-directory pnpm projects

Evidence (all reproduced in the dry run):
1. Duplicate package name `uwr` in a workspace does **not** error (workspace install exit 0). The CONTEXT collision argument is weaker than assumed, but the decision stands for a stronger reason:
2. **Workspace mode leaks root `typescript` into `spacetimedb/node_modules/.bin`, which makes `spacetime build` type-check and fail (exit 2, no `dist/bundle.js`).** Standalone: `Build finished successfully`, message "tsc not found" (healthy).
3. pnpm's symlinked layout bundles fine: `spacetime build` on a pnpm-installed `spacetimedb/` succeeds (bundle 4.26 MB; differs from the npm-layout bundle only in embedded paths/size, not a failure).
4. wrangler works from a pnpm layout: `wrangler deploy --dry-run --outdir` (Total Upload 1026 KiB), and `wrangler dev` served all routes (see evidence), once `allowBuilds` covers `esbuild` and `workerd`.
5. Each dir needs its own `pnpm-workspace.yaml` (settings-only) so a future root-level file cannot capture it (Pattern 1).
6. `engines.node` ">=22.12" matches every floor: Vite 8 and plugin-vue 6 (`^20.19 || >=22.12`), Vitest 5 (`^22.12 || ^24 || >=26`), pnpm 11 (Node 22+), wrangler and openai 7 (`>=22`).

Also add `"test": "vitest run"` to root `package.json` (there is no root test script today; suites are run with `npx vitest run`). README says "Node.js 18+" which is stale; update to 22.12+. PROJECT.md and README tech tables are stale (SpacetimeDB 1.12.0, Vite 6.4.1, TS 5.6.2).

## SpacetimeDB upgrade mechanics on Windows (SC-1)

| Question | Answer | Source |
|----------|--------|--------|
| Does the old CLI stay installed? | Yes. `bin\` holds `1.8.0, 1.11.0, 1.12.0, 2.0.1` and `current` is a symlink to one of them; previous upgrades kept old dirs. Rollback = `spacetime version use 2.0.1`. | [VERIFIED: filesystem listing] |
| Commands | `spacetime version install 2.10.1 --use -y` (deterministic; `--edition standalone` default) or `spacetime version upgrade` (latest = 2.10.1 today). Not executed here (help-only) per the read-only rule. | [CITED: `spacetime version --help` / `install --help`] |
| Local data dir | `C:\Users\Dell\AppData\Local\SpacetimeDB\data` (contains `metadata.toml` 2.0.1, `config.toml`, `control-db`, `program-bytes`, `replicas`, `cache`, `logs`). Keys and `cli.toml` in `...\SpacetimeDB\config`. `spacetime start --data-dir` overrides. | [VERIFIED: filesystem] |
| Backup | `robocopy "%LOCALAPPDATA%\SpacetimeDB\data" "<dst>\data" /E /MT:16 /R:1 /W:1 /XD logs` and `robocopy "%LOCALAPPDATA%\SpacetimeDB\config" "<dst>\config" /E`. 11.5 GB, 16.8k files, roughly 5-10 minutes; 61 GB free on C:. robocopy exit codes 0-7 are success. Restore with the server stopped: `robocopy "<dst>\data" "<data>" /MIR`. Most of the 485 replica dirs are stale from earlier `--clear-database` publishes; do not prune in this phase. | [VERIFIED: ran the same copy into scratch] |
| Does a 2.0.1 DB load on 2.10.1? | **Yes.** Compat rule in source: same edition required; caret on previous `major.minor`; 2.x also runs 1.x. `^2.0` matches 2.10.1; then `metadata.toml` is rewritten to 2.10.1, so downgrade needs the backup. Empirically: a 2.10.1 standalone on the copied dir came up on 127.0.0.1:3100, `uwr` DB (host_type Js) answered, `SELECT * FROM location` returned the generated world, `world_state` row intact. | [VERIFIED: `crates/core/src/config.rs` @ v2.10.1 + dry run] |
| Start server in background | Git Bash/agent: `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` as a background process (default listens on 0.0.0.0, matching the `local` server nickname `127.0.0.1:3000` is better); poll `curl -s http://127.0.0.1:3000/v1/ping` until 200. Stop: `taskkill /F /IM spacetimedb-standalone.exe` (then the CLI parent exits). | [VERIFIED: dry run on ports 3100/3101] |
| `generate --module-path` still valid? | Yes. 2.10.1 help: `-p, --module-path <module_path>` (plus `-b`, `-j`, `-o`, `-l`, `--include-private`, `-y`). Root script `spacetime:generate` works unchanged. | [VERIFIED: 2.10.1 CLI help + ran generate] |
| `spacetime:publish` form | `spacetime publish uwr --server local` still valid; 2.10.1 adds `--yes[=all\|remote\|migrate\|break-clients\|skip-login\|delete-data]` (value must be attached with `=`), `--native-aot`, `--dotnet-version`. `-c/--delete-data` unchanged. | [VERIFIED: help diff 2.0.1 vs 2.10.1] |
| Publishing 2.0.1-built module to a 2.10.1 server, then 2.10.1-built over it, no clear | Both succeed; second shows the 14-view plan and disconnect warning (Pitfall 2). | [VERIFIED: dry run] |

## Tooling breaking changes with concrete fixes

| Tool | Change that could bite | Finding here |
|------|------------------------|--------------|
| TypeScript 6.0.3 | defaults (`types: []`, strict, deprecations for `baseUrl`/`moduleResolution: node`) | No config errors in any of the 3 tsconfigs. Root sets `types` explicitly; `spacetimedb/` error set identical (233); llm-proxy `tsc --noEmit` clean with workers-types 5 |
| vue-tsc 3.3.11 | stricter template checking | 0 new categories; net -3 (see Pitfall 1) |
| Vite 8.3.1 | Rolldown/Oxc, CSS minify via Lightning CSS, `rollupOptions` renamed `rolldownOptions`, default targets Chrome/Edge 111, Firefox 114, Safari 16.4, CJS interop consistency | `vite.config.ts` unchanged; `vite build` OK (3.5 s vs 8.3 s), dev server serves `/`, `main.ts`, `App.vue`, optimized `spacetimedb/vue`. Only risk: CJS default-import interop for `html2canvas` (default import in `App.vue`); package has an ESM `module` entry, build output includes it; verify the screenshot feature manually |
| @vitejs/plugin-vue 6.0.9 | Node floor, no CJS build | No change |
| Vitest 5.0.2 | `clearMocks: true`, top-level `vi.mock/hoisted`, unawaited async assertions fail, `-t` pattern joins with ` > ` | Identical results: root 507/509, `spacetimedb/` 476/478 (same 2 failures) |
| openai 7.23.0 | v5 fetch rewrite, v6 Responses types | `chat.completions.create` path works under workerd; real call reached OpenAI (see evidence) |
| hono 4.13.x, wrangler 4.14x, workers-types 5 | v5 removes dated entrypoints; wrangler peer requires workers-types 5.x | `types: ["@cloudflare/workers-types"]` still valid; `compatibility_date = "2025-01-01"` accepted with no warning; leave unchanged |

## Code Examples

### pnpm-workspace.yaml for `llm-proxy/` (committed)
```yaml
# Source: pnpm 11 behavior reproduced in dry run (strictDepBuilds=true, allowBuilds map)
allowBuilds:
  esbuild: true
  workerd: true
```

### pnpm-workspace.yaml for `spacetimedb/` (committed; makes it its own pnpm root)
```yaml
minimumReleaseAgeExclude: []
```

### llm-proxy/package.json dependency block
```json
"dependencies": { "hono": "^4.13.0", "openai": "^7.0.0" },
"devDependencies": { "@cloudflare/workers-types": "^5.20260926.1", "wrangler": "^4.140.0" }
```

### Root package.json edits
```json
"engines": { "node": ">=22.12" },
"scripts": { "test": "vitest run" },
"dependencies": { "spacetimedb": "^2.10.1", "vue": "^3.5.43" },
"devDependencies": { "@vitejs/plugin-vue": "^6.0.9", "typescript": "~6.0.3", "vite": "^8.3.1", "vitest": "^5.0.2", "vue-tsc": "^3.3.11" }
```

### `spacetimedb/package.json`: bump only, no typescript
```json
"dependencies": { "spacetimedb": "^2.10.1" }, "devDependencies": { "vitest": "^5.0.2" }
```

### Publish (local only), then regenerate
```bash
spacetime publish uwr -p spacetimedb --server local --break-clients   # never maincloud, never --clear-database
pnpm spacetime:generate
git diff --stat src/module_bindings                                  # expect 15 files
```

### llm-proxy smoke (SC-4): reproduces all three response paths
```bash
cd llm-proxy && pnpm exec wrangler dev --port 8787 --ip 127.0.0.1 &   # uses llm-proxy/.dev.vars
curl -s http://127.0.0.1:8787/                                          # {"status":"ok"}
curl -s -X POST http://127.0.0.1:8787/api/llm -H "Content-Type: application/json" -d '{}'   # 401
curl -s -X POST http://127.0.0.1:8787/api/llm -H "Authorization: Bearer $PROXY_SECRET" \
  -H "Content-Type: application/json" -d '{"model":"gpt-4o-mini"}'                            # 400 missing fields
# Real success (needs the real OPENAI_API_KEY in .dev.vars; costs a few tokens):
curl -s -X POST http://127.0.0.1:8787/api/llm -H "Authorization: Bearer $PROXY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","systemPrompt":"Reply with the word ok.","userPrompt":"ping"}'   # {"ok":true,"text":...}
```
In the dry run a dummy key produced 401/400/502 exactly as expected, and the 502 body carried OpenAI's real "401 Incorrect API key" message, proving openai 7 under workerd reaches OpenAI. Note pre-existing: the proxy ignores `maxTokens` from the client; leave unchanged.

### `buildLookOutput` test fixes (Wave 0)
`spacetimedb/src/reducers/intent.test.ts` line 40: expect `'{{color:#fbbf24}}Test Town{{/color}}'` (or a strip-tags helper) instead of `'Test Town'`; line 197: same for `'Town'`. Source of the tag: `spacetimedb/src/helpers/look.ts:14`.

## CLAUDE.md / AGENTS.md stale-rule inventory (SC-7)

Apply identical edits to both files (they are byte-identical). Keep edits surgical.

| Line(s) | Stale text | Correct for 2.10 | Evidence |
|---------|------------|------------------|----------|
| 95 | "Tested with: SpacetimeDB runtime 1.11.x, npm `spacetimedb` 1.11.x" (and "Last updated 2026-01-06") | 2.10.x | this phase |
| 155 (table row) and 256-263 ("Multi-column indexes are BROKEN", `PANIC`) | multi-column `.filter()` broken, use single column | One-column prefix scans fixed in 2.7.0 (#5428); composite range scans fixed in 2.8.0 (#5479). Reword to "works from 2.7/2.8; prefix then optional terminal range" and drop the PANIC warning | release notes v2.7.0-hotfix3, v2.8.0 |
| 181-191, 245, 401-402 | index option `name: 'by_owner'` | `accessor: 'by_owner'` (required since 2.0.4, #4525); `ctx.db.myTable.by_owner` uses the accessor | release v2.0.4; `schema/tables.ts` already uses `accessor:` |
| 322-323 | `scheduled: 'run_cleanup'` (string) | function form `scheduled: () => reducerExport`; `onSchedule` on reducers/procedures is the additive newer form (2.7.0) | 2.10.1 `table.ts` type: `scheduled?: () =>` |
| 508 | `"spacetimedb": "^1.11.0"` | `^2.10.1` | this phase |
| 528-532 | Procedures "currently in beta" | Procedures and `ctx.http` stable since 2.5.0 (HTTP handlers/views/RLS remain unstable-gated); `ctx.sender` in procedures fixed in 2.6.1 | release v2.5.0, v2.6.1 |
| Client section | generated handles | camelCase handles since 2.7.0; snake_case are deprecated aliases (add one line); optional row fields are `foo?:` since 2.6.1 | releases |
| Views row (155, 413-424) | "`.iter()` in views not allowed" | keep (carried from exploration note; not re-verified in 2.10.1) | [ASSUMED] |

## State of the Art

| Old approach | Current approach | Since | Impact |
|--------------|------------------|-------|--------|
| Index `name:` | `accessor:` | 2.0.4 | Already compliant in code |
| snake_case client handles | camelCase + deprecated aliases | 2.7.0 | No code change now (todo deferred) |
| Multi-column filter panics | prefix (2.7.0) and range (2.8.0) scans work | 2.7-2.8 | Update docs only; composite `by_key` is unused |
| Sequential scheduled dispatch | Concurrent dispatch of overdue jobs | 2.10.1 | Audit done, no change |
| Websocket error on live connection -> `onConnectError` | -> `onDisconnect(ctx, err)` | 2.10.0 | Logging only here |
| TS module views without PK | View row PKs carried from table PK | 2.4.1 | 14 views re-created on publish |
| npm | pnpm 11 (`allowBuilds`, 1-day `minimumReleaseAge`, settings in `pnpm-workspace.yaml`) | pnpm 11 | Pitfall 4 |

**Deprecated/outdated:** `onlyBuiltDependencies`/`neverBuiltDependencies` and the `package.json` `pnpm` field (pnpm 11 ignores them); `@cloudflare/workers-types` dated entrypoints (removed in v5); TypeScript 7 for this repo (no compiler JS API yet; revisit after TS 7.1).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Views still cannot use `.iter()` in 2.10.1 (carried from the exploration note; not re-tested) | CLAUDE.md inventory | A rule would be kept that is now stale; harmless |
| A2 | `--break-clients` alone is sufficient for a non-interactive local publish (only `--yes` was executed; help says they are equivalent for that prompt) | Pitfall 2 | Publish prompts; fall back to `--yes=break-clients` |
| A3 | Rolldown's CJS interop leaves `html2canvas` default import working at runtime (build and dev serve pass; feature not exercised) | Tooling table | Screenshot feature breaks; manual check or `import * as` fix |
| A4 | The first maincloud publish will show the same view remove/re-create plan | Runtime State | User surprise on manual deploy; mention in the phase summary |
| A5 | Mid-session websocket error routing behaves as the source reads (not simulated) | Client section | Only logging is affected |
| A6 | `spacetime version install/upgrade` behaves on this machine as `--help` and the directory layout imply (not executed, read-only rule) | SpacetimeDB mechanics | Executor should confirm `spacetime --version` after install |
| A7 | The live game flow (login via SpacetimeAuth OIDC, character create/load, combat, LLM proxy round trip) works end to end on the upgraded stack; only headless connect/subscribe was exercised | SC-6 | Requires the human checkpoint |

## Open Questions

1. **How to reach zero `vue-tsc` errors (Wave 0)?**
   - Known: 137 pre-existing (109 unused declarations, 27 real). The CONTEXT says trivial pre-existing failures should be fixed in this phase.
   - Unclear: whether to delete the ~109 dead destructured bindings (mostly `App.vue`) or relax `noUnusedLocals`/`noUnusedParameters` in root `tsconfig.json`.
   - Recommendation: fix, do not relax (deleting unused bindings is behavior-neutral); treat the 27 real errors individually and note any latent runtime bug they expose. Escalate to the user only if a fix would change behavior (e.g. `CharacterInfoPanel.vue` ability shape).
2. **Should the connection handlers get a UX response (banner/reload) on `onDisconnect`?**
   - Known: no behavior change is forced by 2.10; the Vue provider never reconnects.
   - Recommendation: out of scope; add the error to the log line only.
3. **Do the root `package.json` scripts `spacetime:publish` need `--break-clients`?**
   - Recommendation: no; the plan is one-time. Run the direct command once, then the script is a no-op.
4. **Delete the stale tracked `client/src/module_bindings/`?**
   - Recommendation: leave and file a follow-up; not referenced by any config.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | yes | 22.23.2 (meets `>=22.12`) | - |
| pnpm | SC-5 | yes | 11.23.0 | - |
| SpacetimeDB CLI | SC-1 | yes, needs upgrade | 2.0.1 installed; 2.10.1 release asset downloadable (also downloaded to scratch for the rehearsal) | `spacetime version use 2.0.1` rollback |
| Local SpacetimeDB server | publish/tests/manual run | not running | - | start with `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` |
| Disk space | 11.5 GB backup | yes | 61 GB free on C: | prune stale replicas (not in scope) |
| robocopy | backup | yes (Windows) | - | - |
| Cloudflare wrangler / workerd | SC-4 | via pnpm install | wrangler 4.14x | - |
| OpenAI key | real `/api/llm` success | `llm-proxy/.dev.vars` present (validity unknown, not read) | - | dummy-key smoke proves the code path; real success = human step |
| SpacetimeAuth creds | manual login | `.env.local` present (not read) | - | - |
| Network (npm, GitHub) | installs | yes | - | - |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** SpacetimeDB CLI 2.10.1 (install step is part of the plan).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (root) and 3.2.x (`spacetimedb/`) today; 5.0.2 after the phase |
| Config file | none in either package (defaults); do not add one unless needed |
| Quick run command | `pnpm exec vitest run` at root (collects root `src/` and `spacetimedb/src/` tests: 18 files, 509 tests, ~10-20 s) |
| Module-only command | `pnpm --dir spacetimedb test` (16 files, 478 tests, ~10-20 s) |
| Full suite command | `pnpm build && pnpm exec vitest run && pnpm --dir spacetimedb test` |

### Baseline recorded 2026-09-29 (before any change)
| Check | Result |
|-------|--------|
| Root `vitest run` | 17/18 files pass; 507/509 tests pass; failing: `spacetimedb/src/reducers/intent.test.ts` `buildLookOutput` x2 |
| `spacetimedb/` `vitest run` | 15/16 files; 476/478 (same 2) |
| Root `vue-tsc --noEmit` (`pnpm build` step 1) | **137 errors, exit non-zero** (109 TS6133, 1 TS6196, 27 others); `pnpm build` FAILS |
| Root `vite build` alone | passes (715.99 kB JS, 8.3 s) |
| `spacetimedb/` `tsc --noEmit` | 233 errors (158 TS7006, 19 TS7031, 24 TS2339, others); not a gate, `spacetime publish` bundles without it |
| Rehearsed post-upgrade (scratch) | vue-tsc 134 errors; vite build passes (3.5 s); root vitest 507/509; `spacetimedb/` vitest 476/478; `spacetime build` OK; llm-proxy `tsc` clean |

### Phase Requirements to Test Map
| SC | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| SC-1 | CLI/SDK on 2.10.x | smoke | `spacetime --version` shows 2.10.1; `grep '"version"' node_modules/spacetimedb/package.json` in both dirs | n/a |
| SC-1 | bindings regenerated and clean | script | `pnpm spacetime:generate && git diff --stat src/module_bindings` (15 files) | n/a |
| SC-1 | publish without clear | integration | `spacetime publish uwr -p spacetimedb --server local --break-clients` exits 0, plan lists only views | n/a |
| SC-2 | connection error handling | manual + optional unit | code review of `main.ts`; optional vitest if a helper is extracted | Wave 0 (optional) |
| SC-2 | scheduled order-independence | unit (optional) | vitest using `createMockDb` for `disconnect_logout`, `character_logout`, `tick_day_night` | Wave 0 (optional) |
| SC-3 | versions in package.json and lockfile | script | `pnpm ls --depth 0` per dir; `node -e` version assertions | n/a |
| SC-4 | `/api/llm` under wrangler dev | smoke | curl sequence in Code Examples (health, 401, 400, real call) | Wave 0: add `llm-proxy/scripts/smoke.sh` (optional) |
| SC-5 | pnpm only | script | `git ls-files \| grep package-lock` returns nothing; `pnpm-lock.yaml` exists in 3 dirs; `pnpm install --frozen-lockfile` passes in each | n/a |
| SC-6 | build and tests | full | full suite command above (must be 0 vue-tsc errors and 509/509 tests) | requires Wave 0 fixes |
| SC-6 | game runs end to end | manual (human checkpoint) | start server, publish, `pnpm dev`, log in, create/load character, `look`, move, fight, panels backed by `my_*` views update | manual only: needs OIDC login and live session |
| SC-7 | CLAUDE.md/AGENTS.md rules | script | `grep -n "1.11\|BROKEN\|name: 'by_" CLAUDE.md AGENTS.md` returns nothing; `cmp CLAUDE.md AGENTS.md` identical | n/a |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run` (root) and, for module bumps, `pnpm --dir spacetimedb test`
- **Per wave merge:** full suite command, plus `spacetime build -p spacetimedb` (no errors, no `tsc` message change)
- **Phase gate:** full suite green, llm-proxy smoke, local publish clean, human live-session check

### Wave 0 Gaps
- [ ] Fix the two failing `buildLookOutput` tests (lines 40 and 197 of `spacetimedb/src/reducers/intent.test.ts`)
- [ ] Reach 0 `vue-tsc` errors on the current toolchain (137), making `pnpm build` green BEFORE bumping tooling
- [ ] Add root `"test": "vitest run"` script
- [ ] (optional) `llm-proxy/scripts/smoke.sh` codifying the curl sequence
- [ ] (optional) idempotency tests for the scheduled reducers listed above
- [ ] Framework install: none new (Vitest already present; only version bumps)

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`, so included. This phase changes dependency versions and package-manager configuration, not application logic; the relevant controls are supply-chain and secrets handling.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change | SpacetimeAuth OIDC unchanged; token handling in `src/auth/spacetimeAuth.ts` untouched |
| V3 Session Management | no change | Vue provider unchanged between 2.0.1 and 2.10.1 |
| V4 Access Control | verify only | 14 views are re-created on publish; confirm the `my_*` views still filter by sender after the first live run (private tables + per-user views) |
| V5 Input Validation | no change | llm-proxy still validates `model/systemPrompt/userPrompt` (400 path re-verified) and bearer secret (401 path re-verified) |
| V6 Cryptography | no change | No custom crypto; local server keys backed up, not regenerated |
| V14 Config / Dependencies | yes | pnpm 11 `minimumReleaseAge` (1 day), `strictDepBuilds`, explicit `allowBuilds`; lockfile regenerated and committed |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Compromised or slopsquatted dependency | Tampering | All 12 packages are established, official-repo packages already in use; pnpm 1-day release-age gate; only `esbuild` and `workerd` allowed to run install scripts |
| Secrets in scratch/backup copies | Information disclosure | Never print `.env.local`, `.dev.vars`, `cli.toml` tokens; the backup of `config\` contains private keys: store outside the repo and outside cloud-synced folders |
| Accidental production deploy | Tampering | No `git push`, no `--server maincloud`, no `wrangler deploy`; `spacetime:publishprod` script must not be run |
| Data loss on publish | Denial of service | Backup first; never `--clear-database`/`--delete-data`; publish plan shows views only |
| Local server bound to all interfaces | Elevation of privilege | Start with `--listen-addr 127.0.0.1:3000` |

## Dry-run evidence (scratch, not in the repo)

Everything below was executed under the session scratchpad; the repo `git status` still shows only the pre-existing `.claude/settings.local.json` change, `spacetime --version` is still 2.0.1, and the real data dir `metadata.toml` is still 2.0.1.

- Downloaded the 2.10.1 CLI zip to scratch and ran `spacetimedb-cli.exe` directly with `--config-path`/`--root-dir` pointing at scratch (does not touch the installed CLI or its config).
- Built and generated: `spacetime build` on a scratch copy of `spacetimedb/` with SDK 2.10.1 (bundle 4.26 MB); `spacetime generate` output diffed against `src/module_bindings`: 15 files differ (14 view files + `index.ts`).
- Loaded a full copy of the real data dir with a 2.10.1 standalone on port 3100 (metadata bumped in the copy only): DB `uwr` up, world rows intact. Stopped and deleted the copy.
- Fresh 2.10.1 server on port 3101: published a 2.0.1-built bundle, then the 2.10.1-built bundle without clearing. Second publish plan: 14 views removed and created, no table change; a vitest smoke test using regenerated bindings connected, subscribed, saw both camelCase and deprecated snake_case handles, and disconnected cleanly.
- Root toolchain on a scratch copy of `src/` with regenerated bindings: `vue-tsc` 134 errors; `vite build` OK; `vite` dev server serves modules; `vitest run` 507/509 with `spacetimedb/src` copied in.
- llm-proxy on a scratch copy: pnpm install (needs `allowBuilds`), `wrangler deploy --dry-run` OK, `wrangler dev` responses 200/401/400/502 as designed, `tsc --noEmit` clean.
- pnpm layout experiments: standalone `spacetimedb/` builds; workspace makes `tsc` visible and the build exits 2; bare `pnpm install` inside a subdir under a root `pnpm-workspace.yaml` installs the root instead.

## Sources

### Primary (HIGH confidence)
- `npm view` for all packages (versions, engines, peers, publish times), 2026-09-29
- SpacetimeDB GitHub releases v2.0.2 through v2.10.1 (`gh release view`), esp. v2.0.4, v2.2.0, v2.4.1, v2.5.0, v2.6.1, v2.7.0-hotfix3, v2.7.1, v2.8.0, v2.8.3, v2.9.0, v2.10.0, v2.10.1
- `crates/core/src/config.rs` @ v2.10.1 (`MetadataFile::check_compatibility`), fetched via `gh api`
- `spacetimedb@2.10.1` and `@2.0.1` npm tarballs diffed (`src/vue`, `src/sdk`, `src/server`)
- Installed CLIs' `--help` (2.0.1 and 2.10.1) and local filesystem inspection
- Executable dry runs described above

### Secondary (MEDIUM confidence)
- [Vitest migration guide](https://vitest.dev/guide/migration.html), [Vite migration guide](https://vite.dev/guide/migration.html)
- [pnpm 11.0 release notes](https://pnpm.io/blog/releases/11.0) (allowBuilds, strictDepBuilds, minimumReleaseAge default 1440, settings location)
- [Cloudflare changelog: workers-types v5](https://developers.cloudflare.com/changelog/post/2026-07-03-workers-types-v5/)

### Tertiary (LOW confidence)
- `.planning/notes/platform-upgrade-research.md` claims not independently re-tested (views `.iter()` limitation, vue-tsc/TS7 blocker issue link)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, installed and exercised together
- Architecture / mechanics: HIGH, rehearsed against a copy of the real data and a fresh server
- Pitfalls: HIGH, each reproduced; A2-A7 are the residual unknowns
- Live game behavior: MEDIUM, only headless checks; human checkpoint required

**Research date:** 2026-09-29
**Valid until:** 2026-10-06 (fast-moving: several dependencies published within the last week; re-run `npm view` before pinning ranges)
