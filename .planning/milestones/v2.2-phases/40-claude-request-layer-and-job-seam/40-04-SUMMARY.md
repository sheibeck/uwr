---
phase: 40-claude-request-layer-and-job-seam
plan: 04
subsystem: llm
tags: [spacetimedb, private-tables, dedupe, job-queue, llm_job, llm_call_log, vitest]
requires:
  - phase: 40-01
    provides: schema_recorder (rowColumnProblems, recordedTables) and mock indexes by_dedupe_key, by_status, by_job
  - phase: 40-02
    provides: isLlmRoute, LlmRoute, CLAUDE_MODEL
provides:
  - LlmJob and LlmCallLog private tables (llm_job, llm_call_log) registered in schema({...})
  - generic every-llm_*-table-except-llm_task-is-private test
  - enqueueLlmJob with in-transaction dedupe, SOURCE_KEYS, buildDedupeKey, serializeRequest
  - resolveCharacterPlayerId and redacted, capped logLlmCall
affects: [40-05, 40-06, 40-07, 40-08, 40-09, 41, 42]
tech-stack:
  added: []
  patterns:
    - "Dedupe key is a JSON array [playerHex, route, sourceKey]; single-column btree by_dedupe_key lookup inside the reducer transaction"
    - "Active statuses (pending, in_flight, received) block duplicates; terminal statuses (completed, failed, expired) do not"
    - "Optional columns omitted from inserted rows, never set to undefined"
key-files:
  created:
    - spacetimedb/src/schema/llm_privacy.test.ts
    - spacetimedb/src/helpers/llm_queue.ts
    - spacetimedb/src/helpers/llm_queue.test.ts
  modified:
    - spacetimedb/src/schema/tables.ts
key-decisions:
  - "Public llm_* set is exactly ['llm_task'] until Phase 42 tightens it to []"
  - "logLlmCall converts number counters with round and clamp at 0 (toU64) so a fractional latency cannot make BigInt throw"
  - "Error text is redacted first, then truncated by code points, so truncation cannot split a [REDACTED] marker or a surrogate pair"
requirements-completed: []
duration: 12min
completed: 2026-09-29
status: complete
---

# Phase 40 Plan 04: Private Job Storage and Dedupe-Aware Enqueue Summary

Two private tables (`llm_job`, `llm_call_log`) proven private by a generic llm_* rule, plus `enqueueLlmJob`, which yields exactly one job per identity, route and source key while any earlier job for that key is active, and which writes only real columns.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Private llm_job and llm_call_log tables with the privacy test | 1d15e512 | schema/tables.ts, schema/llm_privacy.test.ts |
| 2 | enqueueLlmJob with dedupe, source keys, call log and identity resolution | 2a91236d | helpers/llm_queue.ts, helpers/llm_queue.test.ts |

## What was built

- `llm_job`: requester `playerId` identity, `route`, `dedupeKey`, `status`, `attempt`, `requestJson`, optional `resultText`/`stopReason`/`errorCode`/`requestId`, four u64 usage counters, `createdAt`, optional `startedAt`/`finishedAt`. Indexes `by_player`, `by_dedupe_key`, `by_status`, all single-column btree in OPTIONS. No prompt, header or key column (test asserts no column name matches prompt, header or apikey).
- `llm_call_log`: one row per HTTP attempt; indexes `by_job`, `by_player`; `errorMessage` redacted and capped at 400 code points.
- Neither table has a `public` flag. Test: the public llm_* set is exactly `['llm_task']`.
- `helpers/llm_queue.ts` imports only `../data/llm_routes`, `../data/llm_models`, `./measurement`; no `spacetimedb/server`, no Date.now or Math.random.

## Verification

- `pnpm --dir spacetimedb exec vitest run src/schema/llm_privacy.test.ts src/helpers/llm_queue.test.ts`: 45 passed (13 privacy, 32 queue)
- `pnpm --dir spacetimedb test`: 971 passed across 27 files (baseline 926)
- `spacetime build -p spacetimedb`: "Build finished successfully" (also prints a harmless "tsc not found in node_modules" notice, as before)
- `npx tsc --noEmit -p spacetimedb`: no diagnostics in `schema/tables`, `schema/llm_privacy`, `helpers/llm_queue`
- `git diff` of `schema/tables.ts` is additions only; nothing published

## Deviations from Plan

None on scope. Process note: as in 40-01 and 40-02, each TDD task was committed once (tests and implementation together) rather than as separate RED/GREEN commits; tests were run green before each commit.

Small additions inside the plan's intent: `enqueueLlmJob` also rejects a null or non-object `request`; `logLlmCall` clamps and rounds number counters (see key-decisions).

## Notes for Phase 41

The live creation, world_gen, skill_gen, npc and combat call sites still use their legacy pending checks on `llm_task` until each domain moves onto `enqueueLlmJob`. `SOURCE_KEYS.npcConversation` takes a caller-supplied turn marker (Phase 41 passes the npc_memory lastUpdated micros, 0 with no memory). A per-player in-flight cap is transferred to Phase 41 (T-40-05).

## Known Stubs

None.

## Threat Flags

None. T-40-02 mitigated (no public flag, generic privacy test, no prompt/header/key columns; bindings check remains in Plan 40-09). T-40-03 mitigated (redaction plus 400 code-point cap, tested with a fragment-built key-shaped string). T-40-05 mitigated (in-transaction dedupe, 64,000-character boundary test). T-40-11 mitigated (`rowColumnProblems` on every enqueue and call-log row).

## Self-Check: PASSED

- FOUND: spacetimedb/src/schema/tables.ts, schema/llm_privacy.test.ts, helpers/llm_queue.ts, helpers/llm_queue.test.ts
- FOUND commits: 1d15e512, 2a91236d
