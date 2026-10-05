---
phase: 41-executor-and-domain-cutover
plan: 08
subsystem: llm-admin-controls
tags: [spacetimedb, llm, admin, smoke-test, view, key-status, tests]
status: complete
requires:
  - phase: 41-05 (enqueueLlmJob with budget 'phase_only', SOURCE_KEYS.smokeTest)
  - phase: 41-06 (llm_admin_state helpers: patchAdminState, isKeyValid; executor records smoke results)
provides:
  - "reducers/llm.ts: set_api_key status update and LLM_KEY_SET_LOG_PREFIX, llm_smoke_test, grant_test_pending_level"
  - "views/llm.ts: admin_llm_status view, projectAdminLlmStatus, ADMIN_LLM_STATUS_KEYS"
  - "reducers/llm_admin.test.ts (21 tests) and 9 new view tests"
  - "regenerated client bindings: admin_llm_status_table, llm_smoke_test_reducer, grant_test_pending_level_reducer"
affects: [41-09, 41-10]
tech-stack:
  added: []
  patterns:
    - "Admin view is public (per-subscriber) and returns [] unless ADMIN_IDENTITIES has the sender; lookups only"
    - "Smoke run is all or nothing: total reservation is checked against the phase headroom before any job is written"
key-files:
  created:
    - spacetimedb/src/reducers/llm_admin.test.ts
    - src/module_bindings/admin_llm_status_table.ts
    - src/module_bindings/llm_smoke_test_reducer.ts
    - src/module_bindings/grant_test_pending_level_reducer.ts
  modified:
    - spacetimedb/src/reducers/llm.ts
    - spacetimedb/src/views/llm.ts
    - spacetimedb/src/views/llm.test.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts
key-decisions:
  - "The log line the key script must match is exactly 'llm key set, len=<n>' (prefix constant LLM_KEY_SET_LOG_PREFIX = 'llm key set, len=', <n> is the trimmed key length)"
  - "llm_smoke_test pre-checks the summed reservation of all six routes against the phase headroom, so a near-cap run creates nothing instead of a partial run"
  - "The view's row type is named AdminLlmStatusRow: the SDK derives the type name AdminLlmStatus from the view name admin_llm_status and rejects a t.row with that name ('name AdminLlmStatus is used for multiple types')"
  - "Idempotence check looks only at the caller's active jobs (by_player) whose requestJson has smoke: true"
metrics:
  tasks: 2
  files: 10
  tests_added: 30
  suite: "1915 passed (baseline 1884)"
completed: 2026-09-30
---

# Phase 41 Plan 08: Admin Key, Smoke and Status Controls Summary

The admin can set and rotate the Anthropic key (status only outside `llm_config`), fire an idempotent six-route smoke run bounded by the $2 phase ledger, grant pending levels for the live proof, and read key status plus the spend ledger through an admin-only view that never touches the key.

## Exact log prefix for the key script (Plan 41-09)

`set_api_key` logs exactly one info line: **`llm key set, len=<n>`** where `<n>` is the length of the trimmed key. The constant is `LLM_KEY_SET_LOG_PREFIX = 'llm key set, len='` exported from `spacetimedb/src/reducers/llm.ts`. Nothing else derived from the key is logged.

## What was built

### Task 1: reducers (commit 7f25897d)
- `set_api_key`: unchanged admin gate and empty check; stores the trimmed key in `llm_config` row 1, then `patchAdminState` with `keySet: true`, `keyLength`, `keyUpdatedAt: now`, `keyVerifiedAt: undefined`, `keyLastCheckOk: false`, then the log line above. In-flight jobs are untouched (the executor reads the key per claim).
- `llm_smoke_test`: `requireAdmin`; returns with a log line when any active job of the caller has `smoke: true`; refuses without writing when the summed reservation of the six routes would exceed the phase cap; otherwise resets `lastSmokeJson` to `'{}'`, sets `lastSmokeAt` and enqueues one job per `LLM_SMOKE_ROUTES` entry with `budget: 'phase_only'`, `request { smoke: true }`, `SOURCE_KEYS.smokeTest()`, `characterId 0n`. One log line with counts and route names.
- `grant_test_pending_level({ characterId, levels })`: `requireAdmin`, `requireCharacterOwnedBy`, levels must be 1 to 5 (`SenderError` otherwise), adds to `pendingLevels` (missing counts as 0).
- `validate_llm_request` is untouched (model allowlist literal still present once).
- `llm_admin.test.ts` (21 tests): non-admin rejection on all three reducers with nothing written; trimmed key stored; status row values; exact log line and console.info called once; leak scan over every table except `llm_config` and all console output; blank key; rotation clears verification and leaves in-flight job rows byte-identical; six jobs with routes, `'{"smoke":true}'`, `budgetDay ''`, six dispatch rows, ledger reserved equals the sum of reservations, zero player budget rows; second run refused with tables unchanged; run refused while one job stays active; new run after all terminal (12 jobs); non-smoke active job does not block; at-cap and near-cap runs create nothing and do not throw; grant happy path, missing field, 0 and 6 levels, not-owner, unknown character.

