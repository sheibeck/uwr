---
phase: 42-client-cutover-and-legacy-removal
plan: 06
subsystem: llm-legacy-removal-publish-2-code
tags: [spacetimedb, llm, schema-removal, absence-tests, security]
status: complete
one_liner: "Publish-2 code: the four legacy LLM tables, the drained sweep reducer and the purge reducer are deleted; the public llm_* set is [] with exactly 8 private tables left; the model-literal allowlist is empty; absence is proven at schema level (recorder, __defs, scheduledReducers, strict-mock initScheduledTables, string scan) and the vacuous task-row assertions are gone"
requires:
  - phase: 42-03 (purge_legacy_llm and the empty sweep drain existed only for publish 1)
  - phase: 42-05 (publish 1 ran locally; the four legacy tables are empty)
provides:
  - "Module code with no llm_task, llm_request, llm_budget or llm_cleanup_tick, no sweep_llm_errors and no purge_legacy_llm (publish 2 itself is Plan 42-07)"
  - "llm_absence.test.ts: publish-2 guards (reducers, recorder, strictTableSpec, schema __defs, scheduledReducers, scheduled_tables exports, strict initScheduledTables, production string and accessor scan)"
  - "llm_privacy.test.ts: public llm_* set equals []; llm_* set is exactly the 8 private tables"
affects: [42-07 (publish 2, bindings regeneration, maincloud checklist)]
tech-stack:
  added: []
  patterns:
    - "Absence is asserted on the recorded schema, not on mock rows: the mock db returns [] for an unknown table, so row-count checks pass vacuously"
    - "Production-source scan includes comment lines, so removed things are described by concept and no exception list exists"
key-files:
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/schema/scheduled_tables.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/llm.ts
    - spacetimedb/src/reducers/llm_admin.test.ts
    - spacetimedb/src/schema/llm_absence.test.ts
    - spacetimedb/src/schema/llm_privacy.test.ts
    - spacetimedb/src/helpers/schema_recorder.test.ts
    - spacetimedb/src/data/model_literals.test.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts
    - spacetimedb/src/helpers/combat_narration.test.ts
    - spacetimedb/src/helpers/creation_generation.test.ts
    - spacetimedb/src/helpers/renown_llm.test.ts
    - spacetimedb/src/helpers/skill_offer.test.ts
    - spacetimedb/src/helpers/world_gen.test.ts
key-decisions:
  - "The strict-mock initScheduledTables check RAN (createMockCtx strict: true); no lenient fallback was needed"
  - "The privacy test pins the exact list of 8 llm_* table names (sorted) plus a length of 8, rather than only a count"
  - "Non-vacuity for scheduledReducers uses combat_loop (the live sweep registers through the executor helper, not through that dictionary)"
metrics:
  tasks: 3
  commits: 3
  tests: "root run 62 files / 2393 tests green, single worker (baseline 2395; net -2 from the deleted purge describe and the flipped cases)"
completed: 2026-09-30
---

# Phase 42 Plan 06: Publish-2 code Summary

The module no longer defines any legacy LLM table, the drained sweep or the purge, and tests that would fail if any of them came back replace the assertions that could only pass vacuously. Nothing was published: no `spacetime publish`, `call` or `generate` ran, the local server was not touched, and `src/module_bindings` is unchanged (Plan 42-07 regenerates it).

## What was done

**Task 1 (3caba239): tick table, drained sweep, purge.** Deleted the cleanup tick table with its `schema({...})` entry, its re-export in `scheduled_tables.ts` and its import in `index.ts`; deleted the drained sweep registration in `index.ts` and the purge reducer block in `reducers/llm.ts`; deleted the purge describe in `llm_admin.test.ts`. `llm_absence.test.ts` now asserts: the purge and the sweep are not captured (with `set_api_key` and `request_skill_offer` as non-vacuity), `recordedTable` and `strictTableSpec` for the tick are undefined and `__defs` has no such key (`recordedTables().length > 10`), `scheduledReducers` has no sweep entry (and still has `combat_loop`), `scheduled_tables` exports nothing matching "cleanup", `initScheduledTables` on a strict mock ctx does not throw and arms exactly one `llm_sweep_tick`, and the client-connected handler leaves a sweep tick.

**Strict-mock initScheduledTables check: it ran.** `createMockCtx({ strict: true })` executed `initScheduledTables` without error, so a touch of any dropped table would throw; no lenient fallback was used.

