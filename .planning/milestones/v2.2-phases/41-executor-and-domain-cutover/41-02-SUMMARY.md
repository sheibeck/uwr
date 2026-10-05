---
phase: 41-executor-and-domain-cutover
plan: 02
subsystem: llm-budget
tags: [spacetimedb, llm, budget, cost, ledger, tests]
status: complete
requires:
  - phase: 41-01 (llm_limits constants, llm_player_budget and llm_spend tables, llm_job Phase 41 columns)
provides:
  - "helpers/llm_budget.ts: utcDay, estimatePromptChars, reservationMicroUsd, reserveLlmBudget, releaseLlmReservation, settleLlmCost, chargeLedgerUnknownBilling, addLedgerSpend, getPhaseLedger, isPhaseLedgerExhausted, prunePlayerBudgets"
affects: [41-05, 41-06, 41-07]
tech-stack:
  added: []
  patterns:
    - "job.reservedMicroUsd is the single source of truth for what a job holds; release/settle return a zeroing patch the caller writes once"
    - "Pure duck-typed module: no schema, events, location or server-entry imports, loads in plain Node vitest"
key-files:
  created:
    - spacetimedb/src/helpers/llm_budget.ts
    - spacetimedb/src/helpers/llm_budget.test.ts
  modified: []
key-decisions:
  - "Reservations use the existing reserveCostMicroUsd (chars / 3 at the cache-write price plus full max_tokens at the output price), which is more conservative than CONTEXT's chars / 3.25, as RESEARCH section 5 decided"
  - "Refusal order is pinned: daily_calls, then daily_cost, then phase_cap; refusal writes nothing, including no ledger row"
  - "phase_only mode skips the per-player checks entirely (smoke jobs), but is still bound by the $2 phase cap"
  - "chargeLedgerUnknownBilling is a no-op for a job with reservedMicroUsd 0n, so a released job cannot be charged twice"
metrics:
  tasks: 2
  files: 2
  tests_added: 40
  suite: "1520 passed (baseline 1480)"
completed: 2026-09-30
---

# Phase 41 Plan 02: LLM Budget Module Summary

Cost-weighted per-player daily reservation ($1.00 and 200 calls per UTC day), a hard $2.00 phase ledger, idempotent release/settle through a zeroing job patch, conservative ledger-only charging for unknown billing, and day-row pruning, all in one pure helper with 40 boundary tests.

## What was built

### Task 1: reservation, refusal reasons, UTC-day rows
- `reservationMicroUsd(route, json)` = `BigInt(reserveCostMicroUsd(route maxTokens, Keeper Bible + route block + json length))`, pinned against all eight routes.
- `reserveLlmBudget(ctx, { playerId, route, requestJson, mode })` reads today's `llm_player_budget` row (found by `by_player` plus an in-code `dayUtc` match, no multi-column index), checks the limits, and only then writes the player row and the `llm_spend` ledger. Returns `{ ok: true, reservedMicroUsd, budgetDay }` or `{ ok: false, reason }`.
- Boundary tests: exactly $1.00 allowed and +1 micro-USD refused; 200th call allowed and 201st refused; exactly $2.00 ledger allowed and +1 refused; UTC rollover at 23:59:59.999999 vs 00:00:00.000000; snapshot-identical database after every refusal.

### Task 2: release, settle, unknown billing, exhaustion, pruning
- `releaseLlmReservation(ctx, job, { refundCall })` subtracts `job.reservedMicroUsd` (floored at 0n) from the job's own `budgetDay` row and from the ledger, optionally refunding one call, and returns `{ reservedMicroUsd: 0n }`. A second call, or a release after settle (either order), changes nothing.
- `settleLlmCost` releases without a call refund, adds the actual cost to the ledger always and to the player only when `chargePlayer`, and returns `{ reservedMicroUsd: 0n, costMicroUsd }`.
- `chargeLedgerUnknownBilling` adds the reservation to ledger spent only; `addLedgerSpend` covers the late-arrival path; `isPhaseLedgerExhausted` is true only strictly above the cap; `prunePlayerBudgets` deletes rows older than the 2-day retention window and returns the count.

## Deviations from Plan

None to the plan's substance.
- The one CONTEXT deviation the plan asked to note: reservations use chars / 3 (existing helper), more conservative than chars / 3.25.
- Process: both tasks share one module and one test file, and were written together and committed in a single `feat` commit (c3add68a) rather than separate per-task or RED/GREEN commits (the plan type is `execute`).
- Test note: the mock db creates an empty table array on first read, so the test `snapshotDb` helper drops empty tables to compare "nothing written".

## Known Stubs
None. The module has no callers yet by design; Plans 41-05 (enqueue), 41-06 (executor) and 41-07 (sweeper) wire it in.

## Threat Flags
None beyond the plan's threat model. T-41-04 (per-player limits), T-41-04b (phase cap plus conservative unknown billing) and T-41-08 (double refund) are mitigated and covered by tests. The fairness prohibition (never charge a player for a platform failure) is tested via `chargeLedgerUnknownBilling` and `settleLlmCost` with `chargePlayer: false`.

## Notes for later plans
- Callers must write the returned patch to the job row in the same transaction as the budget call.
- `budgetDay` returned by `reserveLlmBudget` must be stored on the job (`llm_job.budgetDay`) so release settles against the original day row; '' means phase_only.
- The caller decides `chargePlayer` (false for thrown, never-billed, or expired/late results) and computes `actualMicroUsd` via `estimateCostMicroUsd`.
- No publish was run; nothing touched maincloud; `.env.local` was never read.

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/llm_budget.ts, spacetimedb/src/helpers/llm_budget.test.ts
- FOUND commit: c3add68a
- Full suite: 1520 passed (single worker)
