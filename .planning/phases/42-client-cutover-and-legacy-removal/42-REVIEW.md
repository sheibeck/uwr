---
phase: 42-client-cutover-and-legacy-removal
reviewed: 2026-09-30T00:00:00Z
depth: standard
iteration: 2
files_reviewed: 44
files_reviewed_list:
  - .claude/skills/run-local/SKILL.md
  - README.md
  - package.json
  - scripts/check-bundle.mjs
  - scripts/check-bundle.test.mjs
  - spacetimedb/src/data/llm_indicator_lines.test.ts
  - spacetimedb/src/data/llm_indicator_lines.ts
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/data/llm_schemas.test.ts
  - spacetimedb/src/data/llm_schemas.ts
  - spacetimedb/src/data/model_literals.test.ts
  - spacetimedb/src/helpers/combat_narration.test.ts
  - spacetimedb/src/helpers/creation_generation.test.ts
  - spacetimedb/src/helpers/llm_apply.characterization.test.ts
  - spacetimedb/src/helpers/llm_apply.test.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/helpers/llm_budget.ts
  - spacetimedb/src/helpers/llm_queue.ts
  - spacetimedb/src/helpers/llm_seam.test.ts
  - spacetimedb/src/helpers/renown_llm.test.ts
  - spacetimedb/src/helpers/scheduling.ts
  - spacetimedb/src/helpers/schema_recorder.test.ts
  - spacetimedb/src/helpers/skill_offer.test.ts
  - spacetimedb/src/helpers/world_gen.test.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/llm.ts
  - spacetimedb/src/reducers/llm_admin.test.ts
  - spacetimedb/src/reducers/llm_cutover.test.ts
  - spacetimedb/src/schema/llm_absence.test.ts
  - spacetimedb/src/schema/llm_privacy.test.ts
  - spacetimedb/src/schema/scheduled_tables.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/views/llm.ts
  - spacetimedb/src/views/llm.test.ts
  - src/App.vue
  - src/components/NarrativeConsole.vue
  - src/composables/data/useCoreData.ts
  - src/composables/useLlmStatus.test.ts
  - src/composables/useLlmStatus.ts
  - src/composables/useNpcConversation.ts
  - src/legacyCredentials.test.ts
  - src/legacyCredentials.ts
  - src/legacyLlmRemoval.test.ts
  - src/main.ts
findings:
  critical: 0
  warning: 0
  info: 9
  total: 9
status: issues_found
---

# Phase 42: Code Review Report (iteration 2)

**Reviewed:** 2026-09-30
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found (Info only)

## Narrative Findings (AI reviewer)

## Summary

This re-review covers the iteration-1 fixes (caeae065, 70fc2877, e2279386, 935eaa77) and the rest of the phase diff `a5abd392..HEAD` for the listed files. All four warnings are fixed correctly, and I found no regressions.

**WR-01 (smoke jobs in `my_llm_jobs`): fixed.**
- `isSmokeJob` in `helpers/llm_queue.ts:112-120` matches only a job with `characterId` 0n (or no `characterId`) whose request parses to `{ smoke: true }`.
- `llm_job.characterId` is a non-optional `t.u64()`, and `enqueueLlmJob` defaults it to `0n` (`llm_queue.ts:238`). Real character jobs therefore never match.
- Real character-less `world_gen` jobs are not dropped, because their request carries `genStateId`, not `smoke`.
- `isActiveSmokeJob` in `reducers/llm.ts:12-14` is now slightly stricter (character-less smoke jobs only). Every smoke job the reducer enqueues is character-less, so its behaviour does not change.
- The view still reads only through the `by_player` index, and its source still names no payload column.

**WR-02 (per-console scoping): fixed for the console part.**
- `routeInConsoleScope` and the two new constants scope the creation console to `creation_race`, `creation_class` and `world_gen`.
- The game console shows every route except `creation_race` and `creation_class`. Unknown routes still reach the game console and use the fallback line.
- The two consoles are mutually exclusive (`v-if="!selectedCharacter"` / `v-else`, App.vue:32/50), so each console gets the matching line.
- The per-character part is deferred by design and appears below only as Info (IN-06).

**WR-03 (live region): fixed.**
- The `role="status"` div is now unconditional inside the always-rendered scroll area.
- When the line changes, Vue's style patch removes the idle-only properties (`position`, `clip`, ...) when it switches to `consideringStyle`.
- An empty region announces nothing.

**WR-04 (guard not run): fixed.**
- `"build": "vue-tsc -b && vite build && node scripts/check-bundle.mjs"` fails the build when the guard exits 1 or 2.
- Vite's default `outDir` (`dist`, no override in `vite.config.ts`) matches the guard's default directory.
- I checked that the guard's main-module detection fires under upper-case and lower-case drive letters. I used a nonexistent directory argument (exit 2, message printed), so `dist/` was never read.

**Checks run (single worker):**
- Client phase tests (`useLlmStatus`, `legacyCredentials`, `legacyLlmRemoval`, `check-bundle`): 4 files, 132 tests, all pass.
- Server phase tests: 12 files, 472 tests, all pass.
- `vue-tsc -b`: clean.
- Server `tsc --noEmit`: no errors in `views/llm.ts`, `reducers/llm.ts`, `llm_queue.ts`, `llm_indicator_lines.ts`, `llm_apply.ts` or `llm_budget.ts`.
- `git grep` finds no remaining production reference to the proxy, `llm_task`, `submit_llm_result` or `useLlmProxy`, apart from the single allowed `removeItem` call in `src/legacyCredentials.ts`.

