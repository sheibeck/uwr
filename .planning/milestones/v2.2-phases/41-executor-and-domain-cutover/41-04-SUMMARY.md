---
phase: 41-executor-and-domain-cutover
plan: 04
subsystem: llm-executor-building-blocks
tags: [spacetimedb, llm, retry, scheduling, route-input, redaction, tests]
status: complete
requires:
  - phase: 41-01 (llm_limits constants, llm_dispatch and llm_sweep_tick tables)
  - phase: 40 (claude_request classifier, llm_queue serializeRequest, llm_layers buildRouteLayers)
provides:
  - "helpers/llm_retry.ts: maxAttempts, shouldRetry, retryDelayMs, deferDelayMs, deterministicJitterMs, msToMicros"
  - "helpers/llm_schedule.ts: insertLlmDispatch, hasLlmDispatch, scheduledMicros, ensureLlmSweepScheduled"
  - "helpers/llm_inputs.ts: encodeRouteInput, decodeRouteInput, ROUTE_BIGINT_PATHS, smokeInputFor, archetypeForPlayer, resolveRouteInput"
  - "claude_request.ts: ClassifyOptions { needles } on classifyClaudeResponse and classifyClaudeError; body read no longer throws"
affects: [41-05, 41-06, 41-07]
tech-stack:
  added: []
  patterns:
    - "Jitter is a pure hash of (job id, second seed): no RNG, no clock, identical inputs give identical delays"
    - "Route input snapshotted into requestJson at enqueue; bigint fields revived per declared path, never by an in-band tag"
    - "Every retry, deferral and re-dispatch inserts a NEW llm_dispatch row (the scheduler deletes the row before the procedure runs)"
key-files:
  created:
    - spacetimedb/src/helpers/llm_retry.ts
    - spacetimedb/src/helpers/llm_retry.test.ts
    - spacetimedb/src/helpers/llm_schedule.ts
    - spacetimedb/src/helpers/llm_schedule.test.ts
    - spacetimedb/src/helpers/llm_inputs.ts
    - spacetimedb/src/helpers/llm_inputs.test.ts
  modified:
    - spacetimedb/src/helpers/claude_request.ts
    - spacetimedb/src/helpers/claude_request.test.ts
key-decisions:
  - "retryDelayMs jitter is up to 20 percent of the BASE (400 ms after attempt 1, 1600 ms after attempt 2), added on top of the retry-after-derived core, so a 60 s retry-after yields 60000 plus [0, 400)"
  - "deferDelayMs jitter is [0, 250) on a 500 ms base, so the delay is always in [500, 750)"
  - "decodeRouteInput revives only declared paths (skill_gen level; eight combat_narration fields); numeric-looking strings and NPC memory stay strings (T-41-21)"
  - "encode/decode rebuild objects with Object.fromEntries, so a model-written __proto__ key stays an ordinary own key"
  - "resolveRouteInput falls back to the Phase 40 renown rebuild only for renown_perk_gen jobs that carry className and raceName; anything else throws a plain Error naming the job id"
metrics:
  tasks: 3
  files: 8
  tests_added: 87
  suite: "1704 passed (baseline 1617)"
completed: 2026-09-30
---

# Phase 41 Plan 04: Executor Building Blocks Summary

Retry and deferral timing, dispatch and sweep-tick scheduling, route-input snapshots with a golden round trip for all eight routes, and a classifier that redacts the live key in any form and cannot throw, all as pure tested modules the executor composes in Plan 41-06.

## What was built

### Task 1: retry timing and scheduling (commit 21ad219e)
- `llm_retry.ts`: `maxAttempts` is 1 for the five `LLM_NO_AUTO_RETRY_ROUTES` and 3 for the rest; `shouldRetry` is true only for a retryable failure below `maxAttempts`, so attempt 3 is always final. `retryDelayMs(1)` is 2000 + [0, 400), `retryDelayMs(2)` is 8000 + [0, 1600); a longer retry-after replaces the base, is capped at 60 s (60 s and 61 s both give 60000 + jitter), fractional seconds round up to whole ms, negative/NaN/infinite retry-after is ignored. `deferDelayMs` is 500 + [0, 250). `msToMicros` rounds up and floors at 0. No `Math.random`, no `Date.now`.
- `llm_schedule.ts`: `insertLlmDispatch` (with `ScheduleAt.time`), `hasLlmDispatch`, `scheduledMicros`, and `ensureLlmSweepScheduled` (one tick 30 s out only when the table is empty; second call returns false and leaves one row).
- 33 tests: every boundary in the plan, plus determinism, bigint attempt, later attempts clamping to the last base, and recorded-schema column check of the dispatch row.

