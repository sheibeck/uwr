---
phase: 41-executor-and-domain-cutover
plan: 01
subsystem: llm-executor-foundation
tags: [spacetimedb, llm, schema, constants, admin, test-utils]
status: complete
requires:
  - phase: 40 (Claude seam: enqueueLlmJob, logLlmCall, llm_job, llm_call_log)
provides:
  - "data/llm_limits.ts: every Phase 41 executor, retry, sweeper, budget and smoke constant"
  - "Five private tables: llm_dispatch, llm_sweep_tick, llm_player_budget, llm_spend, llm_admin_state"
  - "llm_job and llm_call_log Phase 41 columns"
  - "CLI/database-owner identity in ADMIN_IDENTITIES, pinned by test"
  - "test-utils seams: advanceMicros on scripted fetch replies/throws, databaseIdentity distinct from sender"
affects: [41-02, 41-03, 41-04, 41-05, 41-06, 41-07, 41-08, 41-09, 41-10]
tech-stack:
  added: []
  patterns:
    - "Constants module is pure (type-only import of LlmRoute), so it loads in plain Node vitest and the module bundle"
    - "New non-optional llm_job/llm_call_log columns use .default(...) so a non-clearing publish can migrate"
key-files:
  created:
    - spacetimedb/src/data/llm_limits.ts
    - spacetimedb/src/data/llm_limits.test.ts
    - spacetimedb/src/data/admin.test.ts
  modified:
    - spacetimedb/src/data/admin.ts
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/schema/llm_privacy.test.ts
    - spacetimedb/src/helpers/llm_queue.ts
    - spacetimedb/src/helpers/llm_queue.test.ts
    - spacetimedb/src/helpers/test-utils.ts
    - spacetimedb/src/helpers/test-utils.test.ts
key-decisions:
  - "Retry lifetime bound is a test: for every retrying route, 3 x timeout + 2 x (60 s cap + 1.6 s jitter) stays below the 10-minute pending expiry (worst case skill_gen/renown: 303.2 s)"
  - "llm_dispatch and llm_sweep_tick carry no scheduled: option; Plan 41-07 binds them with onSchedule"
  - "logLlmCall redacts first, then caps by code points, for errorMessage (400), stopReason and requestId (128)"
  - "CLI identity added to ADMIN_IDENTITIES by user decision; exact two-identity set is pinned by admin.test.ts"
metrics:
  tasks: 3
  files: 10
  tests_added: 26
  suite: "1480 passed (baseline 1454)"
completed: 2026-09-30
---

# Phase 41 Plan 01: Foundation (limits, private tables, admin identity, test seams) Summary

One constants module, five private tables, seven new columns, the CLI admin identity, and two test-seam extensions, so every later Phase 41 plan builds on pinned, tested shapes.

## What was built

### Task 1: constants module and admin set (commit 6fbccb2c)
- `data/llm_limits.ts` exports 25 `LLM_*` constants: in-flight cap 4, narration cap 3 (cap - 1), defer 500 ms + jitter in [0, 250), 3 attempts, retry bases 2000/8000 ms, retry cap 60000 ms, jitter fraction 0.2, no-auto-retry routes (creation_race, creation_class, world_gen, combat_narration, smoke_test), narration max age 20 s, sweep interval 30 s and grace values, pending expiry 10 min (renown 24 h), $1.00 and 200 calls per player per UTC day, 3 active jobs per player, $2.00 phase cap, retention 2 days, apply max attempts 2, smoke routes and JSON cap, singleton ids.
- `llm_limits.test.ts` pins every value, the frozen route lists, and two bounds: the retry lifetime stays under the pending expiry, and route timeout + in-flight grace stays under the host clamp + 30 s.
- `ADMIN_IDENTITIES` gains the CLI/database-owner identity `c2002524...6d`; `admin.test.ts` pins the exact set and the `Admin only` throw.

