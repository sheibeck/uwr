---
phase: 42-client-cutover-and-legacy-removal
reviewed: 2026-09-30T00:00:00Z
depth: standard
files_reviewed: 40
files_reviewed_list:
  - .claude/skills/run-local/SKILL.md
  - README.md
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
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 42: Code Review Report

**Reviewed:** 2026-09-30
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Reviewed the phase diff `a5abd392..HEAD` for the 40 listed files (generated bindings and the snapshot excluded). Removing the legacy path is thorough. `submit_llm_result`, `validate_llm_request`, `purge_llm_tasks`, `sweep_llm_errors`, the four legacy tables, `helpers/llm.ts`, `useLlm.ts` and `useLlmProxy.ts` are all gone. A repo-wide `git grep` finds no production reference left to any of them. The client stores exactly one legacy credential key, and `clearLegacyLlmCredential` removes it. The server still settles budget through the reservation path in `llm_queue`/`llm_executor`/`llm_sweeper`, so removing `incrementBudget` from `llm_apply.ts` does not lose any spend accounting.

Checks run (single worker):
- Client phase tests: 4 files, 120 tests, all pass.
- Server phase tests: 11 files, 438 tests, all pass.
- `vue-tsc -b`: clean.
- Server `tsc`: no new errors in the phase's production files. The existing SDK typing noise in `index.ts` is unchanged.

No blockers. The main defects are in the new indicator:
- It shows lines for admin smoke-test jobs.
- It is not scoped to the active character.
- The live region is mounted with `v-if`.

The bundle credential guard (SEC-03) exists and is well tested. Nothing in build or deploy runs it.

## Warnings

### WR-01: Admin smoke test lights up the admin's player indicator with real-route lines

**File:** `spacetimedb/src/reducers/llm.ts:72-83`, `src/composables/useLlmStatus.ts:52-60`, `spacetimedb/src/data/llm_indicator_lines.ts:27-36`
**Issue:** `llm_smoke_test` enqueues one job per `LLM_SMOKE_ROUTES` entry with `playerId: ctx.sender`. The list is `smoke_test`, `creation_race`, `creation_class`, `world_gen`, `skill_gen` and `renown_perk_gen`. The `my_llm_jobs` view returns every `llm_job` row for the sender (`views/llm.ts:93`). It projects only `id/route/status/createdAt/errorCode/userMessage`, so the client cannot tell a smoke job from a real one. `selectLlmIndicator` checks only route and status. While a smoke run is active, the admin's console shows "The Keeper is unrolling a map, with visible reluctance...", even though no world generation is happening for them. The design treats smoke work as silent, but only the `smoke_test` route is actually silent. The tests do not cover this, because `useLlmStatus.test.ts` never builds a smoke-flagged job on a real route.
**Fix:** Filter smoke jobs out on the server so the view never sends them. The smoke request body is `{ smoke: true }` and smoke jobs use `characterId: 0n`:
```ts
(ctx: any) => [...ctx.db.llm_job.by_player.filter(ctx.sender)]
  .filter((j: any) => !isSmokeRequest(j.requestJson))   // shared helper with reducers/llm.ts isActiveSmokeJob
  .map(projectMyLlmJob)
```
Alternatively, project a `silent: t.bool()` column and skip silent rows in `selectLlmIndicator`. Add a `useLlmStatus`/view test with a smoke job on `world_gen`.

### WR-02: Indicator is per identity, not per character or console, so it shows other characters' background work

**File:** `src/App.vue:742-746`, `src/composables/useLlmStatus.ts:50-86`
**Issue:** `my_llm_jobs` is keyed by identity and carries no `characterId`. The same `llmIndicatorLine` goes to both consoles. The creation console (App.vue:41) and the game console (App.vue:66) therefore both show any active job for the player, for any character. Two cases:
- A player leaves character A while A's `renown_perk_gen` or `skill_gen` job is in flight, then starts creating a new character. The creation console shows "The Keeper is tallying what your name is worth...".
- A player switches from A to B during A's NPC chat. B's console shows "The Keeper leans in to listen...".

Either way the text is wrong for what the player is doing. The input lock is correctly scoped (creation and world-gen state rows), so this is display-only, but the view shape cannot support scoping on the client.
**Fix:** Add `characterId` to `MyLlmJob`/`projectMyLlmJob` (a schema change to the view and regenerated bindings). Then filter before selection. In the game console, keep rows with `characterId === selectedCharacter.id`. In the creation console, keep only `creation_race`, `creation_class` and `world_gen`. Example: `useLlmStatus({ llmJobs: computed(() => llmJobs.value.filter(scopeFor(consoleMode, selectedCharacterId))) })`.

### WR-03: `role="status"` live region is created with `v-if`, so screen readers often do not announce it

