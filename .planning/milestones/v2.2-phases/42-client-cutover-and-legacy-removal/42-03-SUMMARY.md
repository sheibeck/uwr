---
phase: 42-client-cutover-and-legacy-removal
plan: 03
subsystem: llm-legacy-removal-server
tags: [spacetimedb, llm, security, purge, scheduled-tick, dead-code-removal]
status: complete
one_liner: "Server half of publish 1: the client-trusted result reducer, the old request-validation reducer and the legacy cleanup tick are gone, an admin-only counts-only idempotent purge_legacy_llm empties the four legacy tables, and recorder plus source tests pin that nothing reads them"
requires:
  - phase: 42-01 (apply layer characterized through applyLlmResult/applyLlmFailure; llm_apply.ts writes no old call counts)
  - phase: 41 (executor and sweeper own result application; llm_sweep_tick)
provides:
  - "purge_legacy_llm admin reducer (publish 1 only): deletes every row of llm_task, llm_request, llm_budget, llm_cleanup_tick (by scheduledId), logs one counts-only line"
  - "sweep_llm_errors as an empty drain (still registered because llm_cleanup_tick points at it until Plan 42-06)"
  - "utcDateString in helpers/llm_budget.ts (moved from the deleted helpers/llm.ts)"
  - "schema/llm_absence.test.ts: recorder and source guards for removed reducers, stopped tick and reader-free legacy tables"
affects: [42-04 (client still references removed reducers until bindings regenerate), 42-05 (publish 1 plus purge call), 42-06 (drops the four tables, the drain and the purge)]
tech-stack:
  added: []
  patterns:
    - "Fixed name list reached by name for the purge: ctx.db[name] with primary keys collected first, then deleted through the key accessor"
    - "Absence tests load the real index.ts through the recording mock and run captured handlers (client-connected, scheduled drain) on a lenient mock ctx"
key-files:
  created:
    - spacetimedb/src/schema/llm_absence.test.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/helpers/scheduling.ts
    - spacetimedb/src/reducers/llm.ts
    - spacetimedb/src/reducers/llm_admin.test.ts
    - spacetimedb/src/helpers/llm_budget.ts
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
    - spacetimedb/src/helpers/schema_recorder.test.ts
    - spacetimedb/src/data/model_literals.test.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts
  deleted:
    - spacetimedb/src/helpers/llm.ts
    - src/composables/useLlm.ts
key-decisions:
  - "The client-connected absence test runs the real captured handler (no source-check fallback was needed)"
  - "The apply-caller static test lives only in llm_apply.test.ts (replacing the thin-wrapper test); llm_absence.test.ts does not duplicate it"
  - "fail was dropped from the llm.ts reducer deps destructure (nothing else used it); the registry and the test harness still pass it, which is harmless"
  - "The stale 'Budget already incremented in triggerCombatNarration' comment in llm_apply.ts was removed (42-01 left it)"
metrics:
  tasks: 3
  commits: 3
  suite: "2191 tests passed in 53 files (full server suite, single worker); spacetime build -p spacetimedb succeeds"
completed: 2026-09-30
---

# Phase 42 Plan 03: Server half of publish 1 Summary

No reducer accepts LLM output from a client any more, nothing writes or reads the four legacy LLM tables except the admin purge, and nothing can refill the legacy cleanup tick; all four tables stay defined so publish 1 changes no table.

## What was done

**Task 1 (3c3f70f2): stop the tick, add the purge.** The legacy cleanup ensure helper and its two call sites (initScheduledTables, the client-connected handler) are removed; the sweep tick is untouched. `sweep_llm_errors` keeps its registration, name and `{ arg: LlmCleanupTick.rowType }` parameter but its body is empty: it reads no `llm_request` row and inserts no tick. The two interval constants are deleted. `purge_llm_tasks` is replaced by `purge_legacy_llm`: `requireAdmin(ctx)` first, then for the fixed list llm_task, llm_request, llm_budget (key `id`) and llm_cleanup_tick (key `scheduledId`) the keys are collected and deleted, and one line `legacy llm purge: llm_task=<n> llm_request=<n> llm_budget=<n> llm_cleanup_tick=<n>` is logged. Tests (strict mock): non-admin gets `Admin only` and every row stays; the admin run empties the four tables, leaves the seeded `llm_config` (fake key) and `llm_job` rows byte-identical, logs exactly the expected line, and `findSecretLeaks` over the log finds nothing; a second call logs all zeros. `llm_absence.test.ts` covers the scheduling export, `initScheduledTables`, the client-connected handler and the drain.

**Client-connected check: it ran the real handler.** The captured `__client_connected__` handler executes on a lenient mock ctx without extra seed (it inserts the player, then the ensure helpers), so no source-check fallback was used.

**Task 2 (2a82d223): old validation path.** The validation reducer, its budget import and its `fail` dependency are gone from `reducers/llm.ts`. `utcDateString` moved into `helpers/llm_budget.ts` (same body, above `utcDay`) and `helpers/llm.ts` was deleted with `git rm` after a grep confirmed no other importer. `src/composables/useLlm.ts` (its only client caller, no importers) was deleted. `model_literals.test.ts` now lists only `spacetimedb/src/schema/tables.ts` (count 1, multi-line form kept) with an updated header; the pin in `llm_cutover.test.ts` was retitled and expects that one key. `llm_absence.test.ts` gained the validation-reducer absence case, the file-absence checks and a scan proving no client file (outside `module_bindings`, tests excluded) names the validation reducer.

