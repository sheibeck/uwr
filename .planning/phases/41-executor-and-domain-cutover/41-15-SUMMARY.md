---
phase: 41-executor-and-domain-cutover
plan: 15
subsystem: llm-cutover-final-state-and-live-proof-harness
tags: [spacetimedb, llm, purge, live-proof, spend-guard, dry-run, bindings, tests]
status: complete
requires:
  - phase: 41-09 (scripts/llm/cli.mjs: getCliToken, scrub, TARGETS.local; admin_llm_status view)
  - phase: 41-14 (last domain cut over; prepare reducers deleted)
provides:
  - "purge_llm_tasks admin reducer (idempotent) and a local database with no legacy llm_task rows"
  - "static tests pinning: no llm_task insert in production code, no deleted prepare reducer reference under src/, model-literal allowlist at exactly three Phase 42 sites"
  - "scripts/llm/proof_rules.mjs: PROOF_STEPS, PROOF_SPEND_MARGIN_MICRO_USD, shouldStopForSpend, proofEmail, proofCharacterName, summarizeSmoke, isTerminalJobStatus, plus excerpt and nextProofStep"
  - "scripts/llm/prove-live.live.ts: local-only, spend-guarded live-proof harness (dry mode via PROVE_LIVE_DRY=1) and scripts/llm/vitest.live.config.ts"
  - "Assumption A1 settled locally: the CLI token connects as an admin (admin_llm_status rows: 1)"
affects: [41-16, 41-18]
tech-stack:
  added: []
  patterns:
    - "Live files are named *.live.ts and run only through scripts/llm/vitest.live.config.ts, so no default run picks them up"
    - "Harness steps are a RUNNERS map keyed by PROOF_STEPS; a new step needs a name in proof_rules.mjs and a runner (paidStep, jobIds, settleJob, waitFor helpers are in the same file)"
    - "Every paid step starts with paidStep(step), which calls shouldStopForSpend against the latest admin_llm_status row"
key-files:
  created:
    - scripts/llm/proof_rules.mjs
    - scripts/llm/proof_rules.test.mjs
    - scripts/llm/prove-live.live.ts
    - scripts/llm/vitest.live.config.ts
    - src/module_bindings/purge_llm_tasks_reducer.ts
  modified:
    - spacetimedb/src/reducers/llm.ts
    - spacetimedb/src/reducers/llm_admin.test.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types/reducers.ts
key-decisions:
  - "The harness connects with withDatabaseName('uwr'), because the 2.10 SDK has no withModuleName (see deviation 1)"
  - "Paid mode is simply dry mode unset (as Plan 41-16 states); it additionally requires keySet true, and stops all further steps if the smoke test leaves the key unproven"
  - "The harness is re-runnable: creation steps are skipped when the identity already owns a character, and each creation stage acts only on the state it finds"
  - "Combat travel uses move_character over location_connection rows (at most two hops) and waits on the combat_narration job, since victory and defeat both enqueue the outro"
metrics:
  tasks: 2
  files: 10
  tests_added: "7 server (3 purge, 4 static) and 25 script"
  suite: "server 2028 passed (baseline 2021); root client 2109 passed in 55 files (baseline 2077); pnpm build exits 0; spacetime build finished successfully"
completed: 2026-09-30
---

# Phase 41 Plan 15: Legacy Purge and Live-Proof Harness Summary

The legacy `llm_task` rows are purged through a new admin reducer, the final "nothing left on the old path" state is pinned by tests, and a local-only, spend-guarded live-proof harness is ready; its dry run proved the CLI token connects as an admin (`admin_llm_status rows: 1`).

## What was built

