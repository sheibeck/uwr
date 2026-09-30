---
phase: 41-executor-and-domain-cutover
plan: 07
subsystem: llm-executor-schedules
tags: [spacetimedb, llm, sweeper, scheduled-procedure, scheduled-reducer, refunds, tests]
status: complete
requires:
  - phase: 41-02 (llm_budget: releaseLlmReservation, chargeLedgerUnknownBilling, prunePlayerBudgets)
  - phase: 41-03 (applyLlmFailure falls back to static renown options)
  - phase: 41-04 (llm_schedule: hasLlmDispatch, insertLlmDispatch, ensureLlmSweepScheduled)
  - phase: 41-06 (runLlmJob, recordSmokeResult, claim applies a received job with no call)
provides:
  - "helpers/llm_sweeper.ts: sweepLlmJobs(ctx, deps?), SweepReport, SweepDeps"
  - "reducers/llm_executor.ts: registerLlmExecutorReducers(deps): procedure llm_run (onSchedule llm_dispatch) and reducer llm_sweep (onSchedule llm_sweep_tick)"
  - "ensureLlmSweepScheduled on init (initScheduledTables) and on every client connect"
affects: [41-08, 41-09, 41-10]
tech-stack:
  added: []
  patterns:
    - "Sweeper writes status and money first and the failure message last, because a reducer's caught exception does not roll back earlier writes"
    - "The sweeper never runs a success apply; received jobs are re-dispatched so the apply runs in the executor's own rollback-safe transaction"
    - "Next sweep tick is inserted before any job work; per-job and whole-sweep try/catch"
key-files:
  created:
    - spacetimedb/src/helpers/llm_sweeper.ts
    - spacetimedb/src/helpers/llm_sweeper.test.ts
    - spacetimedb/src/reducers/llm_executor.ts
  modified:
    - spacetimedb/src/reducers/index.ts
    - spacetimedb/src/helpers/scheduling.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/helpers/schema_recorder.test.ts
key-decisions:
  - "Smoke detection in the sweeper is a small local copy of the executor's isSmokeRequest (keeps the sweeper free of the executor's imports and leaves 41-06 files untouched)"
  - "Report counters increment after the status and money write and before the failure message, so a job whose message throws still counts as expired and also as one error"
  - "llm_sweep inserts its next tick unconditionally (as sweep_llm_errors does); the ensure helpers only insert when the table is empty"
metrics:
  tasks: 2
  files: 7
  tests_added: 36
  suite: "1884 passed (baseline 1848)"
completed: 2026-09-30
---

# Phase 41 Plan 07: Sweeper and Scheduled Registration Summary

The executor is now a real scheduled procedure (`llm_run`, bound to `llm_dispatch`) and a self-rescheduling, failure-isolated sweeper (`llm_sweep`, bound to `llm_sweep_tick`, every 30 s) recovers stuck, unapplied and orphaned jobs with refunds, lock release and the in-voice message.

## What was built