**Task 3 (fbfe11d8): result reducer.** The client result-submitting reducer block and the apply import were removed from `index.ts`. `toApplyJob` maps only the llm_job shape; doc comments on ApplyJob, toApplyJob and creationStateForJob were reworded (fallback code unchanged). Tests: a static test in `llm_apply.test.ts` (replacing the thin-wrapper test) proves that only `helpers/llm_executor.ts` and `helpers/llm_sweeper.ts` mention the apply entry points in non-comment code (llm_apply.ts itself excluded); the two legacy `toApplyJob` cases and the both-shapes case were deleted and the header rewritten. `llm_absence.test.ts` asserts that the three removed reducers are not captured while `request_skill_offer`, `set_api_key` and `purge_legacy_llm` are, that no production non-test file has a db accessor on the four legacy tables (with a non-vacuity check on `db.llm_job`), and that the four tables are still defined. `schema_recorder.test.ts` now checks `set_api_key` instead of the removed reducer.

## Verification

- Full server suite, single worker: 53 files, 2191 tests passed. `spacetime build -p spacetimedb` finishes successfully (prints the pre-existing "tsc not found" note).
- `git grep -nE "\bdb\.(llm_task|llm_request|llm_budget|llm_cleanup_tick)\b" -- spacetimedb/src ':!*.test.ts'` prints nothing.
- `grep -c "spacetimedb.reducer('submit_llm_result'" spacetimedb/src/index.ts` prints 0; `name: 'llm_task'` still appears once in `schema/tables.ts`.
- No publish, no `spacetime call`, no server start, no bindings regeneration. `src/module_bindings` still contains the removed reducers until Plan 42-04 regenerates it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test-file escape sequences mangled by my editing scripts**
- **Found during:** Tasks 1 and 3
- **Issue:** Backslash sequences in scripted edits (a newline in a `join`/`split` string, and `\b` in regexes turned into a backspace character) produced syntax errors and, once, a silently vacuous scan (the regex never matched).
- **Fix:** Corrected the affected lines in `llm_admin.test.ts`, `llm_absence.test.ts` and `llm_apply.test.ts`. The vacuous scan was caught because the scan tests failed for the wrong reason during RED (empty caller list, zero `db.llm_job` files), and the tests now pass for the right one.
- **Commit:** folded into 3c3f70f2 and fbfe11d8 (no bad version was committed)

**2. [Rule 1 - Bug] Windows path separators in the new source scans**
- **Found during:** Task 3
- **Issue:** `fileURLToPath` returns backslashes on Windows, so a `/helpers/llm_apply.ts` suffix check did not match.
- **Fix:** Normalize the scan root to forward slashes in both scan tests.

**3. [Scope note] Stale comment removed**
- The "Budget already incremented in triggerCombatNarration" comment in `llm_apply.ts` (noted by 42-01) was removed since the file was being edited for this plan.

## Known Stubs

None. `sweep_llm_errors` is an intentional empty drain (see key decisions), removed with its table by Plan 42-06.

## Threat model

- T-42-09 (client-submitted results): reducer deleted; recorder absence test; apply-caller static test limits callers to executor and sweeper. Bindings scan follows in 42-05.
- T-42-10 (purge by a player): `requireAdmin(ctx)` first; test proves a non-admin gets `Admin only` and no row changes.
- T-42-11 (purge hitting key or live jobs): fixed four-name list; test seeds `llm_config` and `llm_job` and asserts both untouched.
- T-42-12 (log disclosure): one counts-only line; `findSecretLeaks` test with a fake key.
- T-42-13 (tick refill): helper and both call sites removed; the drain inserts nothing; three tests.
- T-42-14 (validation reducer): reducer, helper module and its only client caller deleted; absence tests.
- T-42-SC: no packages installed.

## Threat Flags

None.

## Notes for later plans

- Plan 42-04: `src/module_bindings` still exposes `submit_llm_result`, `validate_llm_request` and `purge_llm_tasks`; regenerate after publish 1 is built (Plan 42-05 owns the publish). The client absence scan already ignores `module_bindings`.
- Plan 42-05: after publish 1, call `purge_legacy_llm` as the admin once, then publish 2 (Plan 42-06) may drop the four tables, `sweep_llm_errors` and `purge_legacy_llm`.
- Plan 42-06 must also remove the dead `LlmRequest` model-literal comment in `schema/tables.ts` and the last allowlist entry in `model_literals.test.ts`, and the `llm_absence.test.ts` case "the four legacy tables are still defined" must be flipped there.
- `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were left untouched and unstaged.

## Self-Check: PASSED

- Files exist: `spacetimedb/src/schema/llm_absence.test.ts`; `spacetimedb/src/helpers/llm.ts` and `src/composables/useLlm.ts` do not.
- Commits found in git log: 3c3f70f2, 2a82d223, fbfe11d8.
