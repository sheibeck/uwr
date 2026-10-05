---
phase: 44-live-verification-and-tone-eval
plan: 03
subsystem: testing
tags: [llm, call-log, reconciliation, latency, scratch-db, qual-02, vitest]
requires:
  - phase: 41-executor-and-domain-cutover
    provides: llm_call_log table, key script and HTTP helpers in scripts/llm/cli.mjs
  - phase: 43-latency-tuning-and-budget
    provides: percentile and estimateCostMicroUsd helpers, LLM_ROUTE_NAMES with staged routes
provides:
  - Allowlisted local-only --db (uwr, uwr-verify) for resolveTarget, set-key.mjs and the HTTP helpers
  - call_log_report.mjs - per-route p50/p95/p99, token totals, integer-math Console reconciliation, streaming verdict, SQL row mapping, local-only fetch
  - ts_resolve_hook.mjs - lets plain node load the server route table
affects: [44-05 harness record shape, 44-06 live drills, 44-09 e2e run report, 44-10 reconciliation and streaming close-out]
tech-stack:
  added: []
  patterns: [pure report module with a thin CLI, BigInt integer math for the 2 percent test, node resolve hook for extensionless .ts imports]
key-files:
  created:
    - scripts/llm/call_log_report.mjs
    - scripts/llm/call_log_report.test.mjs
    - scripts/llm/ts_resolve_hook.mjs
  modified:
    - scripts/llm/cli.mjs
    - scripts/llm/cli.test.mjs
    - scripts/llm/set-key.mjs
    - docs/runbooks/llm-key.md
key-decisions:
  - "--db is refused with any hosted-target flag (maincloud, --confirm-maincloud, --target=...), a repeated --db, or any name other than uwr or uwr-verify; the bad value is never echoed"
  - "A Console category with 1 to 1999 tokens is judged on an absolute 50-token floor; Console 0 and the sum are strict 2 percent only"
  - "reconciliationRecord statuses are passed, failed, deferred (no Console input) and invalid (malformed input or bad window); only passed counts as a pass"
  - "Results file contract for later plans: { jobIds: { route: [ids] } or [ids], requiredRoutes?, window: { startMs, endMs } }; the CLI writes a report key back; Console totals file is { input, output, cacheWrite, cacheRead }"
patterns-established:
  - "Console totals are digit-only non-negative integers; commas, negatives, floats are rejected before comparison"
requirements-completed: []
duration: 40min
completed: 2026-10-05
status: complete
---

# Phase 44 Plan 03: Scratch DB plumbing and call-log report Summary

**Offline, tested plumbing for the live run: `--db uwr-verify` (local only, allowlisted) for the key script and HTTP helpers, and a call-log report that gives per-route p50/p95/p99 in fixed route order, BigInt-exact Console reconciliation at plus or minus 2 percent, and the streaming verdict, with not-run and deferred never reported as passed.**

## Accomplishments

- **Task 1 (`0b13ad05`):** `LIVE_DBS`, `resolveLiveDb`, `targetLine` and `--db` parsing in `resolveTarget`. `--db uwr` returns the unchanged `TARGETS.local`; `--db uwr-verify` returns a frozen local copy with `db` replaced. Lookalikes, case variants, slashes, empty and missing values all throw; any combination with the hosted target throws. `set-key.mjs` still uses the single `resolveTarget(argv)` parser and now prints `target: local, db: <name>`. Runbook gained a Scratch database section.
- **Task 2 (`782d0f28`):** `call_log_report.mjs` with the exports named in the plan plus `parseConsoleTotals`, `buildReport`, `toJsonSafe` and `main`. Percentiles come from the server `percentile`, price from `estimateCostMicroUsd`, order from `LLM_ROUTE_NAMES`. Exactly 2.00 percent passes, 2.01 percent fails, proven at 2^53+ magnitudes. `fetchCallLogRows` parses the URL and requires `http://127.0.0.1` exactly (so `http://127.0.0.1.evil.example` is refused), requires an allowlisted db, and scrubs the token from every error.

## Verification

- `scripts/llm/cli.test.mjs` + `call_log_report.test.mjs` + `golden_rules.test.mjs` (re-run because it imports `REPO_ROOT` from cli.mjs): 163 passed, `--maxWorkers=1`.
- Mutation check: flipping the 2 percent comparison from `<=` to `<` fails 3 tests.
- `node scripts/llm/set-key.mjs --db uwr-verify --dry-run` printed `ANTHROPIC_API_KEY: present (format ok, len 108)` only; `--db prod` exited 2 with a scrubbed message.
- `node scripts/llm/call_log_report.mjs` runs under plain node (the route table loads through the resolve hook) and refuses a bad `--db`. No server, key use, network, publish or paid call happened.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plain node cannot import the server route table**
- **Found during:** Task 2
- **Issue:** `spacetimedb/src/data/llm_routes.ts` imports siblings without a file extension; Node ESM refuses that, so `node scripts/llm/call_log_report.mjs` (the documented CLI form) could not load `LLM_ROUTE_NAMES`.
- **Fix:** Added `scripts/llm/ts_resolve_hook.mjs` (retries a failed relative extensionless import with `.ts`), registered by `call_log_report.mjs` only when not under vitest, with the route table loaded by top-level `await import`. No server file was changed.
- **Files modified:** scripts/llm/ts_resolve_hook.mjs, scripts/llm/call_log_report.mjs
- **Commit:** 782d0f28

**2. Test-first order in Task 2:** Task 1 followed RED then GREEN (6 failing before the implementation). In Task 2 the module and tests were written together and went green on the first run; a mutation of the 2 percent rule was used to confirm the tests can fail.

## Known Stubs

None.

## Threat Flags

None. The new network surface is the local-only SQL read, covered by T-44-03-01 and T-44-03-02.

## Notes for later plans

- Plan 05 should write the results file as `{ jobIds, requiredRoutes?, window: { startMs, endMs } }`; the 44-09 run executes `node scripts/llm/call_log_report.mjs --db uwr-verify --results <file>`; 44-10 adds `--reconcile <console-totals-file>`.
- QUAL-02 is not marked complete: it needs the live runs in 44-09 and 44-10.

## Self-Check: PASSED

- Files found: scripts/llm/call_log_report.mjs, scripts/llm/call_log_report.test.mjs, scripts/llm/ts_resolve_hook.mjs, scripts/llm/cli.mjs, scripts/llm/set-key.mjs, docs/runbooks/llm-key.md
- Commits found: 0b13ad05, 782d0f28
