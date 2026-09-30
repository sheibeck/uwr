---
phase: 42-client-cutover-and-legacy-removal
plan: 07
subsystem: local-publish-2
tags: [spacetimedb, publish, bindings, legacy-llm, security, checklist]
status: complete
one_liner: "Publish 2 ran on the local server with --break-clients only and stdin closed (no clear, key intact at length 108) and dropped llm_budget, llm_cleanup_tick, llm_request and llm_task; bindings regenerated and pinned by a flipped test, the re-publish and second regeneration are no-ops, every gate and the bundle guard are green, the server is stopped, and the user holds the maincloud/Cloudflare/OpenAI checklist plus an llm_job retention todo"
requires:
  - phase: 42-06 (publish-2 code: legacy tables, sweep and purge deleted from the module)
  - phase: 42-05 (publish 1, purge to COUNT 0, publish-1 SHA)
provides:
  - "Local module without the four legacy LLM tables; llm_job and the rest of the llm_* set intact"
  - "Final src/module_bindings (llm_task_table.ts and purge_legacy_llm_reducer.ts deleted)"
  - "src/legacyLlmRemoval.test.ts: describe 'generated bindings after publish 2' (4 tests, replaces the publish-1 describe)"
  - "42-USER-CHECKLIST.md (Cloudflare, OpenAI, env vars, local folder, maincloud two-publish with the real publish-1 SHA)"
  - "Pending todo 2026-09-30-llm-job-retention-and-pruning.md"
affects: [phase 42 verification, phase 43 (llm_call_log stays), maincloud migration (user only)]
tech-stack:
  added: []
  patterns:
    - "Drop tables only after a counts-only purge leaves them at COUNT 0; publish with --break-clients and stdin closed, never a clear"
key-files:
  created:
    - .planning/phases/42-client-cutover-and-legacy-removal/42-USER-CHECKLIST.md
    - .planning/todos/pending/2026-09-30-llm-job-retention-and-pruning.md
  modified:
    - src/legacyLlmRemoval.test.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts
  deleted:
    - src/module_bindings/llm_task_table.ts
    - src/module_bindings/purge_legacy_llm_reducer.ts
key-decisions:
  - "Publish 2 needed no flag beyond --break-clients; SpacetimeDB printed 'Skipping confirmation due to --yes' on its own (closed stdin plus --break-clients), and no data-deletion flag was ever passed"
  - "The local server was stopped by PID (13620, spacetimedb-standalone.exe, started by Plan 42-05); it was not a background task of this session"
metrics:
  tasks: 3
  commits: 2 task commits (Task 2 changed no tracked file)
  tests: "root run 62 files / 2393 tests green (baseline unchanged: the flipped describe kept 4 tests)"
completed: 2026-09-30
---

# Phase 42 Plan 07: Local publish 2, user checklist, retention todo Summary

Publish 2 dropped the four legacy LLM tables on the local server without any clear, the user's Anthropic key survived (`key_set` true, `key_length` 108), and the final bindings, suite, module build, client build and bundle guard are all green.

No command in this plan targeted maincloud, Cloudflare or OpenAI. Every spacetime command named `--server local`. The only flag on either publish was `--break-clients` (publish 2) or none (the re-run). No `-y` / `--yes` / `--delete-data` / `-c` / `--clear-database` was passed to any publish. (`-y` was used only on `pnpm spacetime:generate`, which deletes stale generated binding files, never data.) Nothing was pushed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged. No `llm_config` query, no key or env file read, no spending reducer called.

## Task 1: pre-flight, publish 2, bindings (commit e292ce92)

