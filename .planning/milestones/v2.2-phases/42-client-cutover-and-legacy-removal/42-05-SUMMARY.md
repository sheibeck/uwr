---
phase: 42-client-cutover-and-legacy-removal
plan: 05
subsystem: local-publish-1
tags: [spacetimedb, publish, bindings, purge, legacy-llm, security]
status: complete
one_liner: "Publish 1 ran on the local server with --break-clients only (no clear, key intact at length 108), the old result-submitting and validation reducers are gone (CLI proves 'No such reducer'), bindings regenerated and pinned by a test, the bundle guard prints 'bundle clean', and purge_legacy_llm left the four legacy tables at COUNT 0 (tick row removed) so publish 2 can drop them"
requires:
  - phase: 42-03 (server side: reducers removed, purge_legacy_llm added)
  - phase: 42-04 (client cutover to my_llm_jobs, proxy removed)
provides:
  - "Local module running publish-1 code; legacy tables still defined but empty"
  - "Regenerated src/module_bindings (3 reducer files deleted, purge_legacy_llm_reducer.ts added)"
  - "src/legacyLlmRemoval.test.ts: describe 'generated bindings after publish 1' (4 tests)"
  - "Publish-1 commit SHA for the maincloud checklist (Plan 42-07): 5968d54f58fd5792772d52fd5a30369a8055c646"
affects: [42-06 (drop the four legacy tables, publish 2), 42-07 (maincloud checklist; flips the purge binding)]
tech-stack:
  added: []
  patterns:
    - "Publish with stdin closed and --break-clients only; purge through the CLI admin identity before dropping tables"
key-files:
  created:
    - src/module_bindings/purge_legacy_llm_reducer.ts
  modified:
    - src/module_bindings/index.ts
    - src/module_bindings/types/reducers.ts
    - src/legacyLlmRemoval.test.ts
  deleted:
    - src/module_bindings/submit_llm_result_reducer.ts
    - src/module_bindings/validate_llm_request_reducer.ts
    - src/module_bindings/purge_llm_tasks_reducer.ts (git shows it as a rename to purge_legacy_llm_reducer.ts)
key-decisions:
  - "Publish 1 needed no extra flag and no data deletion; the migration plan was empty, so nothing was dropped or removed"
  - "The server was left running for Plans 42-06 and 42-07"
metrics:
  tasks: 2
  commits: 1 (Task 2 changed no tracked file)
  tests: "root run 62 files / 2395 tests green (baseline 2391 + 4 new), single worker"
completed: 2026-09-30
---

# Phase 42 Plan 05: Local publish 1 Summary

Publish 1 is live on the local server, nothing was cleared, the key is still set, and the four legacy LLM tables are empty but still defined.

No command in this plan targeted maincloud. Every spacetime command named `--server local`, and the only flag passed to a publish was `--break-clients` (first publish) or none (the re-run). No `-y` on any publish, no `--delete-data`, no `--clear-database`. (`-y` was used only on `pnpm spacetime:generate`, which deletes stale generated binding files, never data.) No push was made, and `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.

## Task 1: server start, publish 1, bindings (commit 5968d54f)

- RED: added describe "generated bindings after publish 1" (4 tests) to `src/legacyLlmRemoval.test.ts`; against the old bindings 4 failed.
- Port check: `netstat` showed nothing on :3000. Started `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` as background task `b0fqqbk8m`. Ping returned 200. Listener PID 13620.
- Pre-publish counts (local): llm_task 0, llm_request 0, llm_budget 0, llm_cleanup_tick 1, llm_job 0, player 1, character 0. `admin_llm_status`: key_set true, key_length 108. (The legacy tables were already empty of task rows; only the cleanup tick row existed.)
- Publish 1 command (from repo root): `spacetime publish uwr --server local --break-clients < /dev/null`. Exit 0. Output lines:
  - `Using configuration from C:\projects\uwr\spacetime.json`
  - `Using configuration from C:\projects\uwr\spacetime.local.json`
  - `Publishing module C:\projects\uwr\spacetimedb to database 'uwr'`
  - `tsc not found in node_modules. ...` (existing warning; `Build finished successfully.`)
  - `Uploading to local => http://127.0.0.1:3000`
  - `Checking for breaking changes...`
  - `Database Migration Plan` (empty: no table removed, nothing to confirm)
  - `Publishing module...`
  - `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`