### Task 1: sweepLlmJobs (RED 46e93037, GREEN 975f7e23)
- **in_flight** older than route timeout + 30 s (strictly greater; exactly 60 s for a 30 s route is left alone): ledger charged the reservation (billing unknown, via `chargeLedgerUnknownBilling`), one job update to `expired` / `timeout` merged with `releaseLlmReservation(..., { refundCall: true })`, then the failure message for the stored player.
- **received** older than route timeout + 60 s: with `applyAttempts >= 2` the job becomes `failed` / `apply_error` and the failure message runs; otherwise one dispatch at `now` when none exists (the executor claim re-applies from the stored text, no call). The sweeper never calls `applyLlmResult`.
- **pending** older than 10 min (24 h for `renown_perk_gen`): `expired` with `errorCode ?? 'expired'`, reservation and call refunded, failure message (renown falls back to static options through `applyLlmFailure`). Younger and with no dispatch: one dispatch at `max(now, nextAttemptAt)` (Phase 40's queued renown jobs get their first run this way).
- **smoke** jobs record a failed entry for their route in `lastSmokeJson` instead of calling `applyFailure`.
- Per-job try/catch increments `report.errors` and logs a redacted line; pruning of budget rows older than two days is in its own try/catch and counted in `prunedBudgets`.
- Tests (28): empty queue, exact boundaries (one micro over / exactly at), route timeouts, real creation and renown failure handling, idempotent double sweep (snapshot identical, no second message, no double refund), failure isolation (throwing message for job A does not stop job B; a malformed row does not stop the sweep), key never in the log, pruning, smoke, and "no stuck job stays active".

### Task 2: registration and ensure hooks (RED 9b48e0c6, GREEN bc2ef35f)
- `reducers/llm_executor.ts`: `spacetimedb.procedure({ name: 'llm_run', onSchedule: LlmDispatch }, { arg: LlmDispatch.rowType }, t.unit(), ...)` calls `runLlmJob(ctx, arg)` (which guards on the module identity first); `spacetimedb.reducer({ name: 'llm_sweep', onSchedule: LlmSweepTick }, { arg: LlmSweepTick.rowType }, ...)` throws `SenderError('Scheduled only')` for any other caller, inserts the next tick 30 s out, then runs `sweepLlmJobs` inside try/catch with a redacted `console.error`.
- `registerLlmExecutorReducers(deps)` is called at the end of `registerReducers`. `ensureLlmSweepScheduled` is called at the end of `initScheduledTables` and in `clientConnected` after `ensureLlmCleanupScheduled` (enqueue already ensures it).
- `schema_recorder.test.ts` gained 8 cases under the recorder (index.ts load timeout raised to 120 s): `capturedProcedure('llm_run')` and `capturedReducer('llm_sweep')` are functions; `llm_run` with a client sender changes nothing and makes no call; `llm_sweep` with a client sender throws and inserts no tick; with the module identity it inserts exactly one tick at now + 30 s and expires a stale in_flight job; a forced sweep failure (db proxy that throws on `llm_job`) still inserts the next tick, does not throw and logs no key; `initScheduledTables` (twice) and `clientConnected` (twice) each leave exactly one tick.
- `spacetime build -p spacetimedb` prints "Build finished successfully" (with the pre-existing "tsc not found" notice). No publish.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Line endings of edited files**
- **Found during:** Task 2 full-suite run (`llm_apply.test.ts` static guard `submit_llm_result in index.ts is a thin wrapper` failed)
- **Issue:** my scripted edits rewrote `index.ts`, `helpers/scheduling.ts` and `reducers/index.ts` with CRLF endings; the guard splits `index.ts` on `\n` and looks for a line equal to `});`.
- **Fix:** converted the three files back to LF before committing; the commit diff is +2 lines in each file.
- **Commit:** bc2ef35f

No other deviations; the plan otherwise executed as written.

## Flagged assumptions carried forward
- The runtime behavior "a publish or crash mid-call leaves at most one in_flight job per interrupted call, expired by the sweeper after route timeout + 30 s" is a backstop truth, not unit-testable here (Phase 39 measured that a publish waits for the in-flight call).
- `llm_sweep` inserts its next tick unconditionally, on the same assumption as the existing `sweep_llm_errors`: the scheduler removes the firing row before the reducer runs. If a duplicate tick ever appeared (an enqueue ensure racing the firing row) the cost is two sweeps per interval, which are idempotent. Plan 41-10's first local publish is where this is observed (`llm_sweep_tick` should hold exactly one row between ticks).
- The `onSchedule` bindings compile and bundle; that the module actually binds `llm_dispatch` to `llm_run` and `llm_sweep_tick` to `llm_sweep` is confirmed at the first local publish (41-10).

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model. T-41-02 (module-identity guard in both, tested via captured handlers), T-41-10 (tick inserted first, per-job and whole-sweep catch, ensure on init, connect and enqueue, forced-failure test), T-41-08 (reservation zeroing patch, received jobs re-dispatched not applied, idempotent double-sweep test) and T-41-03 (failure keyed on `toApplyJob(job).playerId`) are mitigated and tested.

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/llm_sweeper.ts, llm_sweeper.test.ts, reducers/llm_executor.ts, schema_recorder.test.ts (extended)
- FOUND commits: 46e93037 (RED), 975f7e23 (GREEN), 9b48e0c6 (RED), bc2ef35f (GREEN)
- Acceptance greps: `applyLlmResult(` in sweeper 0; `hasLlmDispatch(` 2; forbidden imports 0; `onSchedule: LlmDispatch` 1; `onSchedule: LlmSweepTick` 1; `registerLlmExecutorReducers(deps)` 1; `ensureLlmSweepScheduled(ctx)` 1 in index.ts and 1 in scheduling.ts
- Full suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` 1884 passed (baseline 1848)