There are no blockers and no warnings. The remaining items are Info: five carried over from iteration 1 because they are still accurate (IN-01..IN-05), and four new low-impact notes on the fixes (IN-06..IN-09).

## Info

### IN-01: `LLM_INDICATOR_SILENT_ROUTES` is a second source of truth that no production code reads (carried over)

**File:** `spacetimedb/src/data/llm_indicator_lines.ts:48-52`
**Issue:** Silence is decided in `useLlmStatus.ts:84` by a `null` entry in `LLM_INDICATOR_LINES`. Only tests read the exported list.
**Fix:** Derive it with `Object.keys(LLM_INDICATOR_LINES).filter(k => LLM_INDICATOR_LINES[k] === null)`, or drop the export.

### IN-02: `utcDay` is a pure alias of the moved `utcDateString` (carried over)

**File:** `spacetimedb/src/helpers/llm_budget.ts:46-56`
**Issue:** Two exported names now exist for the same function.
**Fix:** Keep one name and update callers.

### IN-03: Enabling source maps later would trip the guard on `legacyCredentials.ts` itself (carried over)

**File:** `src/legacyCredentials.ts:5`, `scripts/check-bundle.mjs:64-75`
**Issue:** The header comment spells out the retired key in quotes, and `blankAllowedSpan` blanks only one `removeItem(...)` span. If `build.sourcemap` is ever enabled, the `.map` file's `sourcesContent` would fail the `proxy-key-name` rule. `pnpm build` now runs the guard, so this would fail the build outright. That is fail-closed, but it is confusing.
**Fix:** Describe the key without spelling it out (for example "the retired proxy-secret storage key"), or strip `sourcesContent` before scanning `.map` files.

### IN-04: `my_llm_jobs` sends the player's whole job history, including terminal rows (carried over)

**File:** `spacetimedb/src/views/llm.ts:94-98`, `src/composables/data/useCoreData.ts:68,155`
**Issue:** The client uses only active rows. The view returns every terminal row with its `userMessage`, and this grows without bound until the `llm_job` retention todo lands.
**Fix:** Once retention exists, limit the view to active rows plus recent terminal ones, or prune aggressively.

### IN-05: Only event changes auto-scroll the console, so the indicator can appear below the fold (carried over)

**File:** `src/components/NarrativeConsole.vue:265-273`
**Issue:** The auto-scroll watch tracks only `combinedEvents`. When the indicator switches from the idle (absolute, zero-flow) style to `consideringStyle`, it adds a line under the visible area without scrolling. After that, `checkIfAtBottom` stops later auto-scrolls.
**Fix:** Also watch `() => props.llmIndicatorLine`, and call `scrollToBottom()` while `isAtBottom` is true.

### IN-06: Indicator is still not bound to the selected character (deferred by design)

**File:** `src/composables/useLlmStatus.ts:54-58`, `spacetimedb/src/views/llm.ts:17-24`
**Issue:** Two cases remain:
- If the player switches from A to B while A's `npc_conversation`, `skill_gen` or `renown_perk_gen` job is active, B's game console still shows A's line.
- A game-time `world_gen` (explore) job for an existing character still shows in the creation console if the player returns to character select.

This is display-only. The fix needs `characterId` on the `MyLlmJob` view row, which is a schema change, and the user deliberately deferred it.
**Fix:** When a schema change is next allowed, add `characterId` to `MyLlmJob`/`projectMyLlmJob`, regenerate the bindings, and filter the game scope by `selectedCharacter.id`.

### IN-07: The unscoped `status` output of `useLlmStatus` has no production consumer

**File:** `src/composables/useLlmStatus.ts:117-131`
**Issue:** `App.vue:743` uses only `creationStatus` and `gameStatus`. The unscoped `status`, which ignores console scope (the WR-02 behaviour), is still returned and used only by `useLlmStatus.test.ts:207`. A future caller could pick it up and bring back cross-console lines.
**Fix:** Drop `status` from the return value and update the test to use a scoped status, or document it as test-only.

### IN-08: Smoke detection now has three definitions with different rules

**File:** `spacetimedb/src/helpers/llm_queue.ts:112-120`, `spacetimedb/src/helpers/llm_executor.ts:123-128`, `spacetimedb/src/helpers/llm_sweeper.ts:81-86`
**Issue:** The view and the smoke reducer use `isSmokeJob`, which requires a character-less job. The executor (skip apply) and the sweeper keep private `isSmokeRequest` copies that check only the request body. These cannot diverge today, because only `llm_smoke_test` builds `{ smoke: true }` and it always passes `characterId: 0n`. A future change to one copy would still be easy to miss in the others.
**Fix:** Have the executor and sweeper call `isSmokeJob(job)` from `llm_queue.ts` and delete the private copies.

### IN-09: README advertises a GitHub Actions deploy that does not exist, so "CI must run `pnpm build`" cannot be enforced

**File:** `README.md:171-181`
**Issue:** The README says "The frontend deploys automatically via GitHub Actions on push to `master`". That line predates this phase, but the WR-04 text builds on it. `.github/workflows/` contains only `claude.yml` and `claude-code-review.yml`, with no build or deploy job. In practice the guard protects only manual `pnpm build` deploys. The README wording suggests there is also an automatic path, and nothing protects that path.
**Fix:** Correct the sentence to describe the real deploy path (manual push of `dist/` to `gh-pages`). Alternatively, add a Pages workflow that runs `pnpm build`, which would make the guard mandatory for every deploy.

---

_Reviewed: 2026-09-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