- Health: `spacetime logs --server local uwr | grep -iE "database updated|panic|error"` shows `INFO: Database updated` lines (latest at 23:18:04Z) and no panic or error.
- Stale-client proof (both fail, no data change):
  - `spacetime call --server local uwr submit_llm_result 1 '"x"' true` -> `Error: No such reducer OR procedure `submit_llm_result` for database `uwr` resolving to identity `c200f202...c14a`.`
  - `spacetime call --server local uwr validate_llm_request 1 '"world_gen"' '"m"' '"p"'` -> `Error: No such reducer OR procedure `validate_llm_request` for database `uwr` resolving to identity `c200f202...c14a`.`
  - llm_job count after both: 0 (unchanged).
- `pnpm spacetime:generate -y` deleted `purge_llm_tasks_reducer.ts`, `submit_llm_result_reducer.ts`, `validate_llm_request_reducer.ts`, added `purge_legacy_llm_reducer.ts`, modified `index.ts` and `types/reducers.ts`. `llm_task_table.ts` is still present (table still defined).
- GREEN: `pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts` 19/19; `pnpm build` passes. Acceptance greps: `ls src/module_bindings | grep -cE "submit_llm_result|validate_llm_request|purge_llm_tasks"` = 0; `purge_legacy_llm_reducer.ts` exists; reducer files containing resultText/result_text = 0.
- Commit `chore(42-05): regenerate bindings after publish 1`. **Publish-1 commit SHA: 5968d54f58fd5792772d52fd5a30369a8055c646** (the maincloud checklist in Plan 42-07 publishes from it).

## Task 2: intermediate state, purge, idempotency (no tracked file changed)

- Gates: `CI=true pnpm exec vitest run --maxWorkers=1` 62 files / 2395 tests passed; `spacetime build -p spacetimedb` exit 0; `pnpm build` then `node scripts/check-bundle.mjs` printed `bundle clean: 4 files scanned` (exit 0). No `--explain` needed; no bundle text was viewed.
- Legacy table still queryable: `SELECT COUNT(*) AS n FROM llm_task` -> 0.
- Purge: `spacetime call --server local uwr purge_legacy_llm` (CLI admin identity), exit 0. Single counts-only module log line:
  `legacy llm purge: llm_task=0 llm_request=0 llm_budget=0 llm_cleanup_tick=1`
- Counts after purge: llm_task 0, llm_request 0, llm_budget 0, llm_cleanup_tick 0 (the tick did not come back, so nothing re-arms it). player 1, character 0 (unchanged); no panic in the recent log.
- Idempotency (publish-1 half): re-ran `spacetime publish uwr --server local < /dev/null` (no flag). It did not stop at any prompt. Output: same lines as above, empty `Database Migration Plan`, `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`, exit 0. Afterwards the four legacy counts are still 0, player 1 and character 0 unchanged, key status unchanged. A second `pnpm spacetime:generate -y` produced no diff (`git status --porcelain src/module_bindings` empty).
- Key: `SELECT key_set, key_length FROM admin_llm_status` -> `true | 108` after publish 1, after the purge and after the re-publish (set, not proven; live proof stays deferred).

## Server state at the end

The local SpacetimeDB server was left running when the plan finished (background task `b0fqqbk8m`, listener PID 13620 on 127.0.0.1:3000), but the background task later exited with code 1 after the agent session ended (ping now returns no response, nothing listening on :3000). This is the expected parent-shell behavior. All data stays on disk; Plans 42-06 and 42-07 must restart it with `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` (run-local skill) before publishing.

## Deviations from Plan

None - plan executed as written. Observations (not deviations):
- The plan's "pre-publish counts" for llm_task, llm_request and llm_budget were already 0 locally, so the purge only removed the one llm_cleanup_tick row (log line shows the counts observed before deleting).
- `spacetime publish` and `spacetime build` print a harmless `tsc not found in node_modules` warning (pre-existing; build finishes successfully).

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust-boundary surface; the change removes client-callable reducers.

## Self-Check: PASSED

- Files: src/module_bindings/purge_legacy_llm_reducer.ts FOUND; src/legacyLlmRemoval.test.ts FOUND; removed binding files absent.
- Commit 5968d54f FOUND in git log.
