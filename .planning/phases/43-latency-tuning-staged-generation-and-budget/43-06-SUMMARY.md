---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 06
subsystem: api
tags: [spacetimedb, llm, admin, kill-switch, daily-ceiling, view, live-proof, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: llmGate, setLlmEnabled, dailyCeilingProblem, setDailyCeiling, globalDayHeld, daily ceiling bounds (Plan 43-01); claim-time gate (Plan 43-03); ten-route smoke list (Plan 43-05)
provides:
  - llm_set_enabled and llm_set_daily_ceiling admin reducers
  - llm_smoke_test gated all or nothing by the kill switch and the global daily ceiling
  - admin_llm_status with llmEnabled, dailyCeilingMicroUsd, spendDayUtc, daySpentMicroUsd (fifteen keys)
  - todayUtcString and heldTodayMicroUsd harness rules; live-proof spend guard on today's held spend and the ceiling
  - the $2 phase cap fully retired (constant, helper, view field, smoke check, harness guard)
affects: [43-08, 43-09, 43-13, 43-15]

tech-stack:
  added: []
  patterns:
    - "Admin reducers have no character context: requireAdmin(ctx) plus SenderError, plain-fact log lines (booleans and micro-USD only)"
    - "A view has no transaction clock, so it exposes the raw ledger day fields and readers compare the day themselves"

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/llm.ts
    - spacetimedb/src/reducers/llm_admin.test.ts
    - spacetimedb/src/views/llm.ts
    - spacetimedb/src/views/llm.test.ts
    - scripts/llm/proof_rules.mjs
    - scripts/llm/proof_rules.test.mjs
    - scripts/llm/prove-live.live.ts
    - spacetimedb/src/data/llm_limits.ts
    - spacetimedb/src/data/llm_limits.test.ts
    - spacetimedb/src/helpers/llm_budget.ts
    - spacetimedb/src/helpers/llm_budget.test.ts

key-decisions:
  - "The smoke test checks the kill switch first, then today's held spend (spent plus every reservation still held, smoke jobs included) plus the sum of all smoke reservations against the ceiling; a total exactly at the ceiling is allowed"
  - "A missing llm_admin_state row reads in the view as halted with a zero ceiling (fails closed, like llmGate); a row from before Plan 43-01 reads enabled with the default ceiling"
  - "Negative guards for the retired names build them from fragments so the acceptance grep over spacetimedb/src and scripts reads 0"

patterns-established:
  - "Harness spend guard: shouldStopForSpend(heldTodayMicroUsd(status, todayUtcString(Date.now())), 0n, ceiling, margin)"

requirements-completed: []  # COST-03 controls delivered; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "llm_set_enabled and llm_set_daily_ceiling refuse non-admins with 'Admin only' and write nothing; the ceiling accepts $0.01 to $1,000.00 inclusive and refuses MIN-1, MAX+1 and 0 with the range message"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_admin.test.ts#llm_set_enabled, #llm_set_daily_ceiling"
        status: pass
    human_judgment: false
  - id: D2
    description: "llm_smoke_test creates no job, dispatch or reservation while calls are off or when its reservations would pass the ceiling (one micro-USD over refused, exactly at accepted)"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_admin.test.ts#llm_smoke_test"
        status: pass
    human_judgment: false
  - id: D3
    description: "admin_llm_status exposes the fifteen keys, returns [] to non-admins, uses index lookups only and never reads llm_config or leaks the key"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/views/llm.test.ts#admin_llm_status view"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live-proof harness reads the new fields and guards on today's held spend and the daily ceiling (not run: no paid call in this plan)"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "scripts/llm/proof_rules.test.mjs"
        status: pass
    human_judgment: false
  - id: D5
    description: "The $2 phase cap has no reader left; full root suite green (63 files, 2611 tests) and the module builds"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "CI=true pnpm exec vitest run --maxWorkers=1"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-01
---

# Phase 43 Plan 06: Kill switch, daily ceiling reducers and phase-cap retirement Summary

**An admin can turn all LLM calls off and on and set the global daily ceiling ($0.01 to $1,000.00) through two reducers, the smoke test and the live-proof harness obey both, `admin_llm_status` shows them next to today's spend, and the $2 phase cap has no reader left.**

## Accomplishments

- `reducers/llm.ts`: `llm_set_enabled({ enabled })` (logs "llm calls on" or "llm calls off") and `llm_set_daily_ceiling({ microUsd })` (logs `llm daily ceiling set, micro_usd=<n>`), both `requireAdmin(ctx)` first, the ceiling checked by `dailyCeilingProblem` and refused with a `SenderError`. `llm_smoke_test` now refuses with "llm smoke test refused: llm calls are off" or "llm smoke test refused: daily ceiling" before writing anything, so a run is all or nothing.
- `views/llm.ts`: `admin_llm_status` swaps the phase-cap field for `dailyCeilingMicroUsd`, `llmEnabled`, `spendDayUtc` and `daySpentMicroUsd`. It still returns `[]` to non-admins, reads only the two singletons by id and in-flight jobs by index, and never touches `llm_config` (grep count 0).
- `scripts/llm/proof_rules.mjs`: pure `todayUtcString(ms)` and `heldTodayMicroUsd(status, todayUtc)`. `prove-live.live.ts` prints `spentToday reserved ceiling enabled` and its paid-step guard calls `shouldStopForSpend(heldTodayMicroUsd(...), 0n, dailyCeilingMicroUsd, margin)`. The harness was not run.
- Deleted `LLM_PHASE_SPEND_CAP_MICRO_USD` (llm_limits.ts) and `isPhaseLedgerExhausted` (llm_budget.ts) with their pins and describe block. Reason: Phase 43 CONTEXT retires the $2 phase cap and the global daily ceiling replaces it. `llm_spend` stays as the all-time record.

## Final `ADMIN_LLM_STATUS_KEYS` (fifteen)

`keySet`, `keyLength`, `keyValid`, `keyUpdatedAt`, `keyVerifiedAt`, `lastSmokeAt`, `lastSmokeJson`, `phaseSpentMicroUsd`, `phaseReservedMicroUsd`, `phaseCalls`, `dailyCeilingMicroUsd`, `llmEnabled`, `spendDayUtc`, `daySpentMicroUsd`, `inFlight`

## Task Commits

1. **Task 1: kill-switch and ceiling reducers, gated smoke test** - `91d64a70` (feat)
2. **Task 2: admin_llm_status fields and live-proof spend guard** - `994ed26a` (feat)
3. **Task 3: retire the phase cap constant and helper** - `e0191ba0` (refactor)

## Flipped tests (on purpose, nothing weakened, skipped or deleted)

| File | Test | Change and reason |
|---|---|---|
| llm_admin.test.ts | "at the phase cap creates no jobs and does not throw" | Now "at the daily ceiling ...": seeds today's spend equal to the ceiling and also asserts the refusal log line. Phase 43 CONTEXT retires the phase cap; the smoke test follows the global daily ceiling |
| llm_admin.test.ts | "with headroom for only some routes creates none" | Now "one micro-USD over the ceiling creates no job at all", using the sum of all smoke reservations (the old figure was one route's cost) |
| llm_admin.test.ts | new cases | exactly at the ceiling creates every smoke job; reservations still held count; calls off creates nothing; both reducers (non-admin, range, bounds, log lines, key leak) |
| views/llm.test.ts | "returns the defaults to an admin with no state or ledger yet" | phaseCapMicroUsd 2_000_000n replaced by dailyCeilingMicroUsd 0n, llmEnabled false, spendDayUtc '', daySpentMicroUsd 0n; seeded `llm_admin_state: []` because the shared mock otherwise carries a default row |
| views/llm.test.ts | "returns the state, ledger totals and in-flight count" | phase cap replaced by the column defaults an older seed reads (enabled, $10 ceiling, no day); new case for stored values |
| views/llm.test.ts | "exposes exactly the twelve documented keys" | now fifteen keys, with a check that the old field is gone |
| llm_limits.test.ts | "holds the budget, apply and singleton values" | the 2_000_000n pin replaced by a check that the constant no longer exists |
| llm_budget.test.ts | `isPhaseLedgerExhausted` describe block | removed with the helper; "the old $2 phase figure no longer refuses anything" kept, now with a local plain figure |
| proof_rules.test.mjs | harness source guard | gains: uses `heldTodayMicroUsd(` and `dailyCeilingMicroUsd`, no longer names the phase-cap field |

## Verification

- Task gates: llm_admin 32 tests, views/llm 36, proof_rules 31, and the four-file Task 3 gate 134 tests pass.
- Full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 63 files, 2611 tests, all green.
- `spacetime build -p spacetimedb`: "Build finished successfully" (pre-existing "tsc not found" notice).
- Acceptance greps: both reducers 1 each, `requireAdmin(ctx)` 5, "daily ceiling" refusal 1, `llm_config` in the view 0, retired names in `spacetimedb/src` and `scripts` 0, new harness functions 2.
- No `spacetime publish`, `call` or `generate` was run. Bindings in `src/module_bindings` still carry `phaseCapMicroUsd` and are regenerated in Plan 43-15.

## Deviations from Plan

None in behavior. Two small process notes:

- **[Process] Test fixtures.** The admin-view default case needed `llm_admin_state: []` because the shared mock seeds a default state row (Plan 43-01); the plan's "no state" truth is tested with an explicitly empty seed.
- **[Process] Line endings.** `llm.ts` and a few working files are CRLF on disk with LF in the index (`eol=lf`); my first scripted edit flipped `llm.ts` to CRLF and I converted it back to LF before committing. Diffs are content-only.

## Known Stubs

None.

## Threat Flags

None. T-43-15 (requireAdmin before any write, stranger tests prove nothing changes), T-43-16 (u64 range check, MIN-1 and MAX+1 refused), T-43-17 (view never reads llm_config; log lines carry booleans and micro-USD only; leak test over every table and the console) and T-43-18 (smoke test all or nothing against kill switch and ceiling) are mitigated and test-pinned.

## Self-Check: PASSED

- Commits `91d64a70`, `994ed26a` and `e0191ba0` exist on master.
- All eleven modified files are committed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