### Task 1: purge_llm_tasks and final static checks (commit d649b7f0)
- `purge_llm_tasks()` in `reducers/llm.ts`: `requireAdmin`, collects every `llm_task` id, deletes by id, logs `llm_task purge: <n> rows`. A second call deletes nothing and does not throw.
- `llm_admin.test.ts` (+3): a non-admin gets `Admin only` and all three seeded rows remain; the admin call leaves zero rows and logs `llm_task purge: 3 rows`; the second call logs `0 rows` without throwing.
- `llm_cutover.test.ts` (+4, all built from fragments so the file does not match its own patterns): no non-test file under `spacetimedb/src` inserts into the legacy task table (plus a check that the pattern catches the spaced forms); no file under `src/` outside `src/module_bindings` names any of the three deleted prepare reducers (camelCase or snake_case); `LEGACY_MODEL_LITERALS` in `model_literals.test.ts` has exactly `reducers/llm.ts`, `schema/tables.ts` and `src/composables/useLlm.ts`.
- Bindings regenerated (`purge_llm_tasks_reducer.ts` added, `index.ts` and `types/reducers.ts` updated).

### Task 2: proof rules, harness, dry run (commit d18c35e6)
- `proof_rules.mjs` (pure) with 25 tests: step order, spend boundary (false at 1_799_999, true at exactly 1_800_000 and one over, reserved counts the same as spent), letters-only 3 to 20 character names (unique over 2000 consecutive values), unique emails, smoke summary parsing (tolerates malformed JSON, arrays, null, non-strings), terminal job statuses. Four static guards read the harness source: no hosted-target string, `withDatabaseName('uwr')`, `TARGETS.local`, `shouldStopForSpend(`, `PROVE_LIVE_DRY`, at most one `console.*` line, no key file or key variable name, and the live config includes only `*.live.ts`.
- `prove-live.live.ts`: refuses anything but the local target (ping check), gets the token in-process, connects through the generated `DbConnection`, subscribes to the views and domain tables, always reads `admin_llm_status` and asserts exactly one row. Dry mode prints the step plan and calls no reducer. Paid mode runs the eight steps with `paidStep` before each; world gen includes the tab-close check (disconnect while GENERATING, wait 20 s, reconnect with the same token, expect COMPLETE, the character off location 0, exactly one new region and one state). Output is scrubbed and capped at 120 characters; the redacted results file `41-live-results.json` holds statuses, counts and timings only (written by paid runs, not the dry run).
- `vitest.live.config.ts`: `include: ['scripts/llm/**/*.live.ts']`, long test timeout, no file parallelism, verbose reporter with `silent: false` so the harness's status lines are shown (added after the first dry run printed nothing).

## Local publish, purge and dry run (no secrets)

Code-only publish, no clear and no `--break-clients` needed:

```
Checking for breaking changes...
Database Migration Plan
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

Purge (`spacetime call --server local uwr purge_llm_tasks` returned with no error) and the module log line:

```
INFO: purge_llm_tasks spacetimedb_module:31531: llm_task purge: 0 rows
```

The local table was already empty, so the purge deleted 0 rows (queried before the call: no rows). After the call:

```
spacetime sql --server local uwr "SELECT * FROM llm_task"
 id | player_id | domain | model | system_prompt | user_prompt | max_tokens | status | context_json | response_format_json | created_at
