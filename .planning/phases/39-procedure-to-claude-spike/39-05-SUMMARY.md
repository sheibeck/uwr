---
phase: 39-procedure-to-claude-spike
plan: 05
subsystem: testing
tags: [spacetimedb, dispatch, latency, baseline, drills, headers, sender]

requires:
  - phase: 39-04
    provides: uwr-spike published, harness core (runSequential, pingLoop, collectTicks, resetProbe), ResultsStore, leak scan
provides:
  - free.live.ts (rung 1, dispatch, sender, push legs, drills, headers) and baseline.live.ts (idle window)
  - measureIdleWindow in the harness
  - results sections ladder.publicUrl, dispatch, sender, pushLegs, drills, headers, load.baseline, load.levels (empty), load.memory, serverLogs[free]
affects: [39-06, 39-07, 39-08, 39-09, 39-10]

tech-stack:
  added: []
  patterns:
    - "Raw per-job facts that CallSample drops (senderHex, isModuleIdentity, hasConnectionId) are read from the harness result map (s.results) by runId, not from the sample"
    - "SPIKE_WINDOW_LABEL selects the results slot for measureIdleWindow (baseline, or load.<label> for any other label)"

key-files:
  created:
    - scripts/spike/free.live.ts
    - scripts/spike/baseline.live.ts
  modified:
    - scripts/spike/harness.ts
    - .planning/phases/39-procedure-to-claude-spike/39-spike-results.json

key-decisions:
  - "Dispatch and burst noop samples keep class 'reliability' exactly as the plan specifies; see Issues Encountered for the gate-count caveat"
  - "headers.requestIdVisible / retryAfterVisible / headerNamesSeen are derived from the two bad-key drill samples (real Anthropic 401 responses)"

requirements-completed: []

coverage:
  - id: D1
    description: "Rung 1 (10 public-URL fetches), 50 sequential no-op dispatches plus an 8-job burst, and 50 echo push legs recorded at zero spend"
    requirement: SPIKE-01
    verification:
      - kind: integration
        ref: "scripts/spike/free.live.ts (count assertions, all 10/50/8/50 present)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ctx.sender inside a scheduled procedure vs a client-called one, both recorded"
    requirement: SPIKE-03
    verification:
      - kind: integration
        ref: "scripts/spike/free.live.ts (sender.scheduled, sender.direct)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Forced-timeout and bad-key drill shapes plus response header visibility recorded"
    requirement: SPIKE-02
    verification:
      - kind: integration
        ref: "scripts/spike/free.live.ts (drills.timeout, drills.badKey, headers)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Idle baseline with >= 1000 pings and >= 55 ticks, inFlight 0, server PID recorded"
    requirement: SPIKE-03
    verification:
      - kind: integration
        ref: "scripts/spike/baseline.live.ts; node scripts/spike/leak-scan.mjs --require-server prints LEAK-SCAN: CLEAN"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-29
status: complete
---

# Phase 39 Plan 05: Free Measurements and Idle Baseline Summary

**Rung 1, server-side dispatch latency (p95 15.9 ms over 50 no-ops), ctx.sender findings, both failure shapes with header visibility, and a 1091-ping / 106-tick idle baseline are recorded at zero spend against `uwr-spike`.**

## Performance

- **Duration:** about 20 min (the baseline run alone took 114 s)
- **Tasks:** 2 of 2
- **Files:** 2 created (`free.live.ts`, `baseline.live.ts`), 2 modified (`harness.ts`, results JSON)

## Findings recorded

