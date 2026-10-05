---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 01
subsystem: api
tags: [spacetimedb, llm, budget, kill-switch, ceiling, vitest]
status: complete

requires:
  - phase: 41-llm-executor-and-budget
    provides: llm_spend ledger, llm_admin_state singleton, reserveLlmBudget, enqueueLlmJob, per-player limits
provides:
  - Global daily spend ceiling ($10 default, UTC day) counted as reserved plus today's spent, smoke jobs included
  - Admin kill switch (llmEnabled) on llm_admin_state; a missing admin-state row fails closed
  - Lazy UTC-midnight day counter on llm_spend (dayUtc, daySpentMicroUsd); spentMicroUsd stays the all-time record
  - Refusal reasons halted and ceiling sharing one numberless in-voice line (LLM_RESTING_LINE)
  - globalCeilingClaimHeld helper for the claim-time check in Plan 43-03
  - defaultLlmAdminStateRow and a default enabled admin-state row in the shared createMockDb
affects: [43-03, 43-06, 43-15, admin reducers, status views]

tech-stack:
  added: []
  patterns:
    - "Fail-closed gate: llmGate(tx) returns halted true on a missing row; an absent field reads as its column default"
    - "Lazy day roll: every ledger write carries { dayUtc: today, daySpent: spentIfSameDay } instead of a scheduler"
    - "Additive schema only: four columns, each with .default(...), so the existing local database migrates without a clear"

key-files:
  created: []
  modified:
    - spacetimedb/src/data/llm_limits.ts
    - spacetimedb/src/data/llm_limits.test.ts
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/helpers/llm_admin_state.ts
    - spacetimedb/src/helpers/llm_admin_state.test.ts
    - spacetimedb/src/helpers/llm_budget.ts
    - spacetimedb/src/helpers/llm_budget.test.ts
    - spacetimedb/src/helpers/llm_queue.ts
    - spacetimedb/src/helpers/llm_queue.test.ts
    - spacetimedb/src/helpers/renown_llm.test.ts
    - spacetimedb/src/helpers/test-utils.ts
    - spacetimedb/src/helpers/test-utils.test.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/helpers/llm_apply.characterization.test.ts
    - spacetimedb/src/schema/llm_privacy.test.ts
    - spacetimedb/src/reducers/llm_admin.test.ts

key-decisions:
  - "The $2 phase cap constant stays (reducers/llm.ts and views/llm.ts still import it, isPhaseLedgerExhausted still exists); its doc comment now says it is no longer a limit and Plan 43-06 removes it"
  - "halted is checked in enqueueLlmJob after the dedupe merge and before the busy check, and again inside reserveLlmBudget, so a halted game never answers busy and an active job still merges"
  - "A late swap across UTC midnight floors the new day's figure at 0 (over-counts only); all-time spentMicroUsd stays exact"
  - "Shared createMockDb seeds an enabled admin-state row unless the seed has its own llm_admin_state key; tests needing the missing-row case pass llm_admin_state: []"

patterns-established:
  - "Tests that assert a table is untouched opt out of the default admin row with llm_admin_state: []"

requirements-completed: []  # COST-03 is the enqueue half only in this plan; the requirement is not marked here (standing rule: no requirements mark-complete)

coverage:
  - id: D1
    description: "Ceiling boundary at ceiling-1, ceiling, ceiling+1 micro-USD (ends under, exactly at, over); over is refused as ceiling with nothing written"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_budget.test.ts#reserveLlmBudget: global daily ceiling boundary"
        status: pass
    human_judgment: false
  - id: D2
    description: "Kill switch off, or a missing admin-state row, refuses before any write (no job, dispatch row, reservation); halted wins over busy; a dedupe hit still merges"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_queue.test.ts#kill switch and ceiling at enqueue"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_admin_state.test.ts#llmGate (kill switch and ceiling)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Halted and ceiling share one numberless resting line that passes the banned-phrase and Keeper pronoun patterns"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_queue.test.ts#LLM_RESTING_LINE"
        status: pass
    human_judgment: false
  - id: D4
    description: "Lazy UTC-midnight day roll: reserve at 23:59:59, settle at 00:00:01 lands the cost on the new day and the old day stops counting"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_budget.test.ts#global day counter"
        status: pass
    human_judgment: false
  - id: D5
    description: "Four additive defaulted columns (llmEnabled true, dailyCeilingMicroUsd 10000000, dayUtc empty, daySpentMicroUsd 0); no column dropped or retyped"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/schema/llm_privacy.test.ts#llm_admin_state has exactly the planned columns and flags"
        status: pass
      - kind: other
        ref: "git diff of schema/tables.ts adds four .default( column lines and removes no column line; spacetime build -p spacetimedb exits 0"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-30