**Task 2 (ec415e6d): task, request, budget tables and test flips.** Deleted the three table definitions and their `schema({...})` entries (the request table held the last model-literal comment). Reworded the `LlmPlayerBudget` comment to describe the table itself. Tests: `llm_absence.test.ts` checks the four names are absent from the recorder, `strictTableSpec`, `__defs` and the `tables.ts` source, plus a scan of every production non-test `.ts` under `spacetimedb/src` (comment lines included) for a db accessor or a quoted (single, double, backtick) legacy name, with a `db.llm_job` non-vacuity count. `llm_privacy.test.ts`: public llm_* set is `[]`, the llm_* set is exactly the 8 names (`llm_admin_state`, `llm_call_log`, `llm_config`, `llm_dispatch`, `llm_job`, `llm_player_budget`, `llm_spend`, `llm_sweep_tick`) and all are private, `__defs` has no `llm_task`. `schema_recorder.test.ts` self-tests moved to `llm_job` (exact by_player, by_dedupe_key, by_status btree indexes; id primaryKey and autoInc; resultText optional; requestJson required; playerId identity; three made-up columns flagged; a complete row returns []; a missing required column reported while omitted optional and autoInc ones are tolerated). `model_literals.test.ts` has an empty `LEGACY_MODEL_LITERALS` (opening and closing brace on their own lines), a header note that it reached zero in Phase 42, and `SCAN_ROOTS = ['spacetimedb/src', 'src']`; the `llm_cutover.test.ts` pin is retitled "the model-literal allowlist is empty" and expects `[]`. The string scan flagged no production comment, so no rewording beyond the budget comment was needed.

**Task 3 (82eaf8b6): vacuous task-row assertions.** Removed the ten `rows(ctx, 'llm_task')` length-0 assertions in the six test files (research Pitfall 6). Kept the static source guards (`not.toMatch(/llm_task/)`) in `combat_narration.test.ts` and `llm_cutover.test.ts` and the `utcDay` import. Reworded two `llm_cutover.test.ts` comments by concept.

## Verification

- `CI=true pnpm exec vitest run --maxWorkers=1` (root, includes the server suite): 62 files, 2393 tests passed.
- `spacetime build -p spacetimedb`: Build finished successfully (pre-existing "tsc not found" note).
- `pnpm build`: succeeds against the publish-1 bindings (chunk-size warning only, pre-existing).
- Acceptance greps: no `name: 'llm_(task|request|budget|cleanup_tick)'` in `tables.ts`; no allowlist entries and no `llm-proxy/src` in `model_literals.test.ts`; `git grep` for a db accessor or quoted legacy name in production code prints nothing; `git grep "rows(ctx, 'llm_task')"` prints nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Escaping slip in a scripted test edit**
- **Found during:** Task 2 RED run
- **Issue:** My scripted insert turned a `/\\/g` regex into `/\/g`, so `llm_absence.test.ts` failed to transform (unterminated string).
- **Fix:** Corrected the regex; the suite then ran and passed for the right reasons.
- **Commit:** folded into ec415e6d (no bad version committed)

**2. [Process note] Task 1 privacy guard was interim**
- Between Task 1 and Task 2 the privacy test's llm_* count guard was set to 11 (the tick was gone, three legacy tables remained); Task 2 replaced it with the exact 8-name list. This was needed so Task 1's verify command stayed green.

The plan's strict RED-then-GREEN ordering was followed per task at the test level (Task 2's RED run showed the privacy and allowlist cases failing before the tables were deleted); Task 1's RED was observed only partially because the tests and deletions were applied in one pass.

## Known Stubs

None.

## Threat model

- T-42-26 (leftover data-deleting reducer): purge deleted with the tables; absence test asserts it is not captured and the source scan finds no legacy name.
- T-42-27 (vacuous absence tests): schema-level checks (recordedTable, strictTableSpec, `__defs`, scheduledReducers, strict-mock run) with non-vacuity guards; the vacuous row assertions are removed.
- T-42-28 (drop with rows present): handled in Plan 42-07 (counts re-checked at 0 before publish 2). Publish 1 left all four tables at COUNT 0.
- T-42-SC: no packages installed.

## Threat Flags

None. The change only removes schema and reducers.

## Notes for Plan 42-07

- Publish 2 will drop four tables, one scheduled reducer and the purge reducer; re-check the four legacy counts are 0 immediately before publishing, and stop on a refusal.
- `src/module_bindings` still contains the legacy table bindings and `purge_legacy_llm_reducer.ts` until Plan 42-07 regenerates it; `src/legacyLlmRemoval.test.ts` (from 42-05) has a binding pin that Plan 42-07 flips.
- `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were left untouched and unstaged. The local server was left running, untouched.

## Self-Check: PASSED

- Commits found in git log: 3caba239, ec415e6d, 82eaf8b6.
- Files exist: `spacetimedb/src/schema/llm_absence.test.ts`, `spacetimedb/src/schema/tables.ts`.
