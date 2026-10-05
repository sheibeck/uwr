---
phase: 41-executor-and-domain-cutover
plan: 06
subsystem: llm-executor-body
tags: [spacetimedb, llm, executor, procedure, retry, cost, redaction, smoke, tests]
status: complete
requires:
  - phase: 41-02 (llm_budget: settleLlmCost, releaseLlmReservation, chargeLedgerUnknownBilling, addLedgerSpend, isPhaseLedgerExhausted)
  - phase: 41-03 (apply hardening, insertStaticRenownPerkOptions)
  - phase: 41-04 (llm_retry, llm_schedule, llm_inputs, needle-aware classifiers)
  - phase: 41-05 (reserved and dispatched enqueue)
  - phase: 40 (claude_request, llm_apply, llm_queue.logLlmCall, reference driver runJobOnce)
provides:
  - "helpers/llm_executor.ts: runLlmJob(ctx, arg, deps?), claimLlmJob, ExecutorDeps, RunOutcome, BILLED_FAILURE_CLASSES"
  - "helpers/llm_admin_state.ts: getAdminState, patchAdminState, markKeyCheck, recordSmokeResult, isKeyValid, SmokeEntry"
  - "model_literals.test.ts: only llm_executor.ts reaches fetch among production files"
affects: [41-07, 41-08, 41-09, 41-10]
tech-stack:
  added: []
  patterns:
    - "Executor body is a pure, injectable function of (ctx, dispatch row, deps); registration as the llm_run procedure is Plan 41-07"
    - "One serializable claim transaction reads the job, the by_status in-flight count and the key, and flips the job to in_flight"
    - "Every settle or release patch is written in the same transaction as the status change, and job.reservedMicroUsd stays the single source of truth for what a job holds"
    - "Failure message runs in its own transaction after the status commit, so a message bug cannot undo the status"
key-files:
  created:
    - spacetimedb/src/helpers/llm_executor.ts
    - spacetimedb/src/helpers/llm_executor.test.ts
    - spacetimedb/src/helpers/llm_admin_state.ts
    - spacetimedb/src/helpers/llm_admin_state.test.ts
  modified:
    - spacetimedb/src/data/model_literals.test.ts
key-decisions:
  - "claimLlmJob is exported and returns a discriminated Claim; runLlmJob composes guard, claim, call, persist, apply. Tests reach the claimed state through claimLlmJob and the full run through runLlmJob"
  - "A reply whose body could not be read (classifier class 'network' on a response) is treated like a thrown call for billing: the ledger is charged the reservation, the player nothing"
  - "A smoke job's stored resultText is redacted (it is never applied); a normal job's resultText is stored raw because apply needs the exact text and the model never sees the key"
  - "nextAttemptAt is written as new Timestamp(micros) from the spacetimedb root, so the real column serializer gets a Timestamp, not a plain object"
  - "Smoke jobs that fail at claim, at build or at persist record a failed entry in llm_admin_state and never call applyLlmFailure (it would change the admin's own creation or world state)"
  - "Apply success does not count an attempt; only a thrown apply increments applyAttempts (so one throw then success ends at 1n, two throws at 2n)"
metrics:
  tasks: 2
  files: 5
  tests_added: 112
  suite: "1848 passed (baseline 1736)"
completed: 2026-09-30
---

# Phase 41 Plan 06: Executor Body Summary

The reference driver is now the real executor body: a module-identity guard, one claim transaction with the count-derived in-flight cap and the narration rules, the Claude call with no transaction open, a persist transaction that settles money per outcome, retry by class with a new dispatch row, an apply that re-runs once from the stored text, smoke handling, and redaction of the key on every path.

## What was built