### Task 2: route-input snapshots (commit 4b73f919)
- `encodeRouteInput` (bigint to decimal string, deep copy), `ROUTE_BIGINT_PATHS` (frozen; `skill_gen` level and the eight combat fields), `decodeRouteInput` (per-path revival), `smokeInputFor` (fixed neutral inputs for all eight routes), `archetypeForPlayer` ('mystic' from creation state, else 'warrior'), `resolveRouteInput` (snapshot, smoke, or the Phase 40 renown rebuild; otherwise `Error('llm job <id> has no route input')`).
- 42 tests: golden round trip for all eight routes (volatile and route block byte-identical to the direct build, with emoji, a fake closing tag, JSON-looking player text, bigint combat and NPC memory), bigint typing, numeric-looking strings staying strings, malformed snapshots not throwing, deep-copy independence, and every `resolveRouteInput` branch.

### Task 3: needle-aware, never-throwing classification (commit 3cbf78fa)
- `ClassifyOptions { needles }` is the optional third parameter of `classifyClaudeResponse` and second of `classifyClaudeError`, threaded through `safeMessage` (redact, then surrogate fix, then code-point cap), `fail` and `classifyHttpFailure` (IN-04).
- The body read is wrapped: a throwing `text()` returns `{ ok: false, class: 'network', retryable: true, httpStatus }` with a redacted message (IN-03).
- 12 new tests using a 24-character needle with no key prefix, built from fragments: with needles the message stores none, without needles it does (why the executor passes the key), thrown-error and refusal-explanation paths, short needles ignored, key pattern still redacted, and read-failure shapes including non-Error throws. Every existing case passes unchanged; the source-purity test (four allowed imports) still holds because no import was added.

## Deviations from Plan

None to the plan's substance.

Process notes:
- Tests and implementation were written together and committed as one `feat` commit per task (plan type is `execute`, not `tdd`), the same as Plans 41-01 to 41-03.
- Commits use this harness's own attribution trailer (Claude Sonnet 5.5 plus the Claude-Session line), as directed.

## Known Stubs
None. The three new modules have no callers yet by design; Plans 41-05 (enqueue), 41-06 (executor) and 41-07 (sweeper) wire them in.

## Threat Flags
None beyond the plan's threat model. T-41-01 (key echo), T-41-05 (runaway retries: attempt cap, 2 s floor, 60 s cap) and T-41-21 (model-written memory reinterpreted as bigint) are mitigated and covered by tests. No new network endpoint, auth path or schema change.

## Notes for later plans
- The executor must pass the live key as a needle: `classifyClaudeResponse(route, res, { needles: [key] })` and `classifyClaudeError(err, { needles: [key] })`.
- Pass the dispatch row's `scheduledId` as the `seed` of `deferDelayMs`, and the job id to `retryDelayMs`.
- Plan 41-05 must enqueue with `request: { input: encodeRouteInput(input), ... }` so `resolveRouteInput` finds the snapshot; smoke jobs enqueue `{ smoke: true }`.
- `resolveRouteInput` throws a plain Error when a job has no usable input; the executor should catch it and fail the job as non-retryable.
- No publish was run; nothing touched maincloud; `.env.local` was never read.

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/llm_retry.ts, llm_retry.test.ts, llm_schedule.ts, llm_schedule.test.ts, llm_inputs.ts, llm_inputs.test.ts
- FOUND commits: 21ad219e, 4b73f919, 3cbf78fa
- Acceptance greps: `Math.random|Date.now` 0 in llm_retry.ts and llm_schedule.ts; `ScheduleAt.time(` 2 in llm_schedule.ts; forbidden imports 0 in llm_inputs.ts; `buildRouteLayers` 5 in llm_inputs.test.ts; `ClassifyOptions` 3 and `needles` 15 in claude_request.ts
- Full suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` 1704 passed (baseline 1617)