---

# Phase 43 Plan 01: Global ceiling and kill switch at enqueue Summary

**Global $10 UTC-day spend ceiling and admin kill switch checked inside enqueueLlmJob before any write, failing closed on a missing admin-state row, answered by one numberless "The Keeper is resting. Return later." line.**

## Performance

- **Duration:** about 15 min
- **Started:** 2026-09-30T21:40Z (local)
- **Completed:** 2026-09-30
- **Tasks:** 3 of 3
- **Files modified:** 16 (13 listed in the plan, 3 fixture files described under Deviations)

## Accomplishments

- Four additive columns, all defaulted: `llm_spend.dayUtc` (''), `llm_spend.daySpentMicroUsd` (0n), `llm_admin_state.llmEnabled` (true), `llm_admin_state.dailyCeilingMicroUsd` (10_000_000n). No clear needed for the local database.
- `llm_admin_state.ts`: `ensureLlmAdminState`, `llmGate` (missing row gives halted and a 0 ceiling; an absent field reads as its column default), `setLlmEnabled`, `dailyCeilingProblem`, `setDailyCeiling` (range $0.01 to $1000).
- `llm_budget.ts`: refusal order halted, daily_calls, daily_cost, ceiling. `ledgerDaySpent`, `globalDayHeld`, `globalCeilingClaimHeld`; the day counter rolls lazily on every ledger write (reserve, add, subtract). The $2 phase ledger no longer refuses anything; `spentMicroUsd`, `reservedMicroUsd` and `calls` still record all-time figures.
- `llm_queue.ts`: `LLM_RESTING_LINE`, `halted` and `ceiling` refusal messages (phase_cap entry dropped), and a pre-busy `llmGate(ctx).halted` refusal after the dedupe merge.
- `spacetimedb.init` seeds the admin-state row via `ensureLlmAdminState(ctx)`. The shared `createMockDb` seeds `defaultLlmAdminStateRow()` unless the seed has its own `llm_admin_state` key.

## Task Commits

1. **Task 1: constants, defaulted columns, gate helpers, default mock row, init seed** - `4be58b2f` (feat)
2. **Task 2: global day counter, ceiling and halted refusals in the budget module** - `a94a7b1b` (feat)
3. **Task 3: resting line, refusal reasons, pre-busy halted gate, plus fixture fallout** - `8f22f0e8` (feat)

## Verification

- Plan test files (limits, admin_state, budget, queue, renown_llm, test-utils, test-utils.strict): pass.
- Full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 62 files, 2467 tests, all pass; no snapshot file changed and no `-u` was used.
- `spacetime build -p spacetimedb`: "Build finished successfully" (it also prints a pre-existing "tsc not found" notice). A direct `tsc --noEmit` shows only pre-existing errors in `index.ts` (reducer option typings and the `player` insert), none in files this plan touched.
- Acceptance greps from the plan all match (5 admin-state exports, 3 budget exports, `llmGate(ctx)` in budget and queue, `ensureLlmAdminState(ctx)` in index, 4 defaulted column lines).
- No `spacetime publish`, `spacetime call` or `spacetime generate` was run; nothing touched the running local stack.

## Tests flipped on purpose