----+-----------+--------+-------+---------------+-------------+------------+--------+--------------+----------------------+------------
(no rows)
```

The purge call itself also succeeded as the CLI identity, which independently shows it passes `requireAdmin`.

Dry run, `PROVE_LIVE_DRY=1 pnpm exec vitest run --config scripts/llm/vitest.live.config.ts` (exits 0):

```
admin_llm_status rows: 1
status: keySet=false keyValid=false keyLength=0 spent=0 reserved=0 cap=2000000 calls=0 inFlight=0
dry mode: no reducer is called. Step plan: smoke > creation_race > creation_class > world_gen > npc_conversation > combat_narration > renown_perk_gen > skill_gen
spend margin: 200000 micro-USD under the cap
```

**A1 result: settled.** The CLI token authenticates the SDK connection as an admin identity (one status row, not an empty list). No Claude call was made and `set-key.mjs` was not run.

## Verification

- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/reducers/llm_admin.test.ts src/reducers/llm_cutover.test.ts`: 80 passed.
- Server suite `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1`: 50 files, 2028 passed (baseline 2021).
- `pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_rules.test.mjs`: 25 passed.
- Root client suite `CI=true pnpm exec vitest run --maxWorkers=1`: 55 files, 2109 passed (baseline 2077).
- `spacetime build -p spacetimedb` finished successfully (the existing "tsc not found" warning appears); `pnpm build` exits 0.
- Acceptance greps: `spacetimedb.reducer('purge_llm_tasks'` in llm.ts 1; `llm_task` insert files outside tests 0 (pinned by test); `purge_llm_tasks` binding present; `shouldStopForSpend(` in the harness 1; `PROVE_LIVE_DRY` 2; hosted-target string in the harness 0; the config include line 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `withModuleName` does not exist in SDK 2.10**
- **Found during:** Task 2 (the plan, RESEARCH and CLAUDE.md name `withModuleName('uwr')`; `node_modules/spacetimedb` exposes only `withDatabaseName`, which the app's `src/main.ts` also uses)
- **Fix:** the harness uses `.withDatabaseName('uwr')`; the static guard test asserts that form. The plan's key-link pattern `withModuleName\('uwr'\)` therefore does not match; nothing else in the plan's acceptance list depends on it.
- **Files modified:** scripts/llm/prove-live.live.ts, scripts/llm/proof_rules.test.mjs
- **Commit:** d18c35e6

**2. [Rule 3 - Blocking] Live-run output hidden by default**
- **Found during:** Task 2 (the first dry run printed no status lines)
- **Fix:** `silent: false` and the verbose reporter in `vitest.live.config.ts`, so Plan 41-16's run shows step lines.
- **Commit:** d18c35e6

Otherwise executed as written. TDD note: rules and tests were committed together per task, as in the earlier plans.

## Notes for later plans

- **41-16 (live proof):** set the key with `scripts/llm/set-key.mjs`, then run `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts` (no `PROVE_LIVE_DRY`). The local database currently has no character, so creation runs from scratch; a re-run reuses an existing character and skips creation. The harness is not type-checked by `pnpm build` (it lives outside `src/`) and its paid path has not been executed against a live key, only transpiled and loaded by the dry run; expect to fix small slips there on the first real run.
- **Combat step:** it needs an available spawn at the start location or within two connections; otherwise the step records `combat narration: no spawn reachable` (per the plan) and 41-16 reports it. A level-1 fight may end in defeat; both outcomes enqueue the outro narration, which is what the step waits on.
- **Extending (41-18 and 41-16 checks):** NPC lines are read from `npc_dialog` in the `npc_conversation` runner (`excerpt(scrub(...))`, 120 characters). A he/she check on NPC text and the Keeper's "he" belong there (and in a new runner if needed): read the NPC rows and dialog rows, record only booleans and short excerpts in the step `note`. The `notes` array in the results file is available for extra findings.
- The world-gen step proves the PIPE-02 tab-close behaviour only with a real key; the dry run cannot.
- The legacy `llm_task` table and `submit_llm_result` remain until Phase 42 (T-41-13, transferred).

## Known Stubs

None.

## Threat Flags

None. T-41-14 mitigated (local target only, no hosted-target string, tested); T-41-04b mitigated (ledger check before each paid step with the $0.20 margin, boundary tested, dry mode spends nothing); T-41-22 mitigated (token in memory, scrubbed and capped output, results file holds statuses and timings only); T-41-13 transferred (no server code creates task rows and existing rows are purged).

## Self-Check: PASSED
- FOUND: spacetimedb/src/reducers/llm.ts (purge_llm_tasks), scripts/llm/proof_rules.mjs, scripts/llm/proof_rules.test.mjs, scripts/llm/prove-live.live.ts, scripts/llm/vitest.live.config.ts, src/module_bindings/purge_llm_tasks_reducer.ts
- FOUND commits: d649b7f0, d18c35e6
