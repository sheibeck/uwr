---
phase: 44-live-verification-and-tone-eval
plan: 06
subsystem: testing
tags: [llm, live-drills, scratch-db, qual-03, vitest, failure-drills]
requires:
  - phase: 44-02
    provides: unit drills for all seven failure classes
  - phase: 44-03
    provides: resolveLiveDb allowlist, set-key script and scratch database runbook
  - phase: 44-05
    provides: staged live-proof harness conventions
provides:
  - "drill_rules.mjs: assertDrillDb (uwr-verify only), makeFakeKey, assertRestored, zeroSpendProblems, timeoutLedgerProblems, leakHits, drillRecord"
  - "drills.live.ts: dry-by-default live drill harness with per-drill try/finally restores"
  - "44-live-drills.json: recorded result of the four live drills and the restore check (all passed)"
affects: [44-07, 44-09, 44-10]
tech-stack:
  added: []
  patterns:
    - "Dry by default: DRILLS_LIVE_RUN unset prints the plan and calls nothing"
    - "Induce in try, restore in finally, assert the restore from admin_llm_status"
key-files:
  created:
    - scripts/llm/drill_rules.mjs
    - scripts/llm/drills.live.ts
    - .planning/phases/44-live-verification-and-tone-eval/44-live-drills.json
  modified:
    - scripts/llm/drill_rules.test.mjs
key-decisions:
  - "The drill database check accepts uwr-verify alone; uwr and every hosted target are refused"
  - "A timeout call-log row carries the reservation as its cost by design; zero tokens is required always, zero cost on every row except a timeout row, whose cost must equal the ledger delta"
  - "The fake key is stored before every drill and the real key is restored per drill in finally, so the real key is never in place while a drill sends a request"
requirements-completed: [QUAL-03]
duration: about 3.5 h wall clock including the owner cost checkpoint (about 10 min of live work after approval)
completed: 2026-10-05
status: complete
---

# Phase 44 Plan 06: Live Failure Drills on the Scratch Database Summary

**The four live failure drills (401 with a fake key, ceiling lowered to $0.01, kill switch off, 50 ms route timeout) ran once on the local scratch database `uwr-verify`, all passed, every induced state was restored and asserted, and real spend was $0.**

## Accomplishments

- **Drill rules (Task 1):** `assertDrillDb` accepts `uwr-verify` alone. `makeFakeKey` builds the fake key from fragments so no key-shaped literal sits in source. `assertRestored` checks key set and length, ceiling and kill switch from `admin_llm_status`. `zeroSpendProblems` and `timeoutLedgerProblems` assert zero tokens on every created row. `drillRecord` builds the JSON record with counts and rule ids only; a drill that did not run is `not_run` and never counts as passed.
- **Harness (Task 1):** `drills.live.ts` is dry unless `DRILLS_LIVE_RUN=run`, narrowed by `DRILLS_ONLY`. Each drill restores in `finally` and asserts the restore.
- **Live run (Task 3), after the owner approved at the cost checkpoint:**
  - The local server was down; started it (127.0.0.1:3000, ping 200), then created `uwr-verify` with `spacetime publish uwr-verify --server local -p spacetimedb` (a new database, no clear flag).
  - `bad_key_401`, `ceiling`, `kill_switch`: passed. The 401 drill produced one call row with outcome auth, HTTP 401, bucket unavailable, job failed, lock released, 2 player lines, no provider words.
  - `tiny_timeout`: temporary edit of the `creation_race` entry in `LLM_TUNING` (`spacetimedb/src/data/llm_tuning.ts`) to 50 ms, publish, drill, then revert (`git checkout -- ` that one file), `git diff --exit-code -- spacetimedb` clean, and re-publish of the unmodified source. Passed: outcome timeout, bucket transient, job failed, lock released, 2 player lines.
  - Real key restored with `node scripts/llm/set-key.mjs --db uwr-verify`; `restore_check` passed (keySet true, length 108 equal to the real key's, ceiling 10,000,000 micro-USD equal to the start, kill switch on, zero-spend assertions clean over 2 call rows from 2 jobs).

## Task Commits

1. Task 1 RED: 16432cb9 test(44-06): add failing tests for drill rules, restore and zero-spend assertions, drill record and harness guards
2. Task 1 GREEN: 076869e4 feat(44-06): drill rules and dry-by-default live drill harness for the scratch database
3. Task 2: checkpoint, owner answered "approved" (no commit)
4. Task 3: 71ca202b docs(44-06): record the four live drills and restore check on the scratch database

## Verification

- `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/drill_rules.test.mjs scripts/llm/proof_rules.test.mjs`: 2 files, 153 tests passed.
- `git diff --exit-code -- spacetimedb`: clean, before the record commit and after.
- `44-live-drills.json`: overall passed; bad_key_401, ceiling, kill_switch, tiny_timeout, restore_check each passed with evidence.
- Spend: every drill ran with the fake key stored (the real key was restored in `finally` after each drill), so no request carried the real key. The only non-zero figure is the 18,248 micro-USD stand-in reservation on the timeout call row, which is a ledger reservation against a fake key, never billed. Real spend: $0, against the $0.05 plan limit.
- No command named `uwr`, no hosted target, no push, no `--clear-database`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Design correction] A timeout call-log row carries the reservation as its cost**
- **Issue:** the plan's rule "zero tokens and zero cost on every row" would reject the module's own timeout accounting, which books the reservation as the row cost.
- **Fix:** `zeroSpendProblems` requires zero tokens always and zero cost except on a timeout row; `timeoutLedgerProblems` ties that cost to the ledger delta so it cannot hide real spend.
- **Commits:** 16432cb9, 076869e4

**2. [Rule 2 - Missing critical functionality] Fake key stored before every drill, real key restored per drill**
- **Issue:** a drill that started with the real key in place could send a billable request (timeout drill especially).
- **Fix:** the harness stores the fake key before each drill and restores the real one in `finally`, which is why the real spend is $0 including the timeout drill.
- **Commit:** 076869e4

**3. [Rule 2 - Missing critical functionality] Leak rule and vacuous-pass guard**
- **Fix:** a new `leakHits` rule scans player lines for provider words and key shapes, and a drill fails if no player line could be read, so a drill cannot pass on silence.
- **Commit:** 076869e4

None during Task 3: it ran as written.

## Auth Gates

None. The real key was read in-process from the env file by `set-key.mjs` and never printed.

## Known Stubs

None.

## Threat Flags

None.

## State left behind for later plans

- The local SpacetimeDB server is running on 127.0.0.1:3000 (ping 200). It was down at the start of this task and was started here for 44-07, 44-09.
- `uwr-verify` holds the unmodified source, the real key (length 108), ceiling $10.00, kill switch on, with two failed drill jobs in its log. The user's `uwr` database was not touched.

## Self-Check: PASSED

- Files found: scripts/llm/drill_rules.mjs, scripts/llm/drills.live.ts, .planning/phases/44-live-verification-and-tone-eval/44-live-drills.json
- Commits found: 16432cb9, 076869e4, 71ca202b
