---
phase: 42-client-cutover-and-legacy-removal
plan: 01
subsystem: llm-apply-layer
tags: [spacetimedb, llm, characterization-tests, snapshots, dead-code-removal]
status: complete
one_liner: "Apply-layer characterization now drives applyLlmResult/applyLlmFailure directly (coverage survives the client-trusted reducer's removal), llm_apply.ts writes no old call counts, and the dead v2.0 prompt builders are deleted and kept deleted by a test"
requires:
  - phase: 41 (executor reservation and settlement own spend; llm_player_budget and llm_spend)
  - phase: 40 (llm_apply.ts extracted from the client-trusted reducer)
provides:
  - "helpers/llm_apply.characterization.test.ts: every apply domain pinned through applyLlmResult / applyLlmFailure with full-database snapshots (117 cases)"
  - "llm_apply.ts without the legacy helper import and its six call-count writes, pinned by a static test"
  - "A test that data/llm_prompts.ts stays deleted and nothing imports it"
affects: [42-03 (deletes the client-trusted reducer, the legacy helper module and the thin-wrapper and toApplyJob legacy tests)]
tech-stack:
  added: []
  patterns:
    - "Characterization harness: exec(ctx, job, args, opts) applies an ApplyJob and snapshots the whole database, checking inserted rows against the recorded schema"
    - "Snapshot edits verified semantically: a scratchpad script parses both snapshot files and proves new body == old body minus the dropped table (never a blind -u)"
key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/llm_apply.characterization.test.ts (renamed from submit_llm_result.characterization.test.ts)
    - spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap (renamed)
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
    - spacetimedb/src/helpers/llm_seam.test.ts
    - spacetimedb/src/data/llm_schemas.test.ts
    - spacetimedb/src/data/llm_schemas.ts
    - spacetimedb/src/data/llm_layers.ts
  deleted:
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/data/llm_prompts.test.ts
key-decisions:
  - "applyJob(domain, contextJson, over) keeps an optional playerId override per the plan, but no remaining case needs it (the only case that did pinned the deleted call-count write)"
  - "The seam test's requester check now asserts llm_player_budget rows exist and all belong to alice (the harness does reserve a player budget row), instead of dropping the lines"
  - "The stale 'Budget already incremented in triggerCombatNarration' comment in llm_apply.ts was left alone (plan: change nothing else)"
metrics:
  tasks: 3
  commits: 4
  suite: "2141 tests passed in 51 files (full server suite, single worker)"
completed: 2026-09-30
---

# Phase 42 Plan 01: Apply-layer coverage and dead-code cut Summary

The apply layer keeps all of its coverage without the client-trusted result reducer, stops writing the dead daily call-count table, and the dead v2.0 prompt builders are gone.

## What was done

**Task 1 (d2efd15d): convert the harness.** The characterization suite and its snapshot were renamed with `git mv` to `llm_apply.characterization.test.ts`. The harness imports `applyLlmResult`, `applyLlmFailure` and `ApplyJob` from `./llm_apply`, keeps the `beforeAll` that loads `../index` through the recording mock (so `insertProblems` knows every table), and uses `applyJob(domain, contextJson, over)` plus `exec(ctx, job, args, opts)`. The old task-table seed and status assertions are gone from every case. The wrapper block keeps two cases (unrecognized domain `generic`, success and failure), each asserting `nonEmptyTables(ctx)` equals `[]`.

**Task 2 (5e4775ba, 0dff0fed): call-count writes.** RED: a static test in `llm_apply.test.ts` (no import from `./llm`, no `incrementBudget`, no `llm_budget`) failed first. GREEN: the import and all six call sites left `llm_apply.ts`; the header was rewritten (the paragraph that every function acts for the stored requester, `job.playerId`, is kept). `llm_apply.test.ts` lost the `expectBudgetOnlyForAlice` helper and its five calls plus the three vacuous zero-length budget assertions; `llm_seam.test.ts` lost its call-count lines. Retitle commit: describe titles now read `llm apply ...` and budget or task-status clauses left the case titles.

**Task 3 (7db0eb9f): prompt builders.** RED: a new `removed v2.0 prompt builders` describe in `llm_schemas.test.ts` (module file absent, no `.ts` or `.vue` under `spacetimedb/src` and `src` imports a path ending in `llm_prompts`) failed with two red cases. GREEN: `git rm` of `data/llm_prompts.ts` and `data/llm_prompts.test.ts`, removal of the legacy skill-schema equivalence describe, its import and the `normalize` helper, and the two stale comments in `llm_schemas.ts` and `llm_layers.ts`.

## Numbers and gates

