---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 03
subsystem: api
tags: [spacetimedb, llm, executor, kill-switch, ceiling, claim, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: llmGate, globalCeilingClaimHeld, utcDay, LLM_RESTING_LINE (Plan 43-01)
provides:
  - Claim-time kill switch and global ceiling check in claimLlmJob, ending a stopped pending job as failed with code halted or ceiling through failAtClaim
  - LLM_RESTING_ERROR_CODES and isRestingErrorCode in llm_status; halted and ceiling map to the unavailable bucket and the resting line
  - ApplyJob.errorCode, and the resting line per domain in applyLlmFailure
  - Resting line for a halted or ceiling refusal in startWorldGeneration
affects: [43-06, 43-08, 43-13, 43-15, executor, status views]

tech-stack:
  added: []
  patterns:
    - "Claim-time gate order: key-less checks first (narration age), then halted, then ceiling, then the in-flight cap, so a stopped job is refunded and never deferred forever"
    - "failAtClaim is the single refund-and-notify path; releaseLlmReservation is idempotent through job.reservedMicroUsd, so the sweeper never refunds a claim-time refusal again"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/llm_executor.ts
    - spacetimedb/src/helpers/llm_executor.test.ts
    - spacetimedb/src/helpers/llm_status.ts
    - spacetimedb/src/views/llm.test.ts
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
    - spacetimedb/src/helpers/world_gen.ts
    - spacetimedb/src/helpers/world_gen.test.ts
    - spacetimedb/src/helpers/creation_generation.test.ts

key-decisions:
  - "Interpretation of CONTEXT's 'pending jobs expire with refunds at claim time' (PLANNING-NOTES item 2): the job ends FAILED with code halted or ceiling, not expired. Only the failed path runs applyLlmFailure, which releases the creation or world-gen lock in the same transaction; an expired job would leave the lock to the sweeper's 60 s stranded-lock rule"
  - "An NPC conversation stopped by the resting codes posts the resting line whenever the character exists (it does not also require the NPC row), because the player should hear the Keeper is resting even if the NPC vanished"
  - "ApplyJob.errorCode was added in the Task 2 commit, so the Task 1 executor tests do not assert it; the Task 2 commit adds those assertions"

patterns-established:
  - "The two resting codes are a frozen list plus a type-guard helper, imported by the apply layer and the world-gen start path alike"

requirements-completed: []  # COST-03 claim half only here; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "Kill switch off, or a missing admin-state row, after enqueue: the claim ends the job failed halted, refunds reservation and call once, makes no call, calls applyFailure once for the job's player, and writes no dispatch row"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_executor.test.ts#claim failures (no call, no spend)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ceiling passed at claim: failed ceiling with the same refunds; the boundary is inclusive; three queued jobs with headroom for two admit the first two in claim order and refuse the third, leaving the ledger holding only the two admitted reservations"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_executor.test.ts#claim failures (no call, no spend)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Refund once: sweepLlmJobs after a claim-time halted or ceiling refusal changes no ledger or player-day figure (T-43-09)"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_executor.test.ts#refund once: the sweeper leaves the ledger and the player day unchanged"
        status: pass
    human_judgment: false
  - id: D4
    description: "In-flight finishes: flipping the kill switch off after the claim committed (inside the nowMs dep) still completes, applies and settles the job; a smoke job halted at claim records class halted and never calls applyFailure; a stopped job is refunded rather than deferred when the in-flight cap is full"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_executor.test.ts#in-flight finishes"
        status: pass
    human_judgment: false
  - id: D5
    description: "Domain lock released in the same transaction: a creation_race job halted at claim returns the step to AWAITING_RACE through the real applyLlmFailure and posts the resting line once (T-43-10)"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_executor.test.ts#a creation_race job halted at claim returns the creation state to AWAITING_RACE"
        status: pass
    human_judgment: false
  - id: D6
    description: "my_llm_jobs shows halted and ceiling only as the unavailable bucket with the resting line, never the raw reason (T-43-11); isRestingErrorCode is true only for those two codes"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/views/llm.test.ts#publicErrorBucket and #keeperMessageForJob and #isRestingErrorCode and #my_llm_jobs view"
        status: pass
    human_judgment: false
  - id: D7
    description: "One resting line per domain on a halted or ceiling failure (creation, world_gen, skill_gen, npc_conversation; renown keeps static options, combat narration silent); any other code keeps the Phase 41 lines byte for byte; world-gen refusal at enqueue uses the resting line, daily_cost keeps the old message"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.test.ts#Phase 43: a failure caused by the kill switch or the ceiling shows the resting line"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/world_gen.test.ts#startWorldGeneration: resting refusals (Phase 43)"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/creation_generation.test.ts#startCreationGeneration: kill switch refusal (Phase 43)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-01
---

# Phase 43 Plan 03: Claim-time kill switch and ceiling Summary

**The executor re-checks the kill switch and the global ceiling at claim and ends a stopped job as failed (halted or ceiling) through failAtClaim, refunding once and releasing the domain lock; every such failure shows the one resting line instead of the generic copy.**

## Accomplishments

- `claimLlmJob` replaces the phase-ledger check at the same position (after the narration-age check, before the in-flight cap): `llmGate(tx)`, `failAtClaim('halted')` when halted, `failAtClaim('ceiling')` when `globalCeilingClaimHeld(tx, job, utcDay(tx.timestamp))` exceeds the gate's ceiling. Because the claim figure counts only in-flight and received jobs plus the job's own reservation, queued jobs competing for the last headroom are admitted in claim order and the rest refused.
- `llm_status.ts`: `LLM_RESTING_ERROR_CODES` (frozen `['halted', 'ceiling']`), `isRestingErrorCode`, both codes in `ACCOUNT_CLASSES` (public bucket `unavailable`), and a resting-code branch in `keeperMessageForJob` returning `LLM_RESTING_LINE` before the account branch.
- `llm_apply.ts`: `ApplyJob.errorCode`, filled by `toApplyJob` from `row.errorCode`. `applyLlmFailure` posts the resting line for creation (both routes), world_gen (via `failWorldGen`, which appends the `[explore]` hint), skill_gen (resting line plus the `[skills]` hint), and npc_conversation (one system line, no distracted dialog). Renown still inserts the static options; combat narration stays silent.
- `world_gen.ts`: a halted or ceiling refusal in `startWorldGeneration` stores the resting line and posts it with `Type [explore] to try again.`; other refusals keep the old message.

## Task Commits

1. **Task 1: claim-time kill switch and ceiling through failAtClaim, plus the resting status codes** - `a76ae377` (feat)
2. **Task 2: one resting line in every failure and refusal caused by the kill switch or the ceiling** - `5c5ff6e0` (feat)

## Tests flipped on purpose

| Test (file) | Old assertion | New assertion | Reason |
|---|---|---|---|
| phase ledger exhausted: failed 'billing' (llm_executor.test.ts) | after the ledger's spent passed $2, the claim ended the job failed with errorCode `billing`, reservation and call refunded, applyFailure once, no call | after `llmEnabled` is turned off, the claim ends the job failed with errorCode `halted`, the same refunds, applyFailure once (with `errorCode: 'halted'`), no call; the same shape is also asserted for a missing admin-state row and for `ceiling` | Phase 43 retires the $2 phase cap; the kill switch and the global ceiling replace it at claim (PLANNING-NOTES item 2). The refund, no-call and applyFailure-once assertions are kept |

## "Failed, not expired" interpretation

CONTEXT says pending jobs "expire with refunds at claim time". This plan implements that as status `failed` with error code `halted` or `ceiling` through the existing `failAtClaim`. Only the failed path runs `applyLlmFailure`, which releases the creation or world-gen lock and posts the line in the same transaction. An `expired` job would leave the lock to the sweeper's 60 s stranded-lock rule. Recorded per PLANNING-NOTES item 2.

## Verification

- Plan test files (`llm_executor`, `views/llm`, `llm_apply`, `world_gen`, `creation_generation`, `llm_apply.characterization`): pass; the characterization snapshot file is unchanged (`git diff --stat` on `__snapshots__` prints nothing, no `-u` used).
- Full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 63 files, 2523 tests, all pass (Plan 43-04 has not run, so no red allowance was needed).
- `spacetime build -p spacetimedb`: "Build finished successfully" (with the pre-existing "tsc not found" notice).
- Acceptance greps: `failAtClaim('halted')` 1, `failAtClaim('ceiling')` 1, `globalCeilingClaimHeld(tx, job, utcDay(tx.timestamp))` 1, `export function isRestingErrorCode` 1, `isRestingErrorCode(job.errorCode)` 1, `errorCode: row.errorCode` 1, `isRestingErrorCode(result.refused)` 1.
- No `spacetime publish`, `call` or `generate` was run; nothing touched the running local stack.

## Deviations from Plan

**1. [Process note] TDD RED was run, but each task is one `feat` commit rather than a test/feat pair.** Tests were written first and run red (11 failures in Task 1, 12 in Task 2) before the implementation, matching Plans 43-01 and 43-02.

**2. [Scope note] `ApplyJob.errorCode` assertions on the executor tests landed with Task 2.** Task 1's tests assert the refunds, the no-call result and the single `applyFailure` call; the check that the job handed to `applyFailure` carries the code needs `toApplyJob` from Task 2, so it was added in the Task 2 commit (same test file).

**3. [Interpretation] NPC resting line requires only the character.** The plan's behavior list seeds both character and NPC; for the resting codes the line is posted whenever the character exists, since the Keeper being unavailable does not depend on the NPC row.

No auto-fixed bugs and no scope creep.

## Known Stubs

None.

## Threat Flags

None. T-43-08 (claim-time re-check before any call, claim order), T-43-09 (idempotent refund, sweeper test), T-43-10 (lock release in the same transaction, creation test) and T-43-11 (bucket and resting line pinned in view tests) are mitigated and unit-tested. No new endpoint or trust boundary.

## Notes for later plans

- Plans 43-08 and 43-13 restructure the world and class branches of `applyLlmFailure`; they must keep the `resting ? LLM_RESTING_LINE : ...` behavior pinned by `llm_apply.test.ts`.
- Plan 43-06 still removes `isPhaseLedgerExhausted` and the phase-cap readers in `reducers/llm.ts` and `views/llm.ts`; the executor no longer imports it.

## Self-Check: PASSED

- Commits `a76ae377` and `5c5ff6e0` exist on master.
- All nine modified files exist and are committed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