### Task 1: admin state, guard and claim (RED 9efcc5a0, GREEN eba6fb55)
- `llm_admin_state.ts`: `patchAdminState` inserts the default row then applies the patch; `markKeyCheck(true)` sets `keyLastCheckOk` and `keyVerifiedAt`, `(false)` clears only `keyLastCheckOk`; `recordSmokeResult` stores one entry per route (a later result replaces the earlier one), redacts strings and the whole JSON with the needles, keeps the reply excerpt only for `smoke_test` (120 code points), keeps the JSON at or under 4096 characters (over the cap: newest entry plus `truncated: true`); `isKeyValid` needs `keySet`, `keyLastCheckOk` and `keyVerifiedAt >= keyUpdatedAt`.
- `claimLlmJob` checks in this order: missing job or a non-pending status is `skip` (a `received` job returns an apply-only marker); a future `nextAttemptAt` is `skip` when another dispatch exists, else one new dispatch at `nextAttemptAt` (`redispatch`); narration older than 20 s is `expired` silently with the reservation and call refunded; an exhausted ledger fails the job `billing` (refund plus failure message); `in_flight` count from `llm_job.by_status.filter('in_flight')` against 4 (3 for narration) defers with a new dispatch 500 to 749 ms later without touching the job; a missing or blank key fails `auth` and clears `keyLastCheckOk`; `resolveRouteInput` errors fail `bad_request`; otherwise the job becomes `in_flight`, `attempt + 1`, `startedAt`, `nextAttemptAt` cleared.
- Guard: `ctx.sender` is compared to `ctx.databaseIdentity` before any read; a client-driven dispatch returns `not_module` with the database unchanged.

### Task 2: call, persist, apply (RED 247b1d31, GREEN edbd426d)
- Request built outside any transaction; a build error fails `bad_request` with a call refund and no fetch. The call uses `ctx.http.fetch(ANTHROPIC_MESSAGES_URL, { method: 'POST', headers, body, timeout })` with `classifyClaudeResponse` and `classifyClaudeError` given `needles: [apiKey]`. `Date.now()` is reached only through `deps.nowMs`.
- Persist transaction guarded on `in_flight` plus the claimed attempt (a stale arrival writes only the call-log row and the real cost on the ledger). Every attempt writes one `llm_call_log` row via `logLlmCall` (attempt, status, outcome, four counts, cost, latency, `dispatchLateMs`, needles); the job row accumulates the counts of all attempts. One module log line per call carries no text.
- Apply loop for a received job: at most `LLM_APPLY_MAX_ATTEMPTS` runs from the stored text, a thrown apply increments `applyAttempts`, exhaustion fails `apply_error` and posts the failure message. No second billed call is ever made. A `received` job re-dispatched by the sweeper is applied with no call.
- Fetch guard: `FETCH_GUARD_EXEMPT` contains `llm_executor.ts`, and the guard test now asserts the production files reaching fetch are exactly `['spacetimedb/src/helpers/llm_executor.ts']` (test-utils.ts excluded).

## Outcome-to-money table (as implemented)

| Outcome | Job | Player | Phase ledger | Reservation / call |
|---|---|---|---|---|
| ok, usage present | `received` then `completed` after apply | charged real cost | spent += real cost | released; call kept |
| ok, usage missing (all four counts 0) | same | nothing | spent += reservation | released; call kept |
| ok narration persisted more than 20 s after enqueue | `expired`, errorCode `late`, not applied | nothing | spent += real cost | released; call kept |
| ok smoke job | `completed` (no apply), smoke entry recorded, `smoke_test` verifies the key | none (budgetDay '') | spent += real cost | released |
| billed failure (refusal, truncated, invalid_json, schema_mismatch, empty_output, unexpected_stop) | `failed` | charged real cost (usage missing: nothing) | spent += real cost (usage missing: reservation) | released; call kept |
| retryable HTTP failure, attempts left | `pending`, `nextAttemptAt`, one new dispatch | untouched | untouched | held |
| thrown or unreadable-body attempt, attempts left | `pending`, one new dispatch | untouched | spent += reservation (each attempt) | held |
| terminal HTTP failure (auth, billing, bad_request, or attempt 3 of a transient class, or a no-retry route) | `failed` | untouched | untouched | released, call refunded |
| terminal thrown attempt | `failed` | untouched | spent += reservation, then released | released, call refunded |
| stale arrival (job already expired by the sweeper) | unchanged | untouched | spent += real cost | already released |
| claim-time failure (ledger exhausted, missing key, bad input, build error) | `failed` | untouched | untouched | released, call refunded |
| claim-time late narration | `expired` `late` | untouched | untouched | released, call refunded |
| apply fails twice | `failed` `apply_error` | already charged | already settled | already released |

