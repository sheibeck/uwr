---
phase: 40-claude-request-layer-and-job-seam
plan: 09
subsystem: llm
tags: [spacetimedb, seam-test, mock-proc-ctx, publish-local, module-bindings, privacy, vitest]
requires:
  - phase: 40-06
    provides: buildClaudeRequest, buildClaudeHeaders, classifyClaudeResponse/Error, response fixtures
  - phase: 40-07
    provides: my_llm_jobs view, renown rank-up enqueue (PIPE-08)
  - phase: 40-08
    provides: applyLlmResult, toApplyJob
provides:
  - "helpers/llm_seam.test.ts: test-only runJobOnce reference driver (tx1 read, fetch outside any tx, tx2 persist, tx3 apply) with 14 offline scenarios"
  - "llm_job, llm_call_log tables and my_llm_jobs view live on the LOCAL database uwr (no clear)"
  - "Regenerated src/module_bindings/ with my_llm_jobs_table.ts and no table binding for llm_job, llm_call_log or llm_config"
affects: [41, 42]
tech-stack:
  added: []
  patterns:
    - "Reference driver the Phase 41 executor procedure promotes: one withTx to read job and key, http.fetch with no tx open, one withTx to persist outcome and call log, one withTx to apply"
    - "Leak scan serializes every table except llm_config (which legitimately holds the key) with strictPrefix and the key as a needle, plus a negative control"
key-files:
  created:
    - spacetimedb/src/helpers/llm_seam.test.ts
    - src/module_bindings/my_llm_jobs_table.ts
  modified:
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
key-decisions:
  - "The re-invoked-transaction equivalence test normalizes auto-increment ids: the mock restores rows but not the id counter between re-runs (gaps are normal in SpacetimeDB too); everything else must match byte for byte"
  - "The seam test excludes only llm_config from the leak scan and asserts the key is stored there first, so the needle scan is meaningful"
patterns-established:
  - "Phase 41 executor: copy runJobOnce; failures with retryable=true go back to pending with errorCode, others to failed; usage is kept on billed failures"
requirements-completed: []
duration: 35min
completed: 2026-09-29
status: complete
---

# Phase 40 Plan 09: Reference-Driver Seam Test and Local Publish Summary

The whole request layer now runs end to end offline through the mock procedure context (including a re-invoked transaction), the schema is live on the local database without a clear, and the real toolchain confirms clients get only the `my_llm_jobs` view.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Reference-driver seam test | b25f4d0b | spacetimedb/src/helpers/llm_seam.test.ts |
| 2 | Phase gate, local publish, bindings regeneration | fdbe37e6 | src/module_bindings/index.ts, types.ts, my_llm_jobs_table.ts |

## Seam test (14 tests, all green)

`runJobOnce(proc, jobId, buildInput)` is defined only in `llm_seam.test.ts` (`grep -rn runJobOnce spacetimedb/src` outside `*.test.ts` prints nothing). Scenarios:

- Renown rank-up via `awardRenown` in a `withTx`, scripted 200 with three perks: job `completed`, attempt 1, three `pending_renown_perk` rows for character 1 rank 2, one `llm_call_log` row (`ok`, httpStatus 200, usage 116/562/0/3727), stopReason/requestId/four counters on the job.
- Requester identity: the procedure sender is the module identity; perks, budget row and call log land on alice (T-40-04).
- Fetch call: URL `ANTHROPIC_MESSAGES_URL`, POST, `x-api-key` equals the fake key, timeout equals `LLM_ROUTES.renown_perk_gen.timeoutMs`, body model `CLAUDE_MODEL`, key absent from the body.
- `withTxReinvoke: 1`: three perks (not six), one call log row, budget callCount 1, `http.calls` length 1; the snapshot equals the plain run apart from auto-increment ids.
- Timeout: job `pending`, errorCode `timeout`, no perks, no budget charge, call log `timeout`.
- 429 with `retry-after: 7`: `pending`, `rate_limit`, `retryAfterSeconds` 7, httpStatus 429 logged.
- Refusal and max_tokens: job `failed` with `refusal` / `truncated`, billed usage kept on job and call log, no perks.
- Extra: 401 gives `failed`/`auth`; a transport error containing the key is redacted (`[REDACTED]`) before it is logged; `smoke_test` completes with game tables unchanged.
- After every scenario `findSecretLeaks(snapshot without llm_config, { strictPrefix: true, needles: [key] }).total === 0`; a negative-control test proves the scan flags the key when planted in a job row.

## Phase gate (offline)

