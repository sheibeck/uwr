---
phase: 41-executor-and-domain-cutover
plan: 09
subsystem: llm-key-setup
tags: [security, key-management, node-script, runbook, sec-04]
status: complete
requires:
  - phase: 41-08 (set_api_key reducer and the LLM_KEY_SET_LOG_PREFIX log line, admin_llm_status, llm_smoke_test)
provides:
  - "scripts/llm/cli.mjs: REPO_ROOT, ENV_LOCAL, TARGETS, resolveTarget, scrub, loadAnthropicKey, keyFormatOk, extractToken, getCliToken, callReducerHttp, readLogs, confirmKeySet, storeKey, LLM_KEY_SET_LOG_PREFIX"
  - "scripts/llm/set-key.mjs: key setup script (dry run, local default, explicit maincloud opt-in)"
  - "scripts/llm/cli.test.mjs: 22 vitest tests (run from the repo root)"
  - "docs/runbooks/llm-key.md: SEC-04 setup, rotation, --clear-database recovery runbook (94 lines)"
affects: [41-16]
tech-stack:
  added: []
  patterns:
    - "Key transport is the HTTP call endpoint (body only), not spacetime call argv"
    - "Every printed line is scrubbed with the key and token as needles"
key-files:
  created:
    - scripts/llm/cli.mjs
    - scripts/llm/set-key.mjs
    - scripts/llm/cli.test.mjs
    - docs/runbooks/llm-key.md
  modified: []
key-decisions:
  - "storeKey (post, 400 retry with the named form, log confirmation) lives in cli.mjs with injectable call and log hooks so the flow is unit tested without a server; set-key.mjs only parses flags"
  - "callReducerHttp takes an optional fetch implementation as a fifth argument (test hook)"
  - "confirmKeySet matches the exact length (len=480 does not confirm 48)"
metrics:
  tasks: 2
  files: 4
  tests_added: 22
  suite: "1915 passed (spacetimedb, unchanged baseline); scripts/llm/cli.test.mjs 22 passed"
completed: 2026-09-30
---

# Phase 41 Plan 09: Key Script and Runbook Summary

A permanent key setup script that stores the Anthropic key on the local server through the documented HTTP call endpoint (key only in the request body, every output line scrubbed, exit 0 only when the module log confirms `llm key set, len=<n>`), plus the SEC-04 runbook.

## What was built

### Task 1: helpers, script and tests (commit cb482ccb)
- `cli.mjs`: local target by default; maincloud needs both `--target maincloud` and `--confirm-maincloud` (one flag throws a message naming the second; unknown target throws). Key loaded with `util.parseEnv` from a file (never `process.env`); `extractToken` returns only the three-part `eyJ` token; `getCliToken` runs `spacetime login show --token` in-process with `shell:false` and prints nothing; `callReducerHttp` posts `[key]` to `/v1/database/uwr/call/set_api_key` with a Bearer token and returns a body scrubbed of the token and every string argument; `readLogs` reads the whole `spacetime logs --server <s> --no-config uwr` output and slices the last n lines; the only two spawns are fixed argument arrays that never contain the key.
- `set-key.mjs`: `--dry-run` prints only `ANTHROPIC_API_KEY: present (format ok, len <n>)` (missing or unexpected format exits 2); real run gets the token (exit 1 if none), calls `set_api_key`, retries once with `{ apiKey }` on a 400, prints `set_api_key: HTTP <status>` and which argument form worked, then `key stored: yes (len <n>)` (exit 0) or `unconfirmed` (exit 1). `--key-file <path>` is a test hook.
- `cli.test.mjs` (22 tests): key format, scrub, token extraction, target resolution, key loading, exact-length confirmation, HTTP call shape and response scrubbing, the store flow (success, 400 retry, unconfirmed, 401 with token scrub), dry-run spawn (one line, no key fragment, exit 2 for missing and bad format, maincloud with one flag refused before any key work), static checks (no `process.env` and no spawn in set-key.mjs, literal spawn arrays without key, `parseEnv` present, no key-shaped literal in any of the three files), and the log-line contract against `spacetimedb/src/reducers/llm.ts`.
- Real `--dry-run` was run once against the user's env file: it printed only the presence line with a length and exited 0.

### Task 2: runbook (commit 30e0b13b)
`docs/runbooks/llm-key.md` with the ten required headings in order: where the key lives, prerequisites, Console spend limit (interim guard, $1.00 and 200 calls per player per UTC day, $2.00 phase ledger), first-time setup, rotation, recovery after `--clear-database` (record ledger totals first), smoke test and status, never do this, symptoms table, maincloud (user only). Includes the assumption A1 fallback (interactive `spacetime call`, key briefly in that process's argv).

## Deviations from Plan

### Auto-fixed Issues
None of Rules 1 to 3. Two small additions, both in service of the plan's testing requirement:

**1. [Rule 2 - Missing testable coverage] Extra `storeKey` helper and fetch test hook**
- The plan lists a fixed helper set; the post-retry-confirm flow would otherwise be untestable without a server. Added `storeKey` to `cli.mjs` and an optional `fetchImpl` parameter on `callReducerHttp`.
- Commit: cb482ccb

**2. [Process] Tests and implementation committed together** for Task 1 (plan type `execute`), consistent with Plans 41-01 to 41-08.

## Known Stubs
None.

## Threat Flags
None beyond the plan model. T-41-01, T-41-14 and T-41-22 are mitigated and tested (no argv key, scrubbing with key and token needles, two-flag maincloud opt-in, token never printed).

## Notes for Plan 41-16 (user runs the real key set)
- Flagged assumption A1 is untested live: if `key stored: unconfirmed` or an HTTP 401 or 403 appears, the runbook fallback applies and the result should be reported.
- The real non-dry-run was never executed; nothing touched maincloud; `spacetimedb/.env.local`, the key and the CLI token were never read or printed by me.
- No publish and no requirements marked complete (orchestrator rule).
- Local git prints an LF to CRLF working-copy warning for the new files (autocrlf); committed content is LF.

## Self-Check: PASSED
- FOUND: scripts/llm/cli.mjs, scripts/llm/set-key.mjs, scripts/llm/cli.test.mjs, docs/runbooks/llm-key.md
- FOUND commits: cb482ccb, 30e0b13b
- Acceptance greps: `process.env` in set-key.mjs 0; `parseEnv` in cli.mjs 3; `call/` 1; `confirm-maincloud` 4; key-shaped literal 0 in all three scripts and the runbook; runbook `set-key.mjs` 8, `llm_smoke_test` 5, 94 lines; verify node one-liner printed `ok`
- `pnpm exec vitest run --maxWorkers=1 scripts/llm/cli.test.mjs`: 22 passed
- Full suite `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1`: 1915 passed (46 files)