**File:** `src/components/NarrativeConsole.vue:92-99`
**Issue:** The indicator gets `role="status"` and `aria-live="polite"`, but it is mounted by `v-if="llmIndicatorLine"` with its text already in place. Live regions are only announced reliably when the region already exists in the DOM and its content then changes. A region inserted together with its text is often silent, notably in NVDA/JAWS with Chromium and in VoiceOver. The first "The Keeper is ..." line, which is the one the accessibility attributes were added for, may never be read out. Only later route-to-route text swaps would be announced.
**Fix:** Keep the live region mounted permanently and toggle only its content and visibility:
```vue
<div class="llm-indicator" role="status" aria-live="polite"
     :style="llmIndicatorLine ? consideringStyle : srOnlyStyle">{{ llmIndicatorLine ?? '' }}</div>
```
The static test in `legacyLlmRemoval.test.ts` asserts `v-if="llmIndicatorLine"` on the div. Update it to assert that the region is always present.

### WR-04: The bundle credential guard is never run by build, deploy or `pnpm test` docs

**File:** `scripts/check-bundle.mjs:1-8`, `README.md:126-135`, `README.md:166-173`, `package.json` (`"build": "vue-tsc -b && vite build"`)
**Issue:** `check-bundle.mjs` is the SEC-03 control that stops a provider key, proxy secret or proxy URL from shipping in `dist/`. Nothing invokes it:
- `pnpm build` does not run it.
- There is no `postbuild` script.
- The README's "Available Scripts" and "Frontend — GitHub Pages" manual deploy steps (`pnpm build`, then push `dist/`) do not mention it.
- No workflow in `.github/workflows` runs it.

The guard's unit tests prove that it works, but nothing guarantees it runs against a real bundle before deploy. A future `import.meta.env.VITE_*` secret would ship silently. The earlier build already inlined a secret this way.
**Fix:** Wire it into the build so a failing guard fails the build:
```json
"build": "vue-tsc -b && vite build && node scripts/check-bundle.mjs"
```
Or add `"postbuild": "node scripts/check-bundle.mjs"`. Also list it under README "Available Scripts" and in the manual deploy steps.

## Info

### IN-01: `LLM_INDICATOR_SILENT_ROUTES` is a second source of truth that no production code reads

**File:** `spacetimedb/src/data/llm_indicator_lines.ts:48-52`
**Issue:** "Silent" is decided in `useLlmStatus.ts:59` by a `null` entry in `LLM_INDICATOR_LINES`. The exported `LLM_INDICATOR_SILENT_ROUTES` list is read only by tests. The two can drift, although the test at line 95 currently pins them together.
**Fix:** Derive the list (`Object.keys(LLM_INDICATOR_LINES).filter(k => LLM_INDICATOR_LINES[k] === null)`) or drop the export.

### IN-02: `utcDay` is a pure alias of the newly moved `utcDateString`

**File:** `spacetimedb/src/helpers/llm_budget.ts:46-56`
**Issue:** When `helpers/llm.ts` was deleted, `utcDateString` moved in beside `utcDay`, which only forwards to it. That leaves two exported names for the same function.
**Fix:** Keep one name and update callers.

### IN-03: Enabling source maps later would trip the guard on `legacyCredentials.ts` itself

**File:** `src/legacyCredentials.ts:5`, `scripts/check-bundle.mjs:59-71`
**Issue:** The header comment names the retired key in quotes. `blankAllowedSpan` blanks only the first `removeItem(...)` span in sorted path order. If `build.sourcemap` is ever enabled, the `.map` file's `sourcesContent` carries the comment line and a second `removeItem` call. `proxy-key-name` then fails on the map file. The failure is safe (fail-closed), but it would push someone to narrow the rule.
**Fix:** Describe the key in the comment without spelling it out, for example "the retired proxy-secret storage key". Optionally, have the guard strip `sourcesContent` from `.map` files before scanning, with a matching unit test.

### IN-04: `my_llm_jobs` sends the player's whole job history, including terminal rows

**File:** `src/composables/data/useCoreData.ts:68,155` (consumer), `spacetimedb/src/views/llm.ts:93` (source)
**Issue:** The client uses only active statuses. The view still returns every terminal job the player ever had, with its `userMessage`, and `rebind` re-spreads the full array on every insert and delete. This grows without bound until the `llm_job` retention todo lands.
**Fix:** Once retention exists, consider limiting the view to active rows plus recent terminal ones (by index), or making sure retention prunes aggressively.

### IN-05: Only event changes auto-scroll the console, so the indicator can appear below the fold

**File:** `src/components/NarrativeConsole.vue:265-272`
**Issue:** The auto-scroll watch tracks only `combinedEvents`. When a background job's indicator appears without a new event in the same update, the new line is added under the visible area. `checkIfAtBottom` then reports "not at bottom" and later events stop auto-scrolling.
**Fix:** Also watch `() => props.llmIndicatorLine` and call `scrollToBottom()` when `isAtBottom` is true.

---

_Reviewed: 2026-09-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