| Test (file) | Old assertion | New assertion | Reason |
|---|---|---|---|
| allows a reservation at exactly $2.00 (llm_budget.test.ts) | reserved plus spent at the $2 phase cap is allowed | reserved plus today's spent at exactly the ceiling is allowed | Phase 43 CONTEXT retires the phase cap; the ceiling replaces it |
| refuses one micro-USD over $2.00 as phase_cap (llm_budget.test.ts) | refused `phase_cap` | `ceiling plus 1` refused `ceiling`, snapshot unchanged | same |
| phase_only is still refused by the phase cap (llm_budget.test.ts) | refused `phase_cap` | refused `ceiling` | same |
| refusal order (llm_budget.test.ts) | daily_calls, daily_cost, phase_cap | halted, daily_calls, daily_cost, ceiling | new reasons and order |
| every refusal leaves the snapshot identical (llm_budget.test.ts) | phase-cap seed | ceiling seed plus a halted seed | same |
| budget refusals write nothing: phase cap case (llm_queue.test.ts) | reason `phase_cap` | `ceiling` (ledger at the ceiling today), plus halted and missing-row cases | same |
| a refused renown job is also traceless (llm_queue.test.ts) | `phase_cap` | `ceiling` | same |
| llmRefusalMessage reasons list (llm_queue.test.ts) | daily_cost, daily_calls, phase_cap, busy | daily_cost, daily_calls, halted, ceiling, busy; keys pinned to `['busy','ceiling','daily_calls','daily_cost','halted']` | same |
| a refusal at the phase cap falls back to static options (renown_llm.test.ts) | ledger spent at $2 | ledger at the daily ceiling today; static-options assertions unchanged | same |
| a rank with no static pool inserts nothing (renown_llm.test.ts) | ledger spent at $2 | ledger at the daily ceiling today; assertions unchanged | same |

## Fixtures that needed attention for the default admin-state row

No hand-built context needed `defaultLlmAdminStateRow()` added. The direction ran the other way: the shared mock now carries the default row, so tests that assert on the admin-state table opt out with `llm_admin_state: []`.

- `spacetimedb/src/helpers/llm_admin_state.test.ts`: the four absent-row cases use a `makeEmptyCtx()` helper (seeds `llm_admin_state: []`).
- `spacetimedb/src/reducers/llm_admin.test.ts`: three "rejects ... and writes nothing" tests (set_api_key non-admin, set_api_key blank key, llm_smoke_test non-admin) seed `llm_admin_state: []`.
- `spacetimedb/src/helpers/llm_apply.characterization.test.ts`: `newCtx` seeds `llm_admin_state: []` and `dump` drops that table while it is empty, so all 112 stored snapshots stay byte-identical (any row the apply path wrote there would still appear).
- `spacetimedb/src/schema/llm_privacy.test.ts`: the expected column lists for `llm_spend` and `llm_admin_state` gained the four new columns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Three test files outside the plan's file list failed on the new default row and columns**
- **Found during:** Task 3, the plan-level full-suite gate
- **Issue:** `llm_privacy.test.ts` pins the exact column set of `llm_spend` and `llm_admin_state`; `llm_apply.characterization.test.ts` snapshots the whole mock database (the default row would have changed 112 snapshots); `llm_admin.test.ts` asserted the admin-state table is empty after a rejected call.
- **Fix:** extended the expected column lists; seeded the empty table in the characterization and admin tests as described above. No assertion was weakened or removed and no snapshot was updated.
- **Files modified:** `spacetimedb/src/schema/llm_privacy.test.ts`, `spacetimedb/src/helpers/llm_apply.characterization.test.ts`, `spacetimedb/src/reducers/llm_admin.test.ts`
- **Committed in:** `8f22f0e8`

**2. [Process note] TDD RED run was skipped for Task 1**
- Tests and implementation for Task 1 were written before the first run, so there is no separate failing-test run or commit. The tests were then verified green, and the boundary, rollover and fail-closed cases in Tasks 2 and 3 were written against the stated behavior. Each task is one `feat` commit rather than a test/feat pair.

**Total deviations:** 1 auto-fixed (Rule 3), 1 process note. No scope creep.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust boundary; the plan's T-43-01 to T-43-04 mitigations are implemented and unit-tested (ceiling boundary, fail-closed gate, numberless resting line, additive-only schema).

## Notes for later plans

- Plan 43-03 should call `globalCeilingClaimHeld(tx, job, utcDay(tx.timestamp))` against `llmGate(tx).ceilingMicroUsd` at claim time.
- Plan 43-06 removes `LLM_PHASE_SPEND_CAP_MICRO_USD`, `isPhaseLedgerExhausted` and the remaining readers in `reducers/llm.ts` and `views/llm.ts`.
- Plan 43-15 publishes locally; the four defaulted columns need no clear. Generated client bindings (`src/module_bindings`) were not regenerated here (standing rule), so `admin_llm_status_table.ts` still shows only `phaseCapMicroUsd`.
- No reducer exposes `setLlmEnabled` or `setDailyCeiling` yet; this plan builds the helpers only.

## Self-Check: PASSED

- Commits `4be58b2f`, `a94a7b1b`, `8f22f0e8` exist on master.
- All 16 modified files exist and are committed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