- RED: replaced the publish-1 describe with "generated bindings after publish 2" (no file matching llm_task, llm_request, llm_budget, llm_cleanup_tick, submit_llm_result, validate_llm_request, purge_llm_tasks, purge_legacy_llm or sweep_llm_errors; index.ts names none of llmTask, llm_task, purgeLegacyLlm, purge_legacy_llm, submitLlmResult, validateLlmRequest; `my_llm_jobs_table.ts` and `admin_llm_status_table.ts` exist; no `*_reducer.ts` carries resultText). Against the publish-1 bindings: 2 failed, 17 passed.
- Server: ping returned 200; listener PID 13620 (Plan 42-05's server, still running). No second server started.
- Pre-flight (local, `spacetime sql --server local uwr "SELECT COUNT(*) AS n FROM <t>"`): **llm_task 0, llm_request 0, llm_budget 0, llm_cleanup_tick 0** (llm_job 0). `SELECT key_set, key_length FROM admin_llm_status` -> `true | 108`. No purge re-run was needed.
- Publish 2 command (repo root): `spacetime publish uwr --server local --break-clients < /dev/null`. Exit 0. **No flag other than --break-clients was used.** Output lines:
  - `Using configuration from C:\projects\uwr\spacetime.json`
  - `Using configuration from C:\projects\uwr\spacetime.local.json`
  - `Publishing module C:\projects\uwr\spacetimedb to database 'uwr'`
  - `tsc not found in node_modules. ...` then `Build finished successfully.` (pre-existing warning)
  - `Uploading to local => http://127.0.0.1:3000`
  - `Checking for breaking changes...`
  - `Database Migration Plan`
  - `Removed table: llm_budget`
  - `Removed table: llm_cleanup_tick`
  - `Removed table: llm_request`
  - `Removed table: llm_task`
  - `!!! Warning: All clients will be disconnected due to breaking schema changes`
  - `Skipping confirmation due to --yes` (printed by the CLI itself; it is what `--break-clients` with closed stdin does here. It confirms only the client disconnect. The four removed tables were empty, so there was no data to delete, and the CLI never offered or needed a data-deletion option.)
  - `Publishing module...`
  - `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`
- Health: `spacetime logs --server local uwr | tail -n 60 | grep -iE "database updated|panic|error"` shows `INFO: Database updated` (latest 2026-09-30T23:29:29Z) and no panic or error line. Key status right after: `true | 108`.
- `pnpm spacetime:generate -y` deleted `llm_task_table.ts` and `purge_legacy_llm_reducer.ts` and modified `index.ts`, `types.ts` and `types/reducers.ts`.
- GREEN: `CI=true pnpm exec vitest run --maxWorkers=1 src/legacyLlmRemoval.test.ts` 19/19; `pnpm build` passes. Acceptance: `ls src/module_bindings | grep -cE "llm_task|llm_request|llm_budget|llm_cleanup_tick|submit_llm_result|validate_llm_request|purge_|sweep_llm_errors"` prints 0; `my_llm_jobs_table.ts` exists.
- Commit e292ce92 `chore(42-07): regenerate bindings after publish 2` (explicit paths only; its only deletions are the two intended binding files).

## Task 2: final state, idempotency, gates, server stop (no tracked file changed)

- **Describe:** `spacetime describe --json --server local uwr` (JSON is the only form this CLI offers). Name occurrence counts: llm_task 0, llm_request 0, llm_budget 0, llm_cleanup_tick 0, llm_job 3 (table, private-table entry and view-source references; at least 1, so the check is not vacuous). Also present: llm_call_log, llm_config, llm_admin_state, llm_spend, llm_player_budget, llm_dispatch, llm_sweep_tick, admin_llm_status, my_llm_jobs. (Only names were counted; no table contents were read.)
- **Key:** `SELECT key_set, key_length FROM admin_llm_status` -> `true | 108` (after publish 2, after the re-publish, never changed).
- **Game runs:** `SELECT COUNT(*) FROM player` -> 1, `character` -> 0 (same as before publish 2); zero `panic` lines in the last 60 log lines.
- **Idempotency (publish-2 half):** re-ran `spacetime publish uwr --server local < /dev/null` with no flag. It did not stop at any prompt. Output: same header lines, an empty `Database Migration Plan` (no Removed/Added lines), `Publishing module...`, `Updated database with name: uwr, identity: c200f202...c14a`, exit 0. Afterwards key `true | 108`, player 1, character 0 (unchanged). A second `pnpm spacetime:generate -y` printed only "Generate finished successfully" and `git status --porcelain src/module_bindings` printed nothing.
- **Gates:** `CI=true pnpm exec vitest run --maxWorkers=1` -> 62 files / 2393 tests passed (baseline 62 / 2393). `spacetime build -p spacetimedb` exit 0. `pnpm build` exit 0. `node scripts/check-bundle.mjs` -> `bundle clean: 4 files scanned`, exit 0. `node scripts/check-bundle.mjs --explain` -> `bundle clean: 4 files scanned`, exit 0, no hit listed. No bundle text was displayed.
- **Criterion 3 tests:** `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_executor.test.ts src/helpers/llm_sweeper.test.ts src/helpers/llm_apply.characterization.test.ts` -> 254 passed. `CI=true pnpm exec vitest run --maxWorkers=1 src/composables/useLlmStatus.test.ts` -> 27 passed.
- **Hygiene:** `git status --porcelain -- .claude/settings.local.json public/assets/logo.png public/assets/logo_old.png` shows ` M`, ` M`, `??` (working-tree only, none staged); `git diff --cached` was empty before each commit apart from the named files. No `git push` was run.
- **Server stopped:** the listener was PID 13620 (`spacetimedb-standalone.exe`, verified by process name before stopping; it was started by Plan 42-05, background task `b0fqqbk8m`, which does not belong to this session so TaskStop was not applicable). `Stop-Process -Id 13620 -Force` only. Afterwards `netstat -ano | grep -E ":3000 .*LISTENING"` prints nothing and no `spacetimedb-standalone.exe` process remains. Phase verification can restart the server with the run-local skill (`spacetime start --non-interactive --listen-addr 127.0.0.1:3000`, then `pnpm spacetime:publish`; the local database files persist, key included).

## Criterion interpretations (for the verifier)

**Roadmap criterion 2 (bundle holds no credential), per planning note 2.** Met when the final built `dist/` holds no proxy secret value, no proxy URL or host, no `VITE_LLM_PROXY` name and no key-shaped string, and the only occurrence of the key name `llm_proxy_secret` is the single `localStorage.removeItem(...)` cleanup call. Evidence:
- `node scripts/check-bundle.mjs` on the final build: `bundle clean: 4 files scanned`, exit 0.
- `node scripts/check-bundle.mjs --explain`: lists no hit, exit 0.
- The cleanup call lives in `src/legacyCredentials.ts`; `src/legacyLlmRemoval.test.ts` "the retired credential key name appears only in legacyCredentials.ts" pins that it is the only production source file holding the name, and the guard's one allowed span is `localStorage.removeItem(...)`.

**Roadmap criterion 3 failure states (CONTEXT: no error chip, no errorCode shown).** A failed or expired job shows the server-written in-voice Keeper line in the narrative console. `applyLlmFailure` writes it in the same transaction that sets the job's terminal status: the executor's `withFailureTx` in `spacetimedb/src/helpers/llm_executor.ts` (line 161; it calls `deps.applyFailure(tx, toApplyJob(failed))` inside `ctx.withTx`), and the expiry path in `spacetimedb/src/helpers/llm_sweeper.ts` (`notifyFailure` calls `deps.applyFailure(ctx, toApplyJob(job))` after the status and money are written). The in-progress indicator hides once a job is terminal. Evidence (all passing; titles confirmed present with `grep -c` = 1 each):
- `spacetimedb/src/helpers/llm_executor.test.ts`: "529 then 500 then 500: the third attempt is terminal, refunded, one failure message, three call-log rows 1n 2n 3n".
- `spacetimedb/src/helpers/llm_sweeper.test.ts`: "expires a job older than 10 minutes with reservation and call refunded and the failure message".
- `spacetimedb/src/helpers/llm_apply.characterization.test.ts`: the failure-path describe "llm apply failure path: creation and skill_gen" ("creation_race failure appends creation_error and reverts the step to AWAITING_RACE", "creation_class failure appends creation_error and reverts the step to AWAITING_ARCHETYPE", "skill_gen failure writes an in-voice private narrative for the character owner", "Phase 41: renown_perk_gen failure inserts the static options for the rank and one Keeper line").
- `src/composables/useLlmStatus.test.ts`: the terminal-status case `it.each(['completed', 'failed', 'expired'])('never treats a %s job as active')` plus "ignores a terminal job when an active one is present".

**Roadmap criterion 1 (no `submit_llm_result` in the bindings).** `src/legacyLlmRemoval.test.ts` "generated bindings after publish 2" asserts no file or `index.ts` mention of `submit_llm_result` / `submitLlmResult` (and the other removed names) while `my_llm_jobs_table.ts` and `admin_llm_status_table.ts` remain.

**Roadmap criterion 4 (key still set, no clear).** `admin_llm_status` returned `key_set` true, `key_length` 108 before publish 2, after it, and after the no-flag re-publish; no publish carried a clear or data-deletion flag.

## Task 3: user checklist and retention todo (commit fc6dd289)

- `42-USER-CHECKLIST.md` (123 lines): sections A (Cloudflare Worker `uwr-llm-proxy`, name to be confirmed since it is research assumption A1; OpenAI key revoke; old proxy secret treated as burned), B (`VITE_LLM_PROXY_URL` / `VITE_LLM_PROXY_SECRET` from `.env.local` and hosting settings), C (delete the local `llm-proxy/` folder and then remove the `/llm-proxy/` line from `.git/info/exclude`, per the 42-04 note), D (rebuild plus bundle guard), E (maincloud two-publish: preconditions, `git worktree add` from publish-1 commit `5968d54f58fd5792772d52fd5a30369a8055c646`, publish 1, client deploy plus `/setappversion`, `purge_legacy_llm` plus four COUNT checks, publish 2, verify, worktree remove; never a clear), F (what Claude did locally), and the Phase 41 deferrals. It names variables and files only; acceptance greps: `purge_legacy_llm` 2, `git worktree add` 1, `VITE_LLM_PROXY_URL|VITE_LLM_PROXY_SECRET` 2, `wrangler delete uwr-llm-proxy` 1, key-shaped text 0, 40-hex SHA present.
- `.planning/todos/pending/2026-09-30-llm-job-retention-and-pruning.md`: title "Add llm_job retention and pruning", area backend, priority medium, the four files from the plan, sweeper pruning (keep `llm_call_log`) and the untested filtered subscription (research A4), plus the tests to add.

## Deviations from Plan

None - plan executed as written. Observations (not deviations):
- The publish output included `Skipping confirmation due to --yes` although `-y` was not passed; the CLI prints it for `--break-clients` with closed stdin. It confirmed only the client disconnect, never a data deletion, and the four dropped tables were empty.
- The plan expected `describe` to show `llm_job` "at least 1"; the JSON names it 3 times (table, index/sequence-adjacent references).
- Commit 4c953190 (`docs(42-05): record that the local server stopped after the plan`) appeared in the log between my two task commits. It was not made by this plan's steps. It concerns 42-05's server-state note; this plan's SUMMARY records the actual stop.

## Known Stubs

None.

## Threat Flags

None. The change only removes tables and generated bindings and adds documentation; no new endpoint, auth path or trust-boundary surface.

## Self-Check: PASSED

- Files FOUND: 42-USER-CHECKLIST.md, 2026-09-30-llm-job-retention-and-pruning.md, src/legacyLlmRemoval.test.ts; `src/module_bindings/llm_task_table.ts` and `purge_legacy_llm_reducer.ts` absent.
- Commits FOUND in git log: e292ce92, fc6dd289.
- Port 3000 not listening.
