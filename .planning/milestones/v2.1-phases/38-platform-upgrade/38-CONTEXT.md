# Phase 38: Platform Upgrade - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning
**Mode:** Infrastructure phase — smart discuss skipped grey areas; locked decisions carried over from the 2026-09-29 `/gsd-explore` session

<domain>
## Phase Boundary

Bring the project onto current, supported versions of SpacetimeDB (CLI, server SDK, client SDK → 2.10.x) and the frontend/test/proxy toolchains, with no behaviour regressions, before further feature work. Also fix the package-manager split: pnpm becomes the only package manager.

In scope: version bumps, bindings regeneration, the code changes the new versions need (2.10 connection-error semantics, the scheduled-function concurrency audit, vue-tsc 3 template errors, Vitest 5 behaviour), lockfile cleanup, `engines` field, and refreshing the stale SpacetimeDB rules in CLAUDE.md.

Out of scope: feature work, migrating the ~273 snake_case client table handles to camelCase (todo exists), retiring llm-proxy in favour of procedure HTTP (spike todo exists), and adopting new 2.10 features such as `useProcedure`, view primary keys, or `table.clear()`.

Research input: `.planning/notes/platform-upgrade-research.md` — version gap table, breaking changes, and suggested order. The planner should treat it as primary research and extend it, not redo it.

</domain>

<decisions>
## Implementation Decisions

