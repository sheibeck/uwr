---
phase: quick-198
plan: 01
subsystem: version-check
tags: [spacetimedb, versioning, subscription, polling-removal, vite]
dependency_graph:
  requires: []
  provides: [AppVersion table, set_app_version reducer, subscription-based version reload]
  affects: [spacetimedb/src/schema/tables.ts, spacetimedb/src/index.ts, src/main.ts, src/composables/useGameData.ts, src/App.vue, vite.config.ts]
tech_stack:
  added: []
  patterns: [SpacetimeDB table subscription for version check, window.__client_version global for cross-component access]
key_files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/index.ts
    - src/composables/useGameData.ts
    - src/main.ts
    - src/App.vue
    - vite.config.ts
decisions:
  - Expose CLIENT_VERSION via window.__client_version so App.vue watch can compare without prop drilling
  - Use @ts-expect-error comment on tables.appVersion until spacetime generate is run
  - Cast rows as Array<{ version: string }> in App.vue watch to avoid ts errors with ungenerated bindings
metrics:
  duration: 3min
  completed: 2026-02-19
---

# Phase quick-198 Plan 01: Replace Polling Version Check with SpacetimeDB Subscription Summary

Replaced 60-second setInterval polling loop in main.ts with SpacetimeDB subscription-based version check using AppVersion table and reactive watch in App.vue.

## What Was Built

### Server

- **AppVersion table** (`spacetimedb/src/schema/tables.ts`): Public single-row table with `id` (u64 autoInc primaryKey), `version` (string), `updatedAt` (timestamp). Added to `schema(...)` export.
- **set_app_version reducer** (`spacetimedb/src/index.ts`): Admin-gated reducer that upserts the single AppVersion row. Uses `[...ctx.db.appVersion.iter()][0]` pattern since the table has at most 1 row and this is a reducer (not a view).

### Client

- **useGameData.ts**: Added `const [appVersionRows] = useTable(tables.appVersion)` (with `@ts-expect-error bindings pending regeneration`) and exported `appVersionRows`.
- **App.vue**: Destructured `appVersionRows` from `useGameData()`, added `watch(appVersionRows, ...)` that compares `rows[0]?.version` to `window.__client_version` and calls `window.location.reload()` on mismatch (skips `'dev'` builds and cases where either version is missing).
- **main.ts**: Removed `checkForUpdates` function and `setInterval(checkForUpdates, 60_000)` block. Kept `CLIENT_VERSION` declaration, assigned to `window.__client_version`. Added `__client_version?: string` to `Window` interface.
- **vite.config.ts**: Removed `versionPlugin` function, `writeFileSync` import, and `resolve` import. Removed `versionPlugin()` from plugins array. Kept `BUILD_VERSION` constant and `define: { __BUILD_VERSION__ }` block.

## Deployment Steps Required

After merging:

1. `spacetime publish uwr --project-path spacetimedb` — publishes the new AppVersion table and set_app_version reducer.
2. `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` — regenerates bindings (produces `app_version_table.ts`). Remove the `@ts-expect-error` comment in `useGameData.ts` once bindings exist.
3. On each deployment, call `conn.reducers.setAppVersion({ version: BUILD_VERSION })` from the admin panel or via browser console (admin identity only). Connected clients will receive the subscription update and auto-reload within milliseconds.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

**Files verified:**
- FOUND: spacetimedb/src/schema/tables.ts (AppVersion table definition present)
- FOUND: spacetimedb/src/index.ts (set_app_version reducer present)
- FOUND: src/composables/useGameData.ts (appVersionRows added)
- FOUND: src/main.ts (checkForUpdates removed, CLIENT_VERSION + window.__client_version present)
- FOUND: src/App.vue (appVersionRows destructured, watch present)
- FOUND: vite.config.ts (versionPlugin removed, BUILD_VERSION + define retained)

**Commits verified:**
- fb19325: feat(quick-198): add AppVersion table and set_app_version reducer to server
- a660fa3: feat(quick-198): wire subscription-based version check, remove polling

**Build verified:**
- Client TypeScript check passed (npx tsc --noEmit)
- Vite build succeeded
- dist/version.json NOT produced by new build (stale file from prior build remains, will be absent on next clean build)