- Changed snapshot entries: Task 1, 114 entries changed (112 lost only the old task table, 2 collapsed to an empty database `"{}"`) and 3 guard-case entries removed. Task 2, 68 entries changed (lost only llm_budget rows) and 2 removed. Retitle: 112 keys renamed, 0 bodies changed.
- Characterization cases: 117 tests, 112 snapshot entries.
- **Gate 1, no data added (Task 1 and 2).** The literal plan command (`git diff -U0 -M ... | grep '^+' | grep -v '^+++' | grep -vE '^\+\s*[]}],?$'`) does not print nothing: for Task 1 it printed four lines of diff-alignment punctuation (`"character_creation_state": []`, `"character": []`, and two lines of a moved `callCount`/`resetDate` pair) and the two new single-line entries `= \`"{}"\``; for Task 2 it printed one alignment line (`"npc": [`). I therefore did not rely on it alone. A scratchpad script parsed old and new snapshot bodies as JSON and checked that, for every shared key, the new database equals the old database minus the dropped table (`llm_task` in Task 1, `llm_budget` in Task 2): Task 1 112 of 112 equal, Task 2 68 changed equal and 42 byte-identical, 0 mismatches. The 2 `"{}"` entries are the generic-domain cases whose whole old body was the task row.
- **Gate 2, retitle.** Sorted multiset of snapshot bodies before and after the retitle: snapshot bodies identical: yes (110 multi-line bodies compared; the 2 single-line `"{}"` entries verified by grep). `grep -c submit_llm_result` is 0 in the test file and the snapshot; `grep -c llm_budget` is 0 in the snapshot and in `llm_seam.test.ts`.
- Non-snapshot assertions: the no-update run after Task 1 failed only with snapshot mismatches (114 of them) and an obsolete-snapshot notice; no AssertionError, TypeError or ReferenceError appeared. Same for Task 2 (68 mismatches).
- Full server suite, single worker: **2141 tests passed in 51 files**. `spacetime build -p spacetimedb` finished successfully after Tasks 2 and 3 (it prints a pre-existing "tsc not found" note).

## Deleted case titles

Task 1, wrapper guards for the removed reducer:
- throws "LLM task not found" for an unknown task id
- throws "Not your task" when another player calls it and leaves the task pending
- throws "Task already processed" for a completed task
- throws "Task already processed" for an errored task
- checks existence, then ownership, then status (a completed task of another player is "Not your task")

Task 2, call-count-only cases:
- creation_race success > increments an existing budget row instead of adding a second one
- world_gen success > QUIRK: charges the budget to the generation state player, not the sender

Every other case kept its title text apart from the retitle described above (budget and task-status clauses dropped, reducer name replaced by `llm apply`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Literal snapshot gate cannot print nothing**
- **Found during:** Task 1 step 9 and Task 2 step 5
- **Issue:** The unified-diff gate reports punctuation-only alignment artifacts and the two new `"{}"` entries, so it cannot be empty even though no data was added.
- **Fix:** Added a stricter semantic comparison (parse both snapshot files, compare bodies per key); recorded both results above.
- **Files modified:** none (scratchpad scripts only)
- **Commit:** n/a

**2. [Process note] Accidental full-suite `-u` run**
- **Found during:** Task 1 step 9
- **Issue:** `CI= pnpm ... vitest run --maxWorkers=1 -u <path>` (flag before the path) ran all 52 files with `-u`. `git status` afterwards showed no other snapshot or file changed, and every other suite passed unchanged. Later `-u` runs put the path first.
- **Commit:** n/a

No production behavior changed other than removing the dead call-count writes.

## Threat model

- T-42-01 (blind snapshot update): mitigated by the no-update runs, the semantic snapshot comparison, the body-multiset check for the retitle and the deleted-case list above.
- T-42-02 (apply acting for the caller): the sender-independence tests in `llm_apply.test.ts` and the `llm_apply.ts never reads the sender` static guard stay; the seam test still proves the call log and player-budget rows belong to alice.
- T-42-03 (removing the counter): accepted as planned; the executor's reservation and ledger own spend.

## Known Stubs

None.

## Threat Flags

None.

## Notes for later plans

- Plan 42-03 still has to delete the thin-wrapper test and the two legacy `toApplyJob` cases in `llm_apply.test.ts` together with the reducer, and the legacy `helpers/llm.ts` module (nothing in `llm_apply.ts` imports it any more).
- `applyJob`'s `over.playerId` option in the characterization file is currently unused.
- `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were left untouched and unstaged. Plan 42-02's files did not exist in the tree during the full-suite run.

## Self-Check: PASSED

- Files: `llm_apply.characterization.test.ts` and its snapshot exist; the old `submit_llm_result.characterization` test and snapshot do not; `data/llm_prompts.ts` and `data/llm_prompts.test.ts` do not.
- Commits found in git log: d2efd15d, 5e4775ba, 0dff0fed, 7db0eb9f.