### Locked by the exploration session (see research note)
- **TypeScript pinned to `~6.0.3`, NOT 7.** TS 7.0.x has no compiler JS API, so vue-tsc cannot run on it (vuejs/language-tools#5381).
- **Target versions:** spacetimedb 2.10.x (CLI + root + `spacetimedb/`), Vue 3.5 latest, Vite 8, @vitejs/plugin-vue 6, vue-tsc 3, Vitest 5 in both root and `spacetimedb/`, hono latest 4.x, openai 7.x, wrangler latest 4.x, @cloudflare/workers-types 5.x.
- **Upgrade order, with build + tests after each step:** (1) SpacetimeDB: CLI, both packages, regenerate bindings, publish locally, test → (2) Vitest 5 in `spacetimedb/` → (3) llm-proxy deps + `wrangler dev` smoke test → (4) root: Vue patch, then TS ~6.0 + vue-tsc 3 (fix template errors), then Vite 8 + plugin-vue 6 + Vitest 5 → (5) lockfile cleanup, `engines`, CLAUDE.md refresh.
- **Publish locally WITHOUT `--clear-database`.** The upgrade must not force a schema wipe.
- **Back up the local SpacetimeDB data directory before the first 2.10 server start.** It is unknown whether a database created under 2.0.1 loads cleanly on 2.10.1 (medium confidence).
- **pnpm is the single package manager.** Regenerate `pnpm-lock.yaml` (stale since 2026-02-24), delete the stray root `package-lock.json`, and declare `"engines": {"node": ">=22.12"}` (the Vitest 5 floor; local Node is 22.23.2).
- **Update CLAUDE.md's stale SpacetimeDB rules** to match 2.10: the "tested with 1.11.x" header, index `name:` → `accessor:`, and the multi-column index `.filter()` warning (fixed in 2.7/2.8). Keep the edits surgical, and don't rewrite unrelated sections.
- **Deferred to todos, not this phase:** the camelCase table-handle migration and the procedure-HTTP spike.

### Safety constraints (project-level, non-negotiable)
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

</decisions>

<code_context>
## Existing Code Insights

### Current versions (from package.json files)
- Root `package.json` (`"name": "uwr"`, `"type": "module"`): spacetimedb ^2.0.1, vue ^3.5.13, typescript ~5.6.2, vite ^6.4.1, @vitejs/plugin-vue ^5.2.4, vue-tsc ^2.2.0, vitest ^4.0.18, @types/node ^25.2.3, html2canvas ^1.4.1
- `spacetimedb/package.json` (`"name": "uwr"`, the same name as the root): spacetimedb ^2.0.1, vitest ^3.2.1; `test` script is `vitest run`
- `llm-proxy/package.json`: hono ^4.7.0, openai ^4.85.0, wrangler ^4.0.0, @cloudflare/workers-types ^4.20250130.0
- SpacetimeDB CLI installed: 2.0.1 (`C:\Users\Dell\AppData\Local\SpacetimeDB\bin\current`); default server is `local` (127.0.0.1:3000); the local server is not running at context time
- Tooling available: Node v22.23.2, pnpm 11.23.0, npm 10.9.8

### Lockfiles
- Root: `pnpm-lock.yaml` (stale, 2026-02-24) AND `package-lock.json` (updated by npm in 034-01 and the HOJ commit). Delete the npm one and regenerate the pnpm one.
- `spacetimedb/package-lock.json` and `llm-proxy/package-lock.json` are npm only; there is no `pnpm-workspace.yaml`.

### Config files
- Root `tsconfig.json`: `moduleResolution: bundler`, `types: ["vite/client", "node"]`, strict, `noUnused*`, `noUncheckedSideEffectImports`. It doesn't use `baseUrl` or `moduleResolution: node`, so the TS 6 deprecations don't hit it.
- `spacetimedb/tsconfig.json`: the SpacetimeDB-required options are marked "should not be modified" (`target: ESNext`, `lib: [ES2021, dom]`, `module: ESNext`, `isolatedModules`, `noEmit`).
- `llm-proxy/tsconfig.json`: `types: ["@cloudflare/workers-types"]`, `jsxImportSource: hono/jsx`.
- `vite.config.ts`: only `vue()` plus a `define` for `__BUILD_VERSION__`. No config change is expected for Vite 8.
- There is no `vitest.config.*` in either package, so defaults apply. Watch the Vitest 5 `clearMocks: true` default change.
- `llm-proxy/wrangler.toml`: `compatibility_date = "2025-01-01"`, `nodejs_compat`. `.dev.vars` exists, so a local smoke test is possible.

### Integration points
- `src/main.ts`: `DbConnection.builder()` with `.onConnect/.onDisconnect/.onConnectError` (the latter two only `console.log`). It uses `SpacetimeDBProvider` from `spacetimedb/vue`, and `.withDatabaseName(DB_NAME)`.
- `src/module_bindings/` is generated. Regenerate with `pnpm spacetime:generate` (`spacetime generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb`) and never hand-edit it. Check that the `--module-path` flag is still valid in the 2.10 CLI.
- `spacetimedb/src/schema/tables.ts`: 16 scheduled tables; indexes already use `accessor:`.
- Tests: 16 `*.test.ts` in `spacetimedb/src`, 2 in `src/`.
- `package.json` scripts `spacetime:publish` / `spacetime:publishprod`. Never run the prod one.

### Known pre-existing issues (establish a baseline BEFORE upgrading)
- `spacetimedb/` `tsc --noEmit` had pre-existing errors (`.planning/phases/36-ability-expansion/deferred-items.md`: RowBuilder typing, implicit any, and others). `spacetime publish` bundles with its own toolchain, so these didn't block publishing.
- 2 pre-existing failing tests in `spacetimedb/src/reducers/intent.test.ts` (`buildLookOutput`, which expects bare names but now gets color-tagged ones). See `.planning/phases/34-narrative-ui-integration/deferred-items.md`.
- Record the baseline for `pnpm build`, both test suites, and `tsc` before any bump, so regressions can be told apart from pre-existing failures. The success criterion is that all suites pass, so trivial pre-existing failures should be fixed as part of this phase.

### Deployment note
- There is no in-repo deploy workflow: `.github/workflows/static.yml` was removed in `ab9b0fee`, and GitHub Pages last deployed on 2026-02-25. Lockfile changes therefore don't affect an in-repo CI. An external host that detects the package manager from the lockfile can't be ruled out, so flag it for the user before any future push.

</code_context>

<specifics>
## Specific Ideas

- Follow the research note's "Suggested order" and the rule to build and test after each step.
- Smoke-test llm-proxy with a real `/api/llm` call under `wrangler dev` (success criterion 4).
- "The game runs locally end to end" (success criterion 6) needs a live session. Expect a human-verification checkpoint: start the local server, publish, run `pnpm dev`, log in, and exercise a character.

</specifics>

<deferred>
## Deferred Ideas

- Migrate ~273 snake_case client table-handle references to camelCase, and type the connection as `DbConnection`: `todos/pending/2026-09-29-migrate-client-table-handles-to-camelcase.md`
- Spike procedure `ctx.http.fetch` on 2.10 to retire llm-proxy: `todos/pending/2026-09-29-spike-procedure-http-to-retire-llm-proxy.md`
- Adopt new 2.10 features (Vue `useProcedure`, view primary keys, `table.clear()`, `spacetime logs --level`, `spacetime lock`, `spacetime mcp`)
- TypeScript 7 once vue-tsc supports it (expected with TS 7.1, around October 2026)

</deferred>