- `pnpm --dir spacetimedb test`: 33 files, **1402 passed** (1388 before this plan, +14).
- `spacetime build -p spacetimedb`: "Build finished successfully" (same harmless "tsc not found" notice as earlier plans).
- `npx tsc --noEmit -p spacetimedb`: 11 diagnostics in `src/index.ts` (baseline 11); zero for every file created this phase (llm_seam, claude_request, llm_queue, llm_status, llm_apply, test-utils, schema_recorder, renown, llm_layers, model_literals, views/llm, views/index, schema/*).

## Toolchain privacy check (SEC-01, T-40-02)

`spacetime generate --lang typescript --out-dir <fresh temp dir> --module-path spacetimedb` ("Generate finished successfully"):

- `my_llm_jobs_table.ts`: PRESENT
- `llm_job_table.ts`: ABSENT
- `llm_call_log_table.ts`: ABSENT
- `llm_config_table.ts`: ABSENT

The temp directory was deleted. The committed bindings show the same: `ls src/module_bindings | grep -cE "^llm_(job|call_log|config)_table\.ts$"` is 0. `types.ts` gained row-type structs (`LlmJob`, `LlmCallLog`, `MyLlmJob`, `MyLlmJobs`); struct types are emitted for every module type (a pre-existing `LlmConfig` struct is there too) and are not subscribable tables, so nothing about the private tables' data is reachable.

## Local publish

- Server: nothing listened on 3000 beforehand, so this task started `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` in the background; ping returned 200 on the first poll.
- Command: `pnpm spacetime:publish < /dev/null` (`spacetime publish uwr --server local`), no `--clear-database`, no maincloud.
- Output line: `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`. The publish output showed `Created` for table `llm_job`, table `llm_call_log` and view `my_llm_jobs`; server log: "Creating table `llm_call_log`", "Creating table `llm_job`", "Database updated". No panics in `spacetime logs uwr --server local`.
- `--break-clients` was NOT needed. No clear was requested, so no stop-and-ask occurred.
- Bindings: `pnpm spacetime:generate` regenerated `src/module_bindings/`; `git status` showed only `index.ts`, `types.ts` modified and `my_llm_jobs_table.ts` new. The bindings commit contains only paths under `src/module_bindings/`.
- Server stop: after generation, the process chain this task launched (`spacetime.exe` 1964, `spacetimedb-cli.exe` 11680, `spacetimedb-standalone.exe` 9032) was stopped with `Stop-Process` (only those three PIDs); `netstat` confirms port 3000 is free. The background task notification of "failed, exit 127" is the expected effect of that kill.

## Deviations from Plan

None on scope. Notes:

- The "same end state after a re-invoked transaction" assertion normalizes `id` and `jobId` values: `createMockProcCtx` restores rows between re-runs but does not rewind the auto-increment counter, so the re-run's ids are higher (gaps are normal). All other content is compared exactly. Counts (three perks, one log row, one budget row, one fetch) are asserted directly as well.
- Added tests beyond the behavior list: requester identity, key-absent-from-body, 401, key-in-error-message redaction, negative control for the leak scan.
- `git` warned that CRLF will be converted to LF in the new test file (working-copy line endings only).

## Hand-offs

- **Phase 41 (executor):** promote `runJobOnce` into the scheduled procedure. It reads `llm_config` row 1 for the key in tx1, never holds a tx across `fetch`, persists in tx2, applies via `applyLlmResult(tx, toApplyJob(job), text)` in tx3. Retryable classes go back to `pending` with `errorCode`; `retryAfterSeconds` is on the result, not stored on the job.
- **Phase 41:** renown apply for ranks with bigint effects still throws in the static fallback (see 40-07/40-08 hand-offs). The seam test uses a valid three-perk reply, so it does not hit that path.
- **Phase 42:** client wiring of `my_llm_jobs` (`useLlmStatus`) and removal of the legacy public `llm_task`; bindings for the view are already committed.
- **Local database:** the local `uwr` database now has the new tables. Maincloud is untouched (manual, user-owned).

## Known Stubs

None.

## Threat Flags

None. T-40-02 mitigated (real-toolchain generate check plus committed bindings). T-40-03 mitigated (leak scan after every scenario plus negative control). T-40-04 mitigated (module-identity sender, effects on the requester). T-40-12 mitigated (local-only script, stdin closed, no clear, no maincloud, exact publish output recorded above).

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/llm_seam.test.ts, src/module_bindings/my_llm_jobs_table.ts
- FOUND commits: b25f4d0b, fdbe37e6
- `.claude/settings.local.json`, `public/assets/logo.png`, `public/assets/logo_old.png` still unstaged
