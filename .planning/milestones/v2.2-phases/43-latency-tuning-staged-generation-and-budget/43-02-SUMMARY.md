---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 02
subsystem: api
tags: [spacetimedb, llm, stats, percentile, formatting, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: nothing consumed from 43-01 (independent wave-1 plan)
  - phase: 39-spike
    provides: helpers/measurement.ts nearest-rank percentile
provides:
  - summarizeRoute and aggregateLlmStats over llm_call_log rows (24 h window and all time)
  - formatMicroUsd, formatLatencyMs, formatLlmStatsText producing link-free plain text
  - LlmStatsRow, RouteStats, LlmLedgerSummary types and LLM_STATS_WINDOW_MICROS for Plan 43-07
affects: [43-07, admin reducers]

tech-stack:
  added: []
  patterns:
    - "Pure stats module importing only ./measurement; the reducer gathers rows and prints"
    - "Money formatted from bigint micro-USD by string math, never floats"
    - "Console text stripped of [ ] < > { } because NarrativeMessage renders v-html and links [x]"

key-files:
  created:
    - spacetimedb/src/helpers/llm_stats.ts
    - spacetimedb/src/helpers/llm_stats.test.ts
  modified: []

key-decisions:
  - "p50 and p95 are over ok calls only; a route with calls but no ok call shows 0.0s"
  - "Latency and money truncate rather than round (5149 ms prints 5.1s; sub 1/10,000 dollar is dropped)"
  - "Only route names are printed from rows; hostile characters in a route name become underscores"

patterns-established:
  - "Output-safety tests assert no [ or < (and ] > { }) on a hostile-name fixture and a ten-route fixture"

requirements-completed: []  # OPS-02 helper half only; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "Per-route calls, cost, p50/p95 (nearest rank, ok calls only), errors and truncated; zeros for an empty route without throwing"
    requirement: OPS-02
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_stats.test.ts#summarizeRoute"
        status: pass
    human_judgment: false
  - id: D2
    description: "24 h window includes a call exactly 86_400_000_000 micros old and excludes one a microsecond older; route order then sorted unknown routes"
    requirement: OPS-02
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_stats.test.ts#aggregateLlmStats"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exact bigint money (4 decimals) and tenths-of-seconds latency formatting"
    requirement: OPS-02
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_stats.test.ts#formatMicroUsd"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_stats.test.ts#formatLatencyMs"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stats text has no [ < (or ] > { }), no 64-hex identity, no prompt or reply text, even for hostile route names and rows with extra fields"
    requirement: OPS-02
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_stats.test.ts#formatLlmStatsText"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-09-30
---

# Phase 43 Plan 02: LLM stats aggregation and formatting Summary

**Pure per-route stats for `/llm stats`: calls, exact bigint cost, nearest-rank p50/p95 over ok calls, errors and truncated for the last 24 h and all time, printed as bracket-free console text with a ledger line.**

## Accomplishments

- `summarizeRoute` and `aggregateLlmStats` read `route`, `outcome`, `latencyMs`, `costMicroUsd` and `createdAt` only, in one pass, with no row order assumed. They reuse `percentile` from `helpers/measurement.ts`, called only when the ok-latency list is non-empty.
- `formatMicroUsd`, `formatLatencyMs` and `formatLlmStatsText` use bigint and integer math (no `toFixed` or `parseFloat`). Route names pass through `plainName` (`[ ] < > { }` become `_`).
- The module's only import is `./measurement`. Plan 43-07 consumes the interfaces exactly as named in the plan.

## Task Commits

1. **Task 1: per-route aggregation** - `ab199ce2` (feat)
2. **Task 2: plain-text formatting** - `dc375cb6` (feat)

## Sample output (from the tests)

```
LLM stats by route, last 24 h | all time:
world_gen_start: 4 calls, $0.0712, p50 5.1s, p95 5.2s, 1 errors, 1 truncated | all time: 4 calls, $0.0712, p50 5.1s, p95 5.2s, 1 errors, 1 truncated
npc_reply: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated | all time: 1 calls, $0.0005, p50 2.0s, p95 2.0s, 0 errors, 0 truncated
idle_route: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated | all time: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated
Ledger: all time $0.2310 over 40 calls. Today $0.0712 spent and $0.0050 reserved of a $10.0000 daily ceiling. LLM calls are on.
```

## Verification

- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_stats.test.ts`: 23 tests pass. The inline snapshot matched on first write-through, with no `-u` used.
- Acceptance greps: 2 aggregation exports, 3 formatting exports, 1 `import` line (from `./measurement`), 0 `parseFloat` or `toFixed`.
- Full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 63 files, 2490 tests, all pass.
- `spacetime build -p spacetimedb`: "Build finished successfully" (with the pre-existing "tsc not found" notice).
- No `spacetime publish`, `call` or `generate` was run; nothing touched the running local stack.

## Deviations from Plan

None. The plan was executed as written. TDD: tests were written first and run RED (module import failed) before each implementation, but each task is one `feat` commit rather than a test/feat pair, as in Plan 43-01.

## Known Stubs

None.

## Threat Flags

None. T-43-06 (markup injection) and T-43-07 (information disclosure) are mitigated and unit-tested: hostile route-name test, ten-route fixture, and a 64-hex identity and extra-field test. No new endpoint or trust boundary; the module is not wired to any reducer yet (Plan 43-07).

## Notes for later plans

- Plan 43-07 builds `LlmLedgerSummary` from `llm_spend` (all-time `spentMicroUsd` and `calls`, today's day figure, `reservedMicroUsd`) and `llm_admin_state` (`llmEnabled`, `dailyCeilingMicroUsd`), and passes the full route list as `routeOrder`.

## Self-Check: PASSED

- `spacetimedb/src/helpers/llm_stats.ts` and `llm_stats.test.ts` exist and are committed.
- Commits `ab199ce2` and `dc375cb6` exist on master; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
