---
phase: 42-client-cutover-and-legacy-removal
fixed_at: 2026-09-30T00:00:00Z
review_path: .planning/phases/42-client-cutover-and-legacy-removal/42-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 42: Code Review Fix Report

**Fixed at:** 2026-09-30
**Source review:** .planning/phases/42-client-cutover-and-legacy-removal/42-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (fix_scope: critical_warning; IN-01..IN-05 not in scope)
- Fixed: 4 (WR-02 fixed in part; the per-character part is deferred because it needs a schema change, see below)
- Skipped: 0

No schema change was made. No table, column, index or view return type changed. `my_llm_jobs` keeps its six-field `MyLlmJob` row, and only its filter logic changed.

**Needs a local publish:** WR-01 changes server code (`views/llm.ts`, `reducers/llm.ts`, `helpers/llm_queue.ts`). It takes effect only after a local, non-clearing `spacetime publish uwr -p spacetimedb`. Bindings do not need regenerating, because the view row type is unchanged. WR-02 also adds two constants to `spacetimedb/src/data/llm_indicator_lines.ts`, but only the client bundle imports them, so they need no publish.

**Verification (single worker):**
- Full root run: 62 files, 2411 tests, all pass (baseline 2393 plus 18 new).
- Full server run: 53 files, 2195 tests, all pass.
- `vue-tsc -b`: clean.
- Server `tsc`: no errors in the changed files. The existing noise elsewhere is unchanged.
- `pnpm build` now runs the guard, and it prints `bundle clean: 4 files scanned`.

## Fixed Issues

### WR-01: Admin smoke test lights up the admin's player indicator with real-route lines

**Files modified:** `spacetimedb/src/helpers/llm_queue.ts`, `spacetimedb/src/views/llm.ts`, `spacetimedb/src/reducers/llm.ts`, `spacetimedb/src/views/llm.test.ts`
**Commit:** caeae065
**Applied fix:**
- Added an exported `isSmokeJob(job)` helper to `helpers/llm_queue.ts`. It returns true for a job with no character (`characterId` is `0n`) whose stored request parses to `{ smoke: true }`. A job tied to a character short-circuits to false, so the request is parsed only for jobs with no character.
- The `my_llm_jobs` view now filters with `.filter((job) => !isSmokeJob(job))` before `projectMyLlmJob`. Smoke jobs never reach the client, so they never light the indicator.
- The view source still names no payload column. The existing `requestJson|resultText|dedupeKey` source guard still passes.
- The smoke reducer's `isActiveSmokeJob` now uses the same helper.
- New tests:
  - Active and terminal smoke jobs on `world_gen`, `creation_race`, `skill_gen`, `renown_perk_gen` and `smoke_test` are dropped. Real `world_gen` and `skill_gen` jobs for the same player are still returned.
  - Unit cases for `isSmokeJob`.
- The executor and sweeper still have their own private `isSmokeRequest` copies. They were left untouched to keep this fix narrow.

### WR-02: Indicator is per identity, not per character or console

**Files modified:** `spacetimedb/src/data/llm_indicator_lines.ts`, `src/composables/useLlmStatus.ts`, `src/App.vue`, `spacetimedb/src/data/llm_indicator_lines.test.ts`, `src/composables/useLlmStatus.test.ts`, `src/legacyLlmRemoval.test.ts`
**Commit:** 70fc2877
**Applied fix (console scoping):**
- Added `LLM_CREATION_CONSOLE_ROUTES` (`creation_race`, `creation_class`, `world_gen`) and `LLM_CREATION_ONLY_ROUTES` (`creation_race`, `creation_class`) to the shared indicator data module. The module is still import-free, so the server remains the source of truth.
- `selectLlmIndicator(rows, scope?)` takes an optional `'creation' | 'game'` scope, and `routeInConsoleScope` decides membership:
  - The creation console shows only creation work and the starter world generation.
  - The game console shows every route except the creation-only routes. `world_gen` shows in both, because it runs for the starter region at creation and for explore in game.
- `useLlmStatus` now also returns `creationStatus` and `gameStatus`.
- `App.vue` passes `creationLlmIndicatorLine` to the creation console and `gameLlmIndicatorLine` to the game console. The input lock is unchanged.
- Tests cover both review cases:
  - A renown job from another character does not show in the creation console.
  - An NPC chat or skill job does not show in the creation console.
  - Creation jobs do not show in the game console.
  - `world_gen` shows in both.
  - Constant parity is checked, and the App wiring is pinned.

**Not fixed (needs a schema change):** a true per-character binding is still missing. When a player switches from character A to B during A's NPC chat, B's game console still shows "The Keeper leans in to listen...". Fixing that needs a `characterId` field on the `MyLlmJob` view row (a view return type change plus regenerated bindings), which this fix pass forbids. It is display-only; the input lock is already scoped correctly.

### WR-03: `role="status"` live region is created with `v-if`

**Files modified:** `src/components/NarrativeConsole.vue`, `src/legacyLlmRemoval.test.ts`
**Commit:** e2279386
**Applied fix:**
- The `.llm-indicator` div with `role="status"` and `aria-live="polite"` no longer uses `v-if`. It stays mounted inside the unconditional scroll area. Only its text changes (`{{ llmIndicatorLine ?? '' }}`), and its style switches between `consideringStyle` and a new visually hidden `indicatorIdleStyle` (absolute, 1px, clipped, never `display: none`).
- The reduced-motion rule is unchanged.
- The static test now asserts:
  - the region has no `v-if`, `v-show` or `v-else`;
  - its parent has no conditional;
  - there is exactly one `role="status"`;
  - the idle style hides the region without removing it.

### WR-04: The bundle credential guard is never run by build or deploy

**Files modified:** `package.json`, `README.md`, `scripts/check-bundle.test.mjs`
**Commit:** 935eaa77
**Applied fix:**
- The `build` script is now `vue-tsc -b && vite build && node scripts/check-bundle.mjs`, so a failing guard fails `pnpm build`.
- README changes:
  - "Available Scripts" describes the guard step and lists `node scripts/check-bundle.mjs` and its `--explain` mode.
  - The GitHub Pages manual deploy steps now say a failed build means do not deploy, and that CI must run `pnpm build`, not `vite build`.
- New `build wiring` tests check that:
  - the guard is the last step, joined with `&&`;
  - no `||`, `;` or `|` could swallow its exit code;
  - the build does not pass `--explain`;
  - the README covers the guard in both places.
- There is still no deploy workflow in `.github/workflows`. Any future one must call `pnpm build`.

---

_Fixed: 2026-09-30_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
