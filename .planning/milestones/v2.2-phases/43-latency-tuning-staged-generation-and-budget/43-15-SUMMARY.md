---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 15
subsystem: infra
tags: [spacetimedb, publish, bindings, kill-switch, budget, checklist]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: kill switch and ceiling reducers, staged generation, tuning (43-06, 43-07, 43-09, 43-13, 43-14)
provides:
  - Phase 43 module published to the local server with no clear; stored key intact
  - regenerated client bindings (admin_llm_status new fields, llm_set_enabled and llm_set_daily_ceiling reducers)
  - src/llmAdminBindings.test.ts pinning the bindings and the no-private-llm-table rule
  - live zero-cost kill switch and ceiling round trip evidence
  - 43-USER-CHECKLIST.md
affects: [44]

key-files:
  created:
    - src/llmAdminBindings.test.ts
    - src/module_bindings/llm_set_enabled_reducer.ts
    - src/module_bindings/llm_set_daily_ceiling_reducer.ts
    - .planning/phases/43-latency-tuning-staged-generation-and-budget/43-USER-CHECKLIST.md
    - .planning/phases/43-latency-tuning-staged-generation-and-budget/deferred-items.md
  modified:
    - src/module_bindings/admin_llm_status_table.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts

key-decisions:
  - "Publish used --break-clients only, after the CLI asked for it and the migration plan was read (view recreated, four defaulted columns added, no table removed)"
  - "Bindings test pins the generated names as the generator emits them (snake_case __reducerSchema registration, PascalCase import, *Params types), not camelCase text in index.ts"

requirements-completed: []  # standing rule: no requirements mark-complete

metrics:
  completed: 2026-10-01
---

# Phase 43 Plan 15: Local publish, key check, zero-cost kill switch round trip, bindings and checklist Summary

**Phase 43 is live on the local server with no clear: the stored key survived (key_set true, key_length 108 before and after), the kill switch and ceiling were proven at zero cost, bindings regenerated and idempotent, all gates green, and the user checklist written.**

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `74b5d357` | chore(43-15): regenerate bindings after the Phase 43 local publish |
| 2 | none | no file changes (live checks and gates only) |
| 3 | `5d9a5fc9` | docs(43-15): user checklist for live checks and the maincloud publish |

## Server state

- The local server was DOWN at the start (`spacetime server ping local` refused; netstat showed nothing on port 3000).
- Claude started it: `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` with run_in_background, background task id `bryfoa7ww`. Listener `spacetimedb-standalone.exe`, **PID 15116**, 127.0.0.1:3000.
- **Left running** at the end (verified listening, ping online). The Vite client was not started.

## Task 1: publish evidence

RED: `src/llmAdminBindings.test.ts` failed 3 of 4 against the old bindings (the privacy test passes as a pre-existing invariant).

Pre-publish (no secrets):

| Query | Result |
|-------|--------|
| `SELECT key_set, key_length FROM admin_llm_status` | true, **108** (KEY_LEN_BEFORE) |
| COUNT player / character / region / location / llm_job | 3 / 1 / 1 / 6 / 38 |

Commands, in order (every one named `--server local`; no command targeted maincloud):

1. `spacetime build -p spacetimedb` : "Build finished successfully."
2. `spacetime publish uwr --server local < /dev/null` (no flags). Output listed the migration plan: `Removed view: admin_llm_status`, `Created columns in table llm_admin_state`, `Created columns in table llm_spend` (both with defaults), `Created view: admin_llm_status`, then `Warning: All clients will be disconnected due to breaking schema changes ... Do you want to proceed? [y/N]Aborting`, exit 1. This is the break-clients prompt the plan allows; the plan contained no removed table and no data deletion.
3. `spacetime publish uwr --server local --break-clients < /dev/null` : "Checking for breaking changes...", same plan, then `Updated database with name: uwr, identity: c200f202...`, exit 0.

The only flag beyond the bare command was `--break-clients`. No `-y`, `--yes`, `--delete-data`, `-c` or `--clear-database` was passed on any publish.

Post-publish:

| Query | Result |
|-------|--------|
| key_set, key_length | **true, 108** (equal to KEY_LEN_BEFORE) |
| llm_enabled, daily_ceiling_micro_usd, spend_day_utc, day_spent_micro_usd | true, 10000000, "", 0 |
| COUNT player / character / region / location / llm_job | 3 / 1 / 1 / 6 / 38 (unchanged) |
| logs grep `database updated|panic|error` | `INFO: Database updated` (08:54:53) present after the publish; no panic after it (see Deferred Issues for earlier-session panics) |

