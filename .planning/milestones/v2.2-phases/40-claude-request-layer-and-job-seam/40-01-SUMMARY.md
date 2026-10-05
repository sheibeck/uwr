---
phase: 40-claude-request-layer-and-job-seam
plan: 01
subsystem: testing
tags: [vitest, spacetimedb, test-utils, mock, procedure-ctx, schema-recorder]
requires: []
provides:
  - createMockProcCtx and makeSyncResponse (offline ProcedureCtx stand-in)
  - by_dedupe_key, by_status, by_job mock index mappings
  - schema_recorder (recording mock of spacetimedb/server, column validator, reducer/view/procedure capture, snapshotDb)
affects: [40-02, 40-03, 40-04, 40-05, 40-06, 40-07, 40-08, 40-09, 40-10]
tech-stack:
  added: []
  patterns:
    - "vi.mock('spacetimedb/server', async () => (await import('./schema_recorder')).createRecordingServerMock())"
    - "Proxy-based chainable column builder recording optional/primaryKey/autoInc/unique flags"
key-files:
  created:
    - spacetimedb/src/helpers/schema_recorder.ts
    - spacetimedb/src/helpers/schema_recorder.test.ts
  modified:
    - spacetimedb/src/helpers/test-utils.ts
    - spacetimedb/src/helpers/test-utils.test.ts
key-decisions:
  - "Recorded table cols are normalized to plain ColumnInfo objects ({kind, optional, primaryKey, autoInc, unique}) rather than raw builders"
  - "createMockProcCtx mirrors sender, identity, databaseIdentity, connectionId, timestamp, http, withTx; random, as and newUuid* are not mirrored (no runtime)"
  - "withTx snapshots use shallow row copies and restore in place, so in-place row mutation is also rolled back"
  - "Extra export capturedProcedure(name) added alongside the planned exports"
requirements-completed: []
duration: 15min
completed: 2026-09-29
status: complete
---

# Phase 40 Plan 01: Offline Test Seam Summary

Offline ProcedureCtx mock (scripted FIFO fetch, sync-only re-invocable withTx, module-identity sender, no ctx.db) plus a test-only recording mock of `spacetimedb/server` that loads the real `schema/tables.ts` and `index.ts` in plain Node vitest, validates inserted row columns, and captures reducer handlers.

## Outcome

`index.ts` loaded under the recorder on the first attempt with NO production edit and NO mock extension beyond the planned surface (`schema`, `table`, `t`, `SenderError`). `capturedReducer('submit_llm_result')` and `capturedReducer('prepare_creation_llm')` are both callable functions, and the `my_bank_slots` view is captured. Plan 40-05 (characterization of `submit_llm_result`) can depend on this.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | createMockProcCtx and the new mock index mappings | 5406bfbf | helpers/test-utils.ts, helpers/test-utils.test.ts |
| 2 | Test-only schema recorder, column validator, reducer capture | 939100a6 | helpers/schema_recorder.ts, helpers/schema_recorder.test.ts |

## Verification

- `pnpm --dir spacetimedb exec vitest run src/helpers/test-utils.test.ts`: 36 passed (existing tests unchanged, new tests added)
- `pnpm --dir spacetimedb exec vitest run src/helpers/schema_recorder.test.ts`: 9 passed
- `pnpm --dir spacetimedb test`: 709 passed (baseline 683 plus 26 new)
- `npx tsc --noEmit -p spacetimedb`: no diagnostics in `helpers/test-utils` or `helpers/schema_recorder`
- No non-test module imports `schema_recorder`; no production file changed
- `rowColumnProblems('llm_task', legacyRenownRow)` returns exactly `unknown column completedAt`, `unknown column resultText`, `unknown column errorMessage` (PIPE-08 bug class proven catchable)

## Deviations from Plan

None on scope. Process note: the TDD tasks were committed as a single commit each (tests and implementation written together) instead of separate RED/GREEN commits, since both files are test-support code with no production behavior; tests were run green before each commit.

## Known Stubs

None.

## Threat Flags

None. T-40-11 mitigated by `rowColumnProblems`; T-40-13 mitigated (grep confirms no production import of `schema_recorder`).

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/schema_recorder.ts, schema_recorder.test.ts, test-utils.ts, test-utils.test.ts
- FOUND commits: 5406bfbf, 939100a6