### Task 2: admin_llm_status view (commit 9135c6f0)
- `ADMIN_LLM_STATUS_KEYS` (12 keys) and `projectAdminLlmStatus(state, ledger, inFlight)` with the defaults (keySet false, keyValid false, length 0n, `lastSmokeJson '{}'`, totals 0n, cap 2_000_000n).
- View `admin_llm_status` (public): `ADMIN_IDENTITIES.has(ctx.sender.toHexString())` first, else `[]`; then `llm_admin_state.id.find`, `llm_spend.id.find` and a count over `llm_job.by_status.filter('in_flight')`. No scan, no reference to the key table (source-text test builds the table name from fragments).
- 9 new view tests plus wiring assertions: non-admin `[]`, defaults, full row, valid/invalid key states (verified before update, failed check, never verified, unset), exact key set, seeded key never in output (with a positive control that the key is present in the mock db), index-only in-flight count, source check.

### Bindings (commit 41fbbbd6)
`pnpm spacetime:generate` (writes `src/module_bindings`), additions only: `admin_llm_status_table.ts`, `llm_smoke_test_reducer.ts`, `grant_test_pending_level_reducer.ts` and the three index/type files. No client UI is wired to these yet (the admin drives them through the CLI in 41-09/41-10).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Row type name clashed with the view name**
- **Found during:** Task 2 (`spacetime build -p spacetimedb`)
- **Issue:** the build printed `name AdminLlmStatus is used for multiple types` (and still ended with "Build finished successfully", so the error is easy to miss). The SDK derives a type name from the view name `admin_llm_status`, which collided with `t.row('AdminLlmStatus', ...)` named as the plan suggested.
- **Fix:** row named `AdminLlmStatusRow`. The generated table binding is `admin_llm_status_table.ts`; the projection function and keys keep the planned names.
- **Files modified:** spacetimedb/src/views/llm.ts
- **Commit:** 9135c6f0

**2. [Rule 2 - Missing critical functionality] Smoke run is all or nothing**
- **Issue:** the plan truth says a run refused by the phase cap creates no jobs; enqueueing route by route could leave a partial run when the headroom covers only some routes.
- **Fix:** sum the six reservations against the ledger headroom before writing anything (test: headroom for five of six creates nothing).
- **Commit:** 7f25897d

**3. [Process] Tests and implementation were committed together per task** (plan type `execute`), as in Plans 41-01 to 41-07.

## Known Stubs
None.

## Threat Flags
None beyond the plan's model. T-41-01 (only length and timestamps outside `llm_config`; log line has the length only; view never reads the key table; leak tests), T-41-07 (`[]` for non-admin, tested), T-41-06 (`requireAdmin` on all three reducers, ownership on the grant, tested) and T-41-04b (one active smoke run at a time, phase-only reservations, cap refusal test) are mitigated and tested.

## Notes for later plans
- 41-09 (key script) should confirm against `llm key set, len=<n>` in `spacetime logs` and read status from `admin_llm_status` (SQL `select * from admin_llm_status` by an admin identity; the CLI identity is in `ADMIN_IDENTITIES`).
- The smoke run relies on the executor (41-06) recording each route's result via `recordSmokeResult`; the `smoke_test` route success sets `keyLastCheckOk` and `keyVerifiedAt`, which is what turns `keyValid` true.
- No publish was run, nothing touched maincloud, `.env.local` and the key were never read. `spacetime build -p spacetimedb` finishes successfully with no type-name error after the rename (pre-existing "tsc not found" notice remains).

## Self-Check: PASSED
- FOUND: spacetimedb/src/reducers/llm.ts, llm_admin.test.ts, views/llm.ts, views/llm.test.ts, src/module_bindings/admin_llm_status_table.ts, llm_smoke_test_reducer.ts, grant_test_pending_level_reducer.ts
- FOUND commits: 7f25897d, 9135c6f0, 41fbbbd6
- Acceptance greps: `spacetimedb.reducer('llm_smoke_test'` 1, `spacetimedb.reducer('grant_test_pending_level'` 1, `requireAdmin(ctx)` 3, `budget: 'phase_only'` 1, `'gpt-5.4', 'gpt-5-mini'` 1; views/llm.ts `admin_llm_status` present, `.iter(` 0, `llm_config` 0
- Full suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` 1915 passed (baseline 1884)
