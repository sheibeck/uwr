---
phase: quick-144
plan: "01"
subsystem: client-combat-ui
tags: [cast-bar, cooldowns, cache-busting, optimistic-state, timer-cleanup]
dependency_graph:
  requires: []
  provides:
    - "Combat-end cleanup for localCast, localCooldowns, predictedCooldownReadyAt in useHotbar"
    - "Combat-transition cleanup for effectTimers and enemyCastTimers in useCombat"
    - "Version polling with forced reload in main.ts"
    - "Build-time version stamp in vite.config.ts"
  affects:
    - "src/composables/useHotbar.ts"
    - "src/composables/useCombat.ts"
    - "src/App.vue"
    - "vite.config.ts"
    - "src/main.ts"
tech_stack:
  added:
    - "@types/node (devDependency for vite.config.ts Node imports)"
  patterns:
    - "Vue watch() on activeCombat ref for side-effect cleanup"
    - "Vite closeBundle hook for build-time artifact generation"
    - "Compile-time constant injection via Vite define"
key_files:
  created:
    - "public/version.json"
    - "dist/version.json (build artifact)"
  modified:
    - "src/composables/useHotbar.ts"
    - "src/composables/useCombat.ts"
    - "src/App.vue"
    - "vite.config.ts"
    - "src/main.ts"
    - "tsconfig.json"
    - "package.json"
decisions:
  - "60-second polling interval: conservative bandwidth vs detecting deploys within 1 minute"
  - "window.location.reload() vs prompt: reload is seamless since auth token persists in localStorage"
  - "CLIENT_VERSION !== dev guard: skips polling during local development where __BUILD_VERSION__ is injected by dev server"
  - "@types/node installed and added to tsconfig types so vite.config.ts Node imports type-check cleanly"
  - "100ms setInterval (10fps) for nowMicros: doubles smoothness from 5fps without meaningful CPU cost"
metrics:
  duration: "~5min"
  completed: "2026-02-17"
  tasks: 2
  files: 7
---

# Phase quick-144 Plan 01: Robust cast bars, cooldown timers, and auto cache-busting Summary

**One-liner:** Combat-end watcher clears optimistic cast/cooldown predictions and stale timer maps; Vite plugin stamps a timestamp version.json that clients poll every 60 seconds to auto-reload on deploy.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix stuck cast bars and cooldown timers on combat transitions | 73423af | useHotbar.ts, useCombat.ts, App.vue |
| 2 | Add automatic cache busting on client deploys | 82a37d7 | vite.config.ts, main.ts, public/version.json, tsconfig.json, package.json |

## What Was Built

### Task 1 — Combat-end state cleanup

**useHotbar.ts changes:**

1. Added `watch(() => activeCombat.value, ...)` that fires when `activeCombat` transitions to `null` (combat ends). Clears `localCast`, `localCooldowns`, `predictedCooldownReadyAt`, and `hotbarPulseKey` immediately. Previously these persisted until character switch.

2. Added safety net inside the existing `nowMicros` watcher: if `localCast` exists but `castingState` (server state) is null AND elapsed time exceeds cast duration + 2 second buffer, force-clear `localCast`. Catches cases where server never created a CharacterCast row (ability failed silently).

3. Changed `setInterval` in App.vue from 200ms to 100ms — doubles `nowMicros` tick rate from 5fps to 10fps for noticeably smoother cast bar and cooldown animation.

**useCombat.ts changes:**

Added `watch(() => activeCombat.value?.id?.toString() ?? null, ...)` that clears both `effectTimers` and `enemyCastTimers` Maps whenever combat identity changes (new combat or null). Imported `watch` from vue (previously only `computed` was imported). Prevents stale entries from one combat interfering with timer calculations in the next.

### Task 2 — Automatic version-aware cache busting

**vite.config.ts:** Added `versionPlugin` with a `closeBundle` hook that writes `dist/version.json` containing `{"version":"<timestamp>"}` after each production build. Also added `define: { __BUILD_VERSION__: ... }` to inject the same timestamp as a compile-time constant.

**src/main.ts:** After `bootstrap()`, added a `checkForUpdates` async function that fetches `/version.json?_=<cachebuster>` with `cache: 'no-store'`, compares against the embedded `CLIENT_VERSION`, and calls `window.location.reload()` on mismatch. Registered as `setInterval(..., 60_000)` — only active in production (guarded by `CLIENT_VERSION !== 'dev'`).

**public/version.json:** Placeholder `{"version":"dev"}` file served by the dev server so fetch does not 404 during local development. The `CLIENT_VERSION !== 'dev'` guard prevents any reload from firing.

**tsconfig.json + @types/node:** Installed `@types/node` and added `"node"` to `compilerOptions.types` so `fs`, `path`, and `__dirname` in `vite.config.ts` type-check cleanly under `vue-tsc`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Installed @types/node for vite.config.ts**
- **Found during:** Task 2
- **Issue:** vite.config.ts imports `fs` and `path` from Node.js. Without `@types/node`, TypeScript reports errors on these imports and `__dirname`. The plan did not mention this dependency.
- **Fix:** Installed `@types/node` as a devDependency and added `"node"` to tsconfig `types` array.
- **Files modified:** `tsconfig.json`, `package.json`, `package-lock.json`
- **Commit:** 82a37d7

## Verification

1. TypeScript compilation: `npx vue-tsc --noEmit` — no new errors introduced in modified files
2. Build: `npx vite build` succeeded in 5.21s, producing `dist/version.json` with timestamp `1771348557204`
3. Timer cleanup: useHotbar.ts has `activeCombat` watcher clearing localCast/localCooldowns/predictedCooldownReadyAt (line 358-369)
4. Safety net: useHotbar.ts nowMicros watcher has 2s grace period orphan-clear for localCast (line 377-384)
5. Effect cache cleanup: useCombat.ts has watcher clearing effectTimers/enemyCastTimers on combat identity change (line 744-750)
6. Version polling: main.ts has 60-second interval fetching /version.json with cache-busting (added after bootstrap())
7. Dev safety: public/version.json exists with `"dev"` version, dev mode polling skipped by guard

## Self-Check: PASSED

- `src/composables/useHotbar.ts` — activeCombat watcher at line 358, safety net at line 377
- `src/composables/useCombat.ts` — watch + clear at line 744
- `src/App.vue` — setInterval 100ms at line 1959
- `vite.config.ts` — versionPlugin + define present
- `src/main.ts` — checkForUpdates + setInterval present
- `public/version.json` — exists with dev placeholder
- Commit 73423af: fix(quick-144) — verified in git log
- Commit 82a37d7: feat(quick-144) — verified in git log
