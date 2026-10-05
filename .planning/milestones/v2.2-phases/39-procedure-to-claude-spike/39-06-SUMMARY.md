---
phase: 39-procedure-to-claude-spike
plan: 06
subsystem: testing
tags: [anthropic, api-key, reliability, ladder, spacetimedb, procedure]

requires:
  - phase: 39-05
    provides: rung 1, dispatch, sender, drills, idle baseline; uwr-spike published; harness and results store
provides:
  - scripts/spike/ladder.live.ts (rungs 2 and 3 with the single allowed re-run and a per-call budget check)
  - results sections ladder.models (10 samples), ladder.reliability (30 samples), serverLogs[ladder]
  - real Anthropic key stored in private llm_config of local uwr-spike via set-key.mjs
affects: [39-07, 39-08, 39-09, 39-10]

tech-stack:
  added: []
  patterns:
    - "Rung 3 runs one job per runSequential call so budgetCheck runs before every paid call, with progress persisted to ladder.reliability after each call"

key-files:
  created:
    - scripts/spike/ladder.live.ts
  modified:
    - .planning/phases/39-procedure-to-claude-spike/39-spike-results.json

key-decisions:
  - "No re-run was needed for either rung (all first attempts ok), so the strict tally is exactly 40 of 40"

requirements-completed: []

coverage:
  - id: D1
    description: "Real key stored only through set-key.mjs into private llm_config, with a clean leak scan (real-key needle loaded) before and after the paid rungs"
    requirement: SPIKE-01
    verification:
      - kind: integration
        ref: "node scripts/spike/set-key.mjs -> key stored: yes (len 108); node scripts/spike/leak-scan.mjs --require-server -> LEAK-SCAN: CLEAN (twice)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rung 2: 10 scheduled GET /v1/models calls all ok and listing claude-sonnet-5-5"
    requirement: SPIKE-01
    verification:
      - kind: integration
        ref: "scripts/spike/ladder.live.ts (ladder.models: 10/10 ok, attempt 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rung 3: 30 small claude-sonnet-5-5 calls (effort low, max_tokens 256) through the scheduled procedure, all classified"
    requirement: SPIKE-01
    verification:
      - kind: integration
        ref: "scripts/spike/ladder.live.ts (ladder.reliability: 30/30 ok, stop_reason end_turn)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-29
status: complete
---

# Phase 39 Plan 06: Key Provisioning and Paid Ladder Rungs Summary

**The full SPIKE-01 ladder now has evidence: 10 of 10 GET /v1/models and 30 of 30 small claude-sonnet-5-5 calls succeeded on the first attempt through the scheduled procedure, at an estimated spend of 2,280 micro-USD (about $0.0023).**

## Performance

- **Duration:** about 25 min (the live ladder run took 62 s)
- **Tasks:** 3 of 3 (Task 1 human-action completed by the user; Task 2 wrote no repository files)
- **Files:** 1 created (`scripts/spike/ladder.live.ts`), 1 modified (results JSON)

## Findings recorded

- **Key provisioning (Task 1/2):** the user added the key to `spacetimedb/.env.local`; `set-key.mjs --dry-run` printed `present (format ok, len 108)`, the store run printed `key stored: yes (len 108)`. Claude never opened or printed the file or the key. `leak-scan.mjs --require-server` printed `real-key needle: loaded` and `LEAK-SCAN: CLEAN` after storing the key and again after the paid rungs (server logs, data logs, results, out, git-tracked files and git history all 0 hits).
- **Rung 2 (`ladder.models`):** 10 of 10 ok on attempt 1, every ok sample came from a response listing claude-sonnet-5-5 (the module's modelListed check). In-module call time p50 264 ms, p95 659 ms (includes the cold first call); client end to end p50 548 ms, p95 776 ms.
- **Rung 3 (`ladder.reliability`):** 30 of 30 ok on attempt 1, all `stop_reason` `end_turn`, zero failures of any class (no platform, upstream, auth, request or content). In-module call time p50 787 ms, p95 1,028 ms; client end to end (enqueue to result row visible) p50 1,051 ms, p95 1,483 ms. Roughly 76 micro-USD per call.
- **Re-runs and diagnostics:** none needed, so `ladder.diagnostics` is absent (nothing failed) and the strict tally is 40 of 40 with no re-run to weigh separately.
- **Spend:** estimated 2,280 micro-USD from all recorded call samples in the results file (rung 3 only; models and free calls cost 0). Against the harness ceiling of 2,400,000 and the module cap of 2,400,000 this is under 0.1%. The module's own `spike_state` value could not be read (the SQL call was rejected by argument parsing, no retry made), so the results-file estimate is the reported figure; Plan 08 should read `spike_state` when it computes final spend.
- **Gate-count caveat carried from Plan 05:** rung 1 and no-op dispatch samples are also `class: 'reliability'`, so `gateInputFromResults` counts them together with these 40 paid samples. Plan 08 must apply the 30-call minimum to `ladder.reliability` alone or reclassify the no-op samples.

## Task Commits

1. Task 1: user action (workspace and key), no commit
2. Task 2: key stored and leak-scanned, no repository files, no commit
3. Task 3: `c214839b` test - paid ladder rungs 2 and 3

## Deviations from Plan

None - plan executed exactly as written. (The vitest console output is not displayed by the runner in this environment, so values above were read from the results JSON, as in Plan 05.)

## Issues Encountered

- `git` warned that CRLF in `ladder.live.ts` will be normalized to LF on next touch; harmless.

## Known Stubs

None.

## Threat Flags

None. No new network surface; the only paid traffic went to api.anthropic.com through the existing procedure under the harness budget and module cap.

## Processes

No background process was started by this plan. The orchestrator's SpacetimeDB server (PID 14384) was reused and not touched.

## Self-Check: PASSED

- FOUND: scripts/spike/ladder.live.ts, ladder.models (10), ladder.reliability (30) in 39-spike-results.json
- FOUND commit: c214839b
- `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.results.test.ts`: 67 passed
- `leak-scan.mjs --require-server`: LEAK-SCAN: CLEAN
