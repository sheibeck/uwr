---
phase: 41-executor-and-domain-cutover
plan: 05
subsystem: llm-enqueue
tags: [spacetimedb, llm, enqueue, budget, per-player-cap, dispatch, renown, tests]
status: complete
requires:
  - phase: 41-02 (reserveLlmBudget, LlmBudgetMode, LlmBudgetRefusal)
  - phase: 41-03 (insertStaticRenownPerkOptions returns a count)
  - phase: 41-04 (insertLlmDispatch, ensureLlmSweepScheduled, encodeRouteInput, resolveRouteInput)
provides:
  - "llm_queue.ts: enqueueLlmJob returns EnqueueResult (created, dedupe merge, or traceless refusal)"
  - "llm_queue.ts: EnqueueArgs.budget, LlmRefusal, LLM_REFUSAL_MESSAGES, llmRefusalMessage, LLM_CAP_EXEMPT_ROUTES, countActiveCappedJobs"
  - "renown.ts: triggerRenownPerkGeneration snapshots input and falls back to static options on refusal; RENOWN_STATIC_OPTIONS_MESSAGE"
affects: [41-06, 41-07, 41-08, 41-09, 41-10]
tech-stack:
  added: []
  patterns:
    - "Every refusal returns before any write, so a refused enqueue leaves no job, dispatch row or reservation"
    - "Job, dispatch row (at ctx.timestamp) and sweep-tick ensure are written in the caller's transaction"
key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/llm_queue.ts
    - spacetimedb/src/helpers/llm_queue.test.ts
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/helpers/renown_llm.test.ts
    - spacetimedb/src/helpers/llm_seam.test.ts
key-decisions:
  - "Cap-exempt routes are combat_narration and renown_perk_gen: narration is silent, lowest priority and must never block combat; a renown offer is earned, not requested, so it is never lost to the per-player cap"
  - "countActiveCappedJobs excludes only combat_narration (plus budgetDay '' jobs and terminal jobs), per the plan truth; a held renown job counts toward the three, it is just never the request refused as busy"
  - "The dedupe merge check runs before the cap and budget, so a duplicate of an active job is never refused as busy"
  - "Refusal wording reuses the existing reducers/llm.ts voice; daily_cost and daily_calls share one line so the limit that was hit is never revealed"
  - "RENOWN_STATIC_OPTIONS_MESSAGE duplicates the string in llm_apply.ts (llm_apply imports renown, so renown cannot import llm_apply); llm_apply left untouched to keep scope"
metrics:
  tasks: 2
  files: 5
  tests_added: 32
  suite: "1736 passed (baseline 1704)"
completed: 2026-09-30
---

# Phase 41 Plan 05: Reserved, Dispatched Enqueue Summary

`enqueueLlmJob` is now the single in-transaction entry point for every LLM action: dedupe, per-player cap (busy), cost reservation, the job row, its dispatch row at the transaction timestamp and the sweep-tick safety net, or a traceless refusal that domains answer in the Keeper's voice. Renown is the first domain fully on it.

## What was built

### Task 1: enqueueLlmJob (commit 90f1cee7)
- Order: validation and serialization (plain Errors, unchanged), dedupe on active jobs (returns `{ created: false, job }`), per-player cap (`busy`), `reserveLlmBudget` (refusal reason passed through unchanged), job insert carrying `reservedMicroUsd` and `budgetDay` from the reservation, `insertLlmDispatch(ctx, job.id, ctx.timestamp.microsSinceUnixEpoch)`, `ensureLlmSweepScheduled(ctx)`, `{ created: true, job }`.
- `EnqueueResult`, `LlmRefusal`, `EnqueueArgs.budget` (default `'player'`; `'phase_only'` for smoke skips the player row and the cap).
- `LLM_REFUSAL_MESSAGES` (frozen) and `llmRefusalMessage`: four fixed lines with no digits, currency, "budget", "limit", provider names, "HTTP" or "key".
- Header comment updated; the module stays pure (imports only data modules, `./measurement`, `./llm_budget`, `./llm_schedule`).
- 26 new tests: created-path rows and column checks, reservation against player day and ledger, dedupe merge leaving every table unchanged, merge not refused when at the cap, next source key creating a separate job, cap at 2/3/4 active jobs, exempt routes, terminal/smoke/other-player jobs not counted, the three budget refusals leaving `snap` unchanged, phase_only, refusal text scans, and validation writing nothing.