`auth` and `billing` failures also clear `keyLastCheckOk`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Smoke reply redaction in the job row**
- **Found during:** Task 2 (leak test where a smoke reply echoed the key)
- **Issue:** the completed smoke job stored the raw reply in `llm_job.resultText`, so a reply that contained the key would sit outside `llm_config`.
- **Fix:** smoke jobs store `redactSecrets(result.text, [apiKey])`. Normal jobs keep the raw text because apply needs it and the model never sees the key.
- **Commit:** edbd426d

**2. [Process] Test-helper adjustments while making RED tests green**
- One Task 1 test took its "before" snapshot before removing the dispatch row (test bug, fixed in eba6fb55); the withTxReinvoke deferral test seeds the pending job directly, because a re-invoked enqueue changes the job id and with it the deterministic jitter.

No architectural deviations. The plan's Task 1 said the run path "returns right after the claim"; Task 1's GREEN commit therefore threw for the run and received kinds, and Task 2 replaced that. Tests reach the claimed state through the exported `claimLlmJob`.

## Known Stubs
None. `runLlmJob` has no caller yet by design; Plan 41-07 registers it as `llm_run`.

## Threat Flags
None beyond the plan's threat model. T-41-01 (key only in the header and as a needle, leak scan over every table but `llm_config` and all console spies), T-41-02 (module-identity guard), T-41-03 (apply and failure key on `job.playerId`), T-41-04b (ledger exhausted fails the claim; unknown billing charged conservatively), T-41-05 (attempt caps, apply re-run never calls the model) and T-41-08 (persist guard, stale path ledger-only) are mitigated and tested. The fairness prohibition (no auto retry of creation or world gen) is tested for creation_race, creation_class and world_gen.

## Notes for later plans
- Plan 41-07 registers `runLlmJob` as the `llm_run` scheduled procedure (`onSchedule`, 4-argument named `procedure` form) and passes the dispatch row as `arg`; `deps` default to the real clock, `applyLlmResult`, `applyLlmFailure` and `console.log`.
- The sweeper should treat `applyAttempts >= 2` on a `received` job as "fail in voice"; `runLlmJob` on such a job does exactly that.
- `recordSmokeResult` needs the `smoke: true` request flag on the job (`enqueue ... budget: 'phase_only'`); smoke jobs for creation, world gen and skill routes never call `applyLlmFailure`.
- The default `deps.nowMs` is `Date.now()`; the plan's flagged assumption A5 (Date.now outside `withTx` in a procedure) is unchanged.
- No publish was run; nothing touched maincloud; `.env.local` and the key were never read. `spacetime build -p spacetimedb` finished successfully (the executor is not yet imported by `index.ts`).

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/llm_admin_state.ts, llm_admin_state.test.ts, llm_executor.ts, llm_executor.test.ts, spacetimedb/src/data/model_literals.test.ts
- FOUND commits: 9efcc5a0 (RED), eba6fb55 (GREEN), 247b1d31 (RED), edbd426d (GREEN)
- Acceptance greps: `ctx.db` 0, `by_status.filter('in_flight')` 1, `databaseIdentity` at least 1, forbidden imports 0, `buildClaudeHeaders(` 1, `needles: [` 3, `llm_executor.ts` in model_literals.test.ts 5, `it(` 75 in llm_executor.test.ts
- Full suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` 1848 passed (baseline 1736)