- **Rung 1 (public URL):** 10 of 10 returned 200 on the first attempt, so no re-run was needed. In-module call time was about 100 to 180 ms per fetch, with the first (cold) fetch at about 960 ms.
- **Dispatch latency (server-side, first withTx timestamp minus scheduledAt), 50 sequential no-ops:** p50 15.4 ms, p95 15.9 ms, max 21.2 ms, far under the 250 ms gate. The `ctx.timestamp` cross-check (`ctxLateUs`) is not identical to `scheduledAt`: the first sample was 2.7 ms and the rest about 14 to 15 ms (RESEARCH A6 does not hold as a "zero" value, but the first-withTx metric is the gate metric anyway).
- **Burst of 8 simultaneous no-ops:** dispatch lateness 10.3, 10.8, 11.2, 11.5, 11.9, 174.5, 227.5 and 265.6 ms. Concurrent scheduled jobs serialize; the last of eight waited about 265 ms. This is a supplementary sample, not a gate input, but it is relevant to the concurrency levels in Plan 08.
- **ctx.sender:**
  - Scheduled procedure: `senderHex` equals the database identity (`c200b98f...49f4`), `isModuleIdentity` true, `hasConnectionId` false, not the caller's identity, usable (non-empty, non-zero).
  - Client-called procedure: sender is the harness identity, `isModuleIdentity` false, `hasConnectionId` true.
  - Consequence for Phase 41: inside a scheduled procedure `ctx.sender` is the module itself, so the requesting player must travel in the job row, never be inferred from `ctx.sender`.
- **Push legs:** echo reducer call to row visible p50 17.5 ms, p95 41.2 ms (50 samples). No-op procedure enqueue to result visible (client E2E over the 50 dispatches) p50 39.6 ms.
- **Timeout drill (2 runs, 50 ms):** `ctx.http.fetch` **throws** (it does not return an error response). Message: `error sending request for url (https://api.anthropic.com/v1/messages): operation timed out`, failure class `platform`, no status.
- **Bad-key drill (2 runs):** fetch **returns** HTTP 401, Anthropic error type `authentication_error`, message `invalid x-api-key`, failure class `auth`.
- **Headers:** `request-id` is visible on the procedure's `SyncResponse`; `retry-after` was `not_observed` (a 401 does not carry it, so this needs a 429 to confirm; Plan 08 record should say so). Header names seen: cf-cache-status, cf-ray, connection, content-security-policy, content-type, date, request-id, server, strict-transport-security, transfer-encoding, vary, x-robots-tag, x-should-retry.
- **Idle baseline (`load.baseline`, server PID 14384, nothing in flight):** 1091 pings, p50 71.2 ms, p95 213.1 ms, max 516.0 ms; 106 tick-lateness samples, p50 8.4 ms, p95 12.9 ms, max 15.7 ms. Memory snapshot: working set 292.4 MB, 32 threads.
  - The ping numbers are about 5 times higher than the Plan 04 smoke (p50 13.2 ms, p95 30.1 ms). The window was steady across all 1091 pings (per-100 medians 56 to 109 ms), not one burst, so it looks like ambient machine load plus the tick probe being on, not a fault. The gate is a ratio to this baseline, but the wide idle p95 makes the 2x ping ratio easy to pass; Plan 08's noise-floor and floor-adjusted verdict already exist for exactly this.

## Task Commits

1. Task 1: `e2e31493` test - rung 1, dispatch, sender, push legs, drills, headers
2. Task 2: `2b3a51e8` test - measureIdleWindow and the idle baseline

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Reliability count caveat for the gate (not changed here):** the plan (and the Plan 02 spec examples) give the public-URL and no-op dispatch samples `class: 'reliability'`. `gateInputFromResults` counts every `reliability` sample in `collectCallSamples`, so these 10 + 58 free samples inflate `reliability.calls` above the "at least 30 reliability calls" minimum even before any paid call runs. Plan 08 should either require the 30 minimum on the paid ladder (`ladder.reliability`) alone or reclassify the no-op samples before evaluating the strict verdict.
- The vitest console output of live files is not shown by the runner in this environment; values above were read from the results JSON.

## Known Stubs

None.

## Threat Flags

None. Only free kinds ran (noop, public_url, bad-key and timeout drills using the non-key BAD_KEY_VALUE). No real key exists; `llm_config` still holds the canary. `leak-scan.mjs --require-server` printed `LEAK-SCAN: CLEAN` after each task, and `pnpm --dir spacetimedb test` (700 tests) and `measurement.results.test.ts` (67 tests) pass.

## Processes

No background process was started by this plan. The orchestrator's SpacetimeDB server (PID 14384) is still listening on 127.0.0.1:3000 and was not touched.

## Self-Check: PASSED

- FOUND: scripts/spike/free.live.ts, scripts/spike/baseline.live.ts, measureIdleWindow in scripts/spike/harness.ts
- FOUND commits: e2e31493, 2b3a51e8