### Task 2: renown caller (commit bfd803e1)
- `triggerRenownPerkGeneration` builds the `RenownPerkInput` and stores `input: encodeRouteInput(input)` next to the legacy keys (`characterId`, `rank`, `className`, `raceName`, `existingPerks`) that `applyRenownPerkResult` reads.
- On `result.refused`, it calls `insertStaticRenownPerkOptions` and, when rows were inserted, posts the "standard options" Keeper line via `appendPrivateEvent`. A dedupe hit does nothing. The no-identity static path is unchanged (its count is ignored).
- 6 new tests: snapshot resolves via `resolveRouteInput` to the executor input, one dispatch row at the transaction timestamp, refusal at the daily cost limit and at the phase cap (three static rank-2 options, one Keeper line, no job/dispatch/reservation), a rank with no pool posts nothing, dedupe hit posts nothing, renown never refused as busy with three capped jobs held. The existing request-shape assertion now includes `input`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test breakage] llm_seam.test.ts re-invoke comparison**
- **Found during:** Task 2
- **Issue:** The "end state with a re-invoked transaction equals the end state without one" test failed because the new `llm_dispatch` and `llm_sweep_tick` rows carry an auto-increment `scheduledId` (1n vs 2n on re-invoke), which the normalizer did not mask.
- **Fix:** Added `scheduledId` to the normalized id keys in that test. `gameTablesSnapshot` needed no change (the smoke test snapshots after enqueue, so the new tables are equal on both sides).
- **Files modified:** spacetimedb/src/helpers/llm_seam.test.ts
- **Commit:** bfd803e1

The reference driver `runJobOnce` is unchanged: no line inside it differs (`grep -c "function runJobOnce"` is 1).

### Ambiguity resolved
The plan says renown "counts toward nothing" in one bullet but the must-have truth and the `countActiveCappedJobs` spec exclude only `combat_narration`. I followed the truth and spec: a held renown job counts toward the three but is never refused. The header comment and a test document this.

Process note: tests and implementation were committed together per task (plan type `execute`), as in Plans 41-01 to 41-04.

## Known Stubs
None.

## Threat Flags
None beyond the plan's model. T-41-04 (dedupe, cap of 3, reservation before insert, traceless refusal), T-41-09 (four fixed Keeper lines tested against digits, currency and provider words) and T-41-20 (earned renown offer falls back to static options) are mitigated and tested.

## Notes for later plans
- Callers must handle `result.refused`: answer with `fail(ctx, character, llmRefusalMessage(result.refused))` where character context exists; narration is silently skipped instead. `result.job` is `null` on refusal.
- Enqueue `request` must include `input: encodeRouteInput(input)` (smoke jobs `{ smoke: true }` with `budget: 'phase_only'`).
- The executor (41-06) and sweeper (41-07) must write the patches returned by `settleLlmCost` / `releaseLlmReservation` in the same transaction as the status change.
- No publish was run; nothing touched maincloud; `.env.local` was never read.

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/llm_queue.ts, llm_queue.test.ts, renown.ts, renown_llm.test.ts, llm_seam.test.ts
- FOUND commits: 90f1cee7, bfd803e1
- Acceptance greps: `reserveLlmBudget(` 1, `insertLlmDispatch(` 1, `ensureLlmSweepScheduled(` 1, forbidden imports 0 in llm_queue.ts; `encodeRouteInput(` 1 and `refused` 3 in renown.ts; `function runJobOnce` 1 in llm_seam.test.ts
- Full suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` 1736 passed (baseline 1704)
