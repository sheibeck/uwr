---
phase: 45-foundation-frame-and-auth
plan: 01
subsystem: ui
tags: [cutover, vite, vue, deletion, screens]
requires: []
provides:
  - "Local tag v2.2-client on the pre-deletion commit"
  - "Clean src/ with new entry (main.ts, App.vue) and Nocturne vendored at src/styles/nocturne.css"
  - "Screen registry (SCREENS, HEADER_SCREENS, getScreen) and 7 empty-state screen shells"
  - "@game-data alias in Vite and tsconfig; dev server on 5173 strictPort"
affects: [45-05, 45-07, 45-10, 45-11]
tech-stack:
  added: ["@phosphor-icons/vue@2.2.1", "@vue/test-utils@2.5.1", "happy-dom@20.14.5", "postcss@8.5.28"]
  patterns: ["Screen registry drives drawer/sheet/header", "static guard tests over source text"]
key-files:
  created:
    - src/styles/nocturne.css
    - src/screens/screens.ts
    - src/screens/EmptyState.vue
    - src/screens/MapScreen.vue
    - src/screens/InventoryScreen.vue
    - src/screens/StatsScreen.vue
    - src/screens/CraftingScreen.vue
    - src/screens/SocialScreen.vue
    - src/screens/WorldEventsScreen.vue
    - src/screens/VendorScreen.vue
    - src/screens/screens.test.ts
    - src/legacyClientRemoval.test.ts
    - src/gameDataAlias.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - vite.config.ts
    - tsconfig.json
    - env.d.ts
    - index.html
    - README.md
    - src/main.ts
    - src/App.vue
    - src/legacyLlmRemoval.test.ts
key-decisions:
  - "Old client tagged v2.2-client locally before any deletion; never pushed"
  - "html2canvas removed with the old App.vue; bug report waits for Phase 52"
requirements-completed: [CUT-03, FND-01, FND-04, FND-05]
duration: 25min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 01: Cutover to the new client Summary

Old browser UI tagged `v2.2-client` and deleted in place; new toolchain (Phosphor, test-utils, happy-dom, postcss), verbatim Nocturne CSS, strict port 5173, `@game-data` alias, seven empty-state screen shells and a minimal `main.ts`/`App.vue` entry, with all guard tests green and `pnpm build` passing.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Tag, toolchain, vendor Nocturne, port and alias | bf72390a (tag `v2.2-client` on the prior HEAD 691231e3) |
| 2 | Screen registry, EmptyState, 7 shells (RED then GREEN) | RED: 2c435cd2, GREEN: 0df78ea4 |
| 3 | Delete old UI, new entry point, guards | d86ad950 |

## Verification

- `git cat-file -e v2.2-client:src/App.vue` and `v2.2-client:src/components/NarrativeConsole.vue` succeed; no `git push` was run.
- `cmp` of `src/styles/nocturne.css` against the scratchpad source: identical.
- `pnpm vitest run src spacetimedb/src/schema/llm_absence.test.ts spacetimedb/src/reducers/llm_cutover.test.ts scripts/check-bundle.test.mjs --maxWorkers=1` passes apart from the baseline failure; `pnpm build` passes (bundle guard clean).
- Full `pnpm vitest run`: only the 4 pre-existing baseline files fail (call_log_report, golden_run, proof_rules, measurement.results). No new failures.
- Non-test source files under src (outside module_bindings): 15 (> 10).
- Package versions were accepted as pinned; no release-age substitution was needed.

## Deviations from Plan

**1. [Rule 3 - Blocking] Temporary legacy-dir skip in gameDataAlias.test.ts during Task 1**
- Issue: the relative-import scan failed at the Task 1 commit because the old composables still held relative `spacetimedb/src/data` imports (removed in Task 3).
- Fix: skipped `components`, `composables`, `ui`, `data` in the walker in Task 1; removed the skip in the Task 3 commit so the final guard scans everything.
- Commits: bf72390a, d86ad950.

**2. Owner's uncommitted old-UI files discarded**
- `src/ui/styles.ts` edits and untracked `src/ui/splashLogo.test.ts` were deleted with `src/ui/` as instructed; neither was committed or stashed. `.planning/STATE.md` working-tree changes were left alone until the final docs commit.

**3. TDD note**
- Task 2 followed RED (test commit, failing at import) then GREEN.

## Known Stubs

The seven screens are intentional empty-state shells ("This screen is still being built."); later phases replace the bodies. `App.vue` is an intentionally empty root; plan 45-11 adds the splash/picker/frame switch. `callbackError` is accepted as a prop but not yet rendered (45-11).

## Threat Flags

None.

## Self-Check: PASSED
