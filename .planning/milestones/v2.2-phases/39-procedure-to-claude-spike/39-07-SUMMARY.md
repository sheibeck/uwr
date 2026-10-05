---
phase: 39-procedure-to-claude-spike
plan: 07
subsystem: testing
tags: [anthropic, structured-outputs, effort, prompt-caching, headers, spacetimedb, procedure, publish]

requires:
  - phase: 39-06
    provides: real key in private llm_config, paid ladder rungs, harness (runSequential, runRungWithRerun, budgetCheck, directCall, connectSpike)
provides:
  - scripts/spike/structured.live.ts (region compile probe, 4-cell matrix, thinking-off, cache pair, header merge)
  - scripts/spike/extras.live.ts (#4954 same-connection check, publish survival)
  - results sections structured, headers (merged), cache, extras.directCall4954, extras.publishSurvival, environment.buildTags, serverLogs[structured, publish_survival]
affects: [39-08, 39-09, 39-10, phase-40, phase-41, phase-43]

tech-stack:
  added: []
  patterns:
    - "Paid matrix cells run one job at a time (runSequential n=1) so budgetCheck precedes every call, with progress persisted after each call"
    - "Publish-survival row lookup checks the old connection map and the reconnected client cache (conn.db.spikeResult.iter()), because rows inserted while disconnected are absent from the harness onInsert map"

key-files:
  created:
    - scripts/spike/structured.live.ts
    - scripts/spike/extras.live.ts
  modified:
    - spacetimedb/src/spike/llm_spike.ts
    - .planning/phases/39-procedure-to-claude-spike/39-spike-results.json

key-decisions:
  - "Region schema compiled on the first probe, so no staged fallback ran and the region cells use the single region route"
  - "blockedLikely is kept exactly as the plan defines it (aP50 > 10 * bP50); a max-based flag (blockedLikelyByMax) was added alongside because a single long stall on the blocked connection would not move a p50"

requirements-completed: []

coverage:
  - id: D1
    description: "Region JSON Schema compile result recorded (gate input): compiles"
    requirement: SPIKE-02
    verification:
      - kind: integration
        ref: "scripts/spike/structured.live.ts (structured.regionCompile: compiles true, status 200, end_turn, required keys present, staged.attempted false)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Skill and region schemas at effort low and medium, 5 runs per cell, run 0 cold, success/stop reason/usage/call time/client end-to-end per run"
    requirement: SPIKE-02
    verification:
      - kind: integration
        ref: "scripts/spike/structured.live.ts (structured.cells: 20/20 ok, all end_turn)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Thinking-off variant (between_tools + output_config.format), 3 runs, composability recorded"
    requirement: SPIKE-02
    verification:
      - kind: integration
        ref: "scripts/spike/structured.live.ts (structured.thinkingOff 3x 200, thinkingOffComposable true)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Prompt cache read on a repeated skill prefix, and response header visibility from successful calls"
    requirement: SPIKE-02
    verification:
      - kind: integration
        ref: "scripts/spike/structured.live.ts (cache.cacheReadObserved true; headers.requestIdVisible true, retryAfterVisible not_observed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "#4954 same-connection blocking and in-flight survival across a byte-different publish, recorded"
    requirement: SPIKE-02
    verification:
      - kind: integration
        ref: "scripts/spike/extras.live.ts (extras.directCall4954.blockedLikely false; extras.publishSurvival.resultArrived true)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-09-29
status: complete
---

# Phase 39 Plan 07: Structured Outputs, Cache, Headers and Platform Extras Summary

**The hand-written region JSON Schema compiles, all 20 structured matrix calls (skill and region, effort low and medium) succeeded with end_turn, thinking-off composes with output_config.format, and a client-called procedure did not block its own connection or survive-test publishing.**

## Performance

- **Duration:** about 45 min (structured run 307 s, extras run 47 s)
- **Tasks:** 2 of 2
- **Files:** 2 created (`structured.live.ts`, `extras.live.ts`), 2 modified (`llm_spike.ts` build tag, results JSON)

## Findings recorded

**Region schema (gate input).** One probe at effort low returned HTTP 200, `stop_reason` `end_turn`, parsed JSON, all required keys present. `compiles = true`, `errorMessage` null, `staged.attempted` false. No two-schema fallback was needed, so the region cells use route `region`.

**Matrix (run 0 of each cell tagged cold, all 5 of 5 ok, all end_turn, no re-run needed):**

| Cell | Runs | OK | Client e2e ms p50 / p95 (all) | Client e2e ms p50 / p95 (no cold) | In-module call ms p50 / p95 (all) | In-module call ms p50 / p95 (no cold) | Mean output tokens |
|---|---|---|---|---|---|---|---|
| skill-low | 5 | 5 | 5267 / 12223 | 5192 / 12223 | 4752 / 6770 | 4749 / 5007 | 578 |
| skill-medium | 5 | 5 | 5277 / 7647 | 4927 / 7647 | 5055 / 7280 | 4830 / 7280 | 592 |
| region-low | 5 | 5 | 17356 / 18982 | 17333 / 18982 | 17277 / 18872 | 17186 / 18872 | 1858 |
| region-medium | 5 | 5 | 17710 / 21337 | 17710 / 21337 | 17519 / 20131 | 17519 / 20131 | 1911 |

- With 5 samples p95 is effectively the max, so these are indicative only.
- Effort low versus medium made no meaningful latency or output-token difference for either schema. Phase 43 can treat effort as a quality knob, not a latency lever, at these settings.
- Route latency is dominated by output length: skill about 5 s (about 580 tokens), region about 17 to 18 s (about 1,900 tokens). Region calls sit well inside the 150 s default timeout but are long for a scheduled procedure holding a V8 instance (relevant to Plan 08 concurrency).
- The skill-low cold run did not stand out in p50 but inflated p95 (12.2 s versus 5.0 s warm call p95).

**Thinking-off (`thinking: {type: "between_tools"}` with `output_config.format`, skill schema, effort medium, 3 runs):** all three returned 200 with parsed output. `thinkingOffComposable = true`. It is not a 400, so it is a usable variant.

**Cache pair (two back-to-back identical skill-low calls):** both calls reported `cache_read_input_tokens` 3,727 (input 116, output 562 and 598, cache write 0). `cacheReadObserved = true`. The first call of the pair already read the cache because the earlier skill cells had warmed the same prefix (5-minute ephemeral TTL), so this shows the prefix is cacheable and that consecutive procedure calls hit it; it does not show a cold write in this pair.

**Headers.** `request-id` is visible on successful 200 responses as well as the earlier 401s. `retry-after` is still `not_observed` (no 429 occurred; this is a gap to state in the record, not a "not visible" result). Successful calls additionally expose the full `anthropic-ratelimit-{requests,input-tokens,output-tokens,tokens}-{limit,remaining,reset}` family, `anthropic-organization-id`, `anthropic-workspace-id` and `traceresponse`. The merged `headerNamesSeen` keeps every name from Plan 05 (28 names in total).

**#4954 same-connection blocking.** A region-low client-called procedure was started on connection A (21.1 s end to end) and 20 pings on A were interleaved with 20 on independent connection B. A p50 110.1 ms, B p50 105.8 ms; max 248.6 ms versus 247.9 ms. `blockedLikely` false and `blockedLikelyByMax` false; B finished while the procedure was still pending (`directStillPendingWhenBDone` true). A client-called procedure does not block other reducer calls on the same connection on local 2.10.1.

**Publish survival.** A region-medium scheduled job (result 200, 19.7 s) was in flight when a byte-different `uwr-spike` publish (build tag a to b) started 3 s later.
- The publish command took 16.6 s, finishing about when the call would end: the module update appears to wait for the in-flight procedure rather than killing it.
- The result row arrived on the original connection (`resultArrived` true, `waitedMs` about 0, `resultBuildTag` `a`, so the old module instance finished the job). The job was not lost, and no reservation leaked.
- Logs show `Updated program` and `Database updated` after the call; no error lines. The CLI printed a `tsc not found in node_modules` warning during the publish, but the update was applied and no clear was requested (`clearRequested` false).
- That the new module then reports tag `b` was not separately verified after the publish (no follow-up call was made); the publish log and the changed program hash are the evidence. Plans that publish again should not assume the tag without checking.
- Consequence for Phases 40 and 41: a code publish while long generation calls are running is safe on local; expect it to be delayed by the longest in-flight call.

**Spend.** Module `spike_state` (read through the cli.mjs sql guard): 85 calls, `est_cost_micro_usd` 390,814 (about $0.39), `in_flight` 0, `reserved_micro_usd` 0. The results-file estimate before the extras run was 345,718 micro-USD; the two extras region calls account for the difference. This is about 16% of the $2.40 harness ceiling and module cap. Per call cost was about 8,500 micro-USD (skill-low), 6,900 (skill-medium), 19,500 (region-low) and 20,000 (region-medium); the region probe cost 26,000, thinking-off 29,400 for 3, the cache pair 13,600 and each of the two extras region calls about 22,000.

## Task Commits

1. Task 1: `ab09beb2` test - structured outputs, thinking-off, cache pair and headers
2. Task 2: `c829dc7f` test - #4954 same-connection blocking and publish survival (includes `SPIKE_BUILD_TAG` a to b)

## Deviations from Plan

None - plan executed exactly as written. Two small additions beyond the plan text, neither changing a required field: `extras.directCall4954` also carries `aMaxMs`, `bMaxMs`, `directStillPendingWhenBDone` and `blockedLikelyByMax`, and `extras.publishSurvival` also carries `publishOk`, `clearRequested`, `reconnected`, `originalConnectionSawRow` and `publishOutputTail`. The A and B ping loops run concurrently (each sequential inside) rather than strictly alternating, so a stall on A cannot hide B's measurements.

## Issues Encountered

- The plan's acceptance text expects `node scripts/spike/cli.mjs probe-uwr` to print `uwr clean: true`. The command actually prints `uwr spike tables: absent (unknown table (spike tables absent))` and exits 0, which is the same meaning (uwr untouched); the plan wording is stale, no code was changed.
- Vitest console output is not shown by the runner here, so the per-cell table came from `scripts/spike/out/structured-report.txt` (gitignored) and the results JSON.
- `git` warned that CRLF in `extras.live.ts` will be normalized to LF; harmless.
- Gate-count caveat from Plan 06 still applies: the cache pair and matrix cells are `class: 'reliability'`, so `gateInputFromResults` counts them together with the ladder samples. Plan 08 should apply the 30-call minimum to `ladder.reliability` alone.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the local publish of `uwr-spike` through the guarded `publishSpike()`; `probe-uwr` confirmed `uwr` still has no spike tables and the leak scan (real-key needle loaded) was CLEAN after both tasks.

## Processes

No background process was left running. The orchestrator's SpacetimeDB server (PID 14384) was reused and not touched. A backgrounded vitest run for the structured matrix (nested subshell) ran to completion and exited; no leftover.

## Self-Check: PASSED

- FOUND: scripts/spike/structured.live.ts, scripts/spike/extras.live.ts
- FOUND commits: ab09beb2, c829dc7f
- `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.results.test.ts`: 67 passed; `pnpm --dir spacetimedb test`: 700 passed
- `node scripts/spike/leak-scan.mjs --require-server`: LEAK-SCAN: CLEAN
- `spike_state`: in_flight 0, reserved_micro_usd 0