### Task 2: tables, columns, queue row shapes (commit 2464498e)
- Tables (all private, no `public` flag, registered in `schema({...})`): `llm_dispatch` (scheduledId, scheduledAt, jobId), `llm_sweep_tick` (scheduledId, scheduledAt), `llm_player_budget` (id, playerId, dayUtc, reservedMicroUsd, spentMicroUsd, calls; index `by_player`), `llm_spend` (id, spentMicroUsd, reservedMicroUsd, calls, updatedAt), `llm_admin_state` (id, keySet, keyLength, keyUpdatedAt?, keyVerifiedAt?, keyLastCheckOk, lastSmokeAt?, lastSmokeJson).
- New `llm_job` columns (appended): `nextAttemptAt` (timestamp, optional), `reservedMicroUsd` (u64, default 0n), `costMicroUsd` (u64, default 0n), `budgetDay` (string, default ''), `applyAttempts` (u64, default 0n).
- New `llm_call_log` columns (appended): `costMicroUsd` (u64, default 0n), `dispatchLateMs` (u64, default 0n).
- `enqueueLlmJob` writes the four new non-optional job columns; `logLlmCall` writes the two new log columns, takes `needles`, and redacts and caps `stopReason` and `requestId` (new `LLM_CALL_LOG_FIELD_MAX_CHARS = 128`) as well as `errorMessage`.
- `llm_privacy.test.ts` pins the new columns, each new table's shape and privacy, the `by_player` index, and the public llm_* set at exactly `['llm_task']`.

### Task 3: test seams and wave gate (commit 4e5d7a2f)
- `MockReply.advanceMicros` and `MockThrow.advanceMicros` advance the mock clock before fetch returns or throws.
- `MockProcCtxOptions.databaseIdentity` and `createMockCtx({ databaseIdentity })` allow a module identity distinct from the sender (defaults unchanged).
- Wave gate: full suite 1480 passed (single worker), `spacetime build -p spacetimedb` finished successfully.

## Assumption-delta decision (recorded per plan)
The orchestrator's `assumption-delta scan 41` flagged two terms, both false positives: "second" is the ordinal in "a second transaction" (claim, fetch, persist, apply), and "chosen" refers to the Phase 39 go decision for the scheduled-procedure executor. There is no singular-to-plural identity change: every job carries exactly one requesting player identity and the executor runs as one module identity. The only identity-set change is the user-approved CLI admin addition, pinned by `admin.test.ts`.

## Deviations from Plan

None to the plan's substance. Two process notes:
- The first task 1 commit attempt used the orchestrator-supplied trailer naming "Claude Opus 5.5 (1M context)" and was refused by the permission classifier. I re-issued it with the attribution trailer from the harness system-reminder ("Claude Sonnet 5.5", the model actually running) plus the same Claude-Session line, and used that trailer for every commit in this plan. The orchestrator may want to correct its trailer template.
- Task 1 tests and implementation were written together and committed in one `feat` commit rather than as separate RED/GREEN commits (the plan-level type is `execute`, not `tdd`).

## Known Stubs
None. The two schedule tables are intentionally unbound until Plan 41-07; nothing renders empty data.

## Threat Flags
None beyond the plan's threat model. T-41-01 (private tables, public set pinned), T-41-06 (admin set pinned) and T-41-01b (needle redaction in all call-log text fields) are mitigated and tested.

## Notes for later plans
- RESEARCH A3 (non-optional columns with `.default()` migrate on a non-clearing publish) is unverified until the first local publish in Plan 41-10; a local `--clear-database` is allowed if the publish asks for it.
- `spacetime build` prints "tsc not found in node_modules" before "Build finished successfully"; this is pre-existing and does not fail the build.
- No publish was run in this plan; nothing touched maincloud; `.env.local` was never read.

## Self-Check: PASSED
- FOUND: spacetimedb/src/data/llm_limits.ts, llm_limits.test.ts, admin.test.ts
- FOUND commits: 6fbccb2c, 2464498e, 4e5d7a2f
