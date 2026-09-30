---
phase: 39-procedure-to-claude-spike
plan: 09
subsystem: spike-decision
tags: [decision, gate, record, maincloud]
requires: [39-11]
provides:
  - "Confirmed Phase 39 go/no-go: scheduled-procedure executor for Phase 41 (maincloud strict verdict go)"
  - "39-SPIKE-RECORD.md decision record with local and maincloud side by side"
affects: [phase-40, phase-41, phase-42, phase-43]
key-files:
  created:
    - .planning/phases/39-procedure-to-claude-spike/39-SPIKE-RECORD.md
  modified:
    - scripts/spike/verdict.live.ts
    - .planning/phases/39-procedure-to-claude-spike/39-spike-results.json
    - .planning/phases/39-procedure-to-claude-spike/39-maincloud-results.json
    - .planning/PROJECT.md
    - .planning/STATE.md
decisions:
  - "Phase 41 builds the scheduled-procedure executor (maincloud strict verdict go, floor-adjusted identical)"
  - "Phase 41 in-flight cap at most 8 (observed maincloud cap; local runtime caps at 4)"
  - "llm-proxy retired in Phase 42; jobs must carry the player identity (ctx.sender is the module identity)"
metrics:
  completed: 2026-09-29
status: complete
---

# Phase 39 Plan 09: Decision Record and Confirmed Executor Verdict Summary

The maincloud (`uwr-spike-925iv`) strict gate verdict is `go`, and the user confirmed it ("confirm-strict"): Phase 41 builds a scheduled-procedure executor, with the in-flight cap at most 8 and the llm-proxy retired in Phase 42.

## What was done

- **Task 1** (commit 509988af): `verdict.live.ts` got a target mode. The local file stores a provisional verdict (strict `incomplete`, `ping@4 147/200`, with diagnostics). The maincloud file stores a decisive verdict (strict `go`, floor-adjusted `go`, noise floor 25 ms, observed server cap 8). The decision record `39-SPIKE-RECORD.md` was written (side-by-side gate tables, ping-vs-tick section, concurrency caps, reliability, ladder, structured outputs, dispatch/sender/load, composed overhead, spend, Phase 40/41/43 implications, server logs). Results test (109 tests) and both leak scans passed.
- **Task 2** (checkpoint:decision, resolved): user reply "confirm-strict".
- **Task 3** (commit 688ef666): `verdict.confirmation` (`confirm-strict`, reason verbatim, timestamp) written to the maincloud results file through `ResultsStore` with `SPIKE_TARGET=maincloud`; record Decision and Confirmation sections finalised; PROJECT.md new Key Decisions row plus the existing "LLM via client-side proxy (not procedures)" row's outcome updated to superseded/GO; STATE.md decision line added, stale maincloud blocker bullet rewritten (QUAL-02 / Phase 44 part kept), and the `uwr-spike-925iv` exception appended to the "NO PUSHES TO MAINCLOUD" bullet. Results test (109 passed) and both leak scans (`LEAK-SCAN: CLEAN`, `record: scanned`) run before the commit.

Earlier commits kept from the partial run: 8882775e, d023526c, 8193a8c9.

## Key numbers (maincloud, decisive)

- dispatch p95 3.0 ms (limit 250); reliability 0 failures in 164 calls; region schema compiles
- ping p95 ratio 1.01x / 0.98x / 1.03x and tick p95 ratio 0.96x / 1.01x / 0.99x at 8 / 4 / 2 in flight (limit 2.0x)
- observed server concurrency cap 8 (local 4); harness spend 1.147M micro-USD maincloud, about $3.28 combined with local

## Deviations from Plan

None in the plan's substance. Two small notes:
- The ResultsStore confirmation write used a temporary vitest one-shot (`scripts/spike/confirm.tmp.live.ts`), created, run and deleted without being committed, because ResultsStore is TypeScript and has no CLI.
- Per the orchestrator, the existing PROJECT.md row "LLM via client-side proxy (not procedures)" was updated as well as adding the new row.
- Task 1's pre-checkpoint work left the results files and the record uncommitted by design; they are committed in 688ef666.

## Known Stubs

None.

## Threat Flags

None. Nothing was published, deleted or called live in this plan; the throwaway module, harness, local database and maincloud database remain for Plan 10. SPIKE-01..04 were not marked complete in REQUIREMENTS.md (left to the orchestrator).

## Self-Check: PASSED

- Files found: 39-SPIKE-RECORD.md, both results files, PROJECT.md, STATE.md
- Commits found: 509988af, 688ef666
- `scripts/spike` and `spacetimedb/src/spike` still exist