Bindings: `pnpm spacetime:generate -y`; `git status --porcelain src/module_bindings` showed `admin_llm_status_table.ts`, `index.ts`, `types.ts`, `types/reducers.ts` modified and `llm_set_enabled_reducer.ts`, `llm_set_daily_ceiling_reducer.ts` new. `admin_llm_status_table.ts` now contains `dailyCeilingMicroUsd`, `llmEnabled`, `spendDayUtc`, `daySpentMicroUsd` and no `phaseCapMicroUsd`. GREEN: `src/llmAdminBindings.test.ts` and `src/legacyLlmRemoval.test.ts` 24 passed; `spacetimedb` `llm_privacy.test.ts` and `llm_absence.test.ts` 33 passed. `pnpm build` passed, guard printed `bundle clean: 4 files scanned`.

## Task 2: zero-cost round trip

Pre-check: llm_job rows with status pending / in_flight / received were all 0, so flipping the switch back on could not dispatch anything. in_flight 0, day_spent 0.

| Call | Result | View after |
|------|--------|-----------|
| `spacetime call --server local uwr llm_set_enabled false` | ok | llm_enabled false |
| `... llm_set_enabled true` | ok | true |
| `... llm_set_daily_ceiling 12500000` | ok | 12500000 |
| `... llm_set_daily_ceiling 10000000` | ok | 10000000 |
| `... llm_set_daily_ceiling 5` | refused: "Daily ceiling must be between $0.01 and $1000.00." (HTTP 530) | still 10000000 |

Logs (grep filtered): `llm calls off`, `llm calls on`, `llm daily ceiling set, micro_usd=12500000`, `llm daily ceiling set, micro_usd=10000000`. Nothing secret. After the round trip: day_spent_micro_usd 0, in_flight 0, llm_job count still 38, so no LLM job was dispatched and spend was $0.

Idempotency: `spacetime publish uwr --server local < /dev/null` with no flag printed an empty Database Migration Plan and `Updated database with name: uwr` (exit 0, no prompt). A second `pnpm spacetime:generate -y` left `git status --porcelain src/module_bindings` empty. Final state: `key_set true, key_length 108, llm_enabled true, daily_ceiling_micro_usd 10000000`.

Gates: bindings and legacy tests 24 passed; `spacetime build -p spacetimedb` ok; `pnpm build` ok with `bundle clean`; full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 69 files, 3110 tests passed. `git status` shows `.claude/settings.local.json`, `public/assets/logo.png`, `public/assets/logo_old.png` unstaged and untouched.

## Task 3

`43-USER-CHECKLIST.md` written in the Phase 42 style with sections for the live play check, admin `/llm` controls, measurement outcome (sweep applied, LAT-06 leave_out), maincloud (user-run, ordered after the Phase 42 sequence, never clear) and what Claude never did. Contains "/llm stats", "/llm off", "llm_set_daily_ceiling", "never clear"; no key material.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bindings test asserted names the generator does not emit**
- **Found during:** Task 1 step 5 (GREEN run)
- **Issue:** The plan said `index.ts` names `llmSetEnabled` / `llmSetDailyCeiling`. The generated `index.ts` registers `__reducerSchema("llm_set_enabled", LlmSetEnabledReducer)` and the camelCase call is derived at runtime; the generated `types/reducers.ts` carries `LlmSetEnabledParams` / `LlmSetDailyCeilingParams`.
- **Fix:** The test now asserts the registration lines and the `*Params` types, which still pin the same contract.
- **Files modified:** src/llmAdminBindings.test.ts
- **Commit:** 74b5d357

No other deviations. The `--break-clients` publish is the plan's explicitly allowed branch, not a deviation.

## Deferred Issues

- **Pre-existing `time` command bug** (`spacetimedb/src/reducers/intent.ts:108` uses `getWorldState` without an import; four `PANIC: submit_intent ... getWorldState is not defined` lines from 2026-10-01T01:02 in the local log). Unrelated to Phase 43, not fixed; logged in `deferred-items.md` with the suggested fix.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Files exist: `src/llmAdminBindings.test.ts`, `src/module_bindings/llm_set_enabled_reducer.ts`, `src/module_bindings/llm_set_daily_ceiling_reducer.ts`, `43-USER-CHECKLIST.md`, `deferred-items.md`
- Commits exist: `74b5d357`, `5d9a5fc9`
