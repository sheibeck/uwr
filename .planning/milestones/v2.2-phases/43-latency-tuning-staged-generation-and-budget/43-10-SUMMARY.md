---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 10
subsystem: api
tags: [llm, tuning, sweep, measurement, vitest, claude, caching]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: ten-route table, stage-1 and stage-2 schemas and route blocks (43-04); route registries and staged routes (43-05)
provides:
  - llm_tuning.ts with LLM_TUNING, LLM_ROUTE_BASELINES, LLM_SWEEP_ROUTES, LLM_SWEEP_EFFORTS and the pure derivation rules (tunedMaxTokens, samplePasses, chooseEffort, p99Samples, suggestedTimeoutMs, deriveRecordFields, deriveRouteTuning, lat06Decision)
  - llm_measurements.json committed with status not_run and a fixed key order
  - LLM_ROUTES reading effort, maxTokens and timeoutMs from LLM_TUNING
  - sweep_rules.mjs (toneLint with meta_commentary, structuralCheck, cacheVerdict, shouldStopSweep, buildMeasurementRecord, resolveSweepMode) and sweep_fixtures.mjs (five fixtures per swept route plus the stage-2 builders)
  - sweep.live.ts, a dry-by-default harness with check-key, Run A and Run B modes
affects: [43-12, 43-13, 43-14, 43-15]

tech-stack:
  added: []
  patterns:
    - "One tuning table feeds the route table; a traceability test binds every entry to the committed measurement record or to the no-data derivation"
    - "The derivation rules live once, in llm_tuning.ts; the harness imports them (no copy)"
    - "A paid harness is dry by default and guarded by static source tests (one scrubbing print helper, key read only in named branches, one write path)"

key-files:
  created:
    - spacetimedb/src/data/llm_tuning.ts
    - spacetimedb/src/data/llm_tuning.test.ts
    - spacetimedb/src/data/llm_measurements.json
    - scripts/llm/sweep_rules.mjs
    - scripts/llm/sweep_rules.test.mjs
    - scripts/llm/sweep_fixtures.mjs
    - scripts/llm/sweep.live.ts
  modified:
    - spacetimedb/src/data/llm_routes.ts
    - spacetimedb/src/data/llm_routes.test.ts

key-decisions:
  - "Effort is chosen by passing-sample count; equal counts (including both 5 of 5) pick low and record tie true"
  - "deriveRecordFields is the single source of every derived record field; the harness record builder, deriveRouteTuning and the traceability test all call it"
  - "A route that is insufficient data (no record, fewer than 5 successful samples in the chosen cell, or a Run B max_tokens stop) returns the baseline with samples 0, p99 null and tie false"
  - "Timeouts stay at baseline for every route; the record keeps a suggested timeout for information only"
  - "An empty SWEEP_LIVE_RUN is treated as unset (dry); any other unlisted value throws before anything else"
  - "The harness writes the record in a finally block, so a crash mid-run keeps every paid sample and the running spend"
  - "A timeout or transport failure charges the reservation to the running spend (billing unknown, never under-count)"

patterns-established:
  - "Static guards over a harness source: balanced-parenthesis extraction of every say(...) call, interpolation names checked against a deny list, function bodies extracted by brace matching"

requirements-completed: []  # LAT-01, LAT-02, LAT-06 data and harness half only; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "Every route's effort, max_tokens and timeout come from LLM_TUNING, and each LLM_TUNING entry equals the value derived from llm_measurements.json (status applied) or the no-data baseline derivation (any other status)"
    requirement: LAT-01
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_tuning.test.ts#traceability: llm_measurements.json"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/data/llm_routes.test.ts#LLM_ROUTES"
        status: pass
    human_judgment: false
  - id: D2
    description: "max_tokens is the nearest-rank p99 x 1.25 rounded up to a multiple of 256 with a floor of 256; ties go to the lower effort and are recorded; thin or truncated data keeps the baseline and says insufficient data; the LAT-06 verdict is a pure function of recorded latencies (build only when the p50 is over 10,000 ms)"
    requirement: LAT-06
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_tuning.test.ts#tunedMaxTokens, #chooseEffort, #p99Samples, #deriveRouteTuning, #lat06Decision"
        status: pass
    human_judgment: false
  - id: D3
    description: "The sweep's tone lint (including meta_commentary on the raw reply), structural checks, cache verdict, spend stop at 4,500,000 micro-USD and whitelisted record builder are pure and tested; five fixtures exist per swept route and each builds a valid request"
    requirement: LAT-02
    verification:
      - kind: unit
        ref: "scripts/llm/sweep_rules.test.mjs"
        status: pass
    human_judgment: false
  - id: D4
    description: "The harness makes no network call and reads no key unless SWEEP_LIVE_RUN names a paid run or the key check; its default mode is a dry run that builds 90 Run A and 18 Run B requests and writes nothing"
    requirement: LAT-02
    verification:
      - kind: unit
        ref: "scripts/llm/sweep_rules.test.mjs#the sweep harness source"
        status: pass
      - kind: other
        ref: "pnpm exec vitest run --config scripts/llm/vitest.live.config.ts sweep (SWEEP_LIVE_RUN unset)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The paid code paths (Run A, Run B, key read, network call) are written and statically guarded but have never executed; they run for the first time in Plan 43-12 after the user approves"
    verification: []
    human_judgment: true
    rationale: "A paid run cannot be exercised without spending; the standing rule for this plan allows only the dry mode, so the paid branches are verified by source guards and review until the approved run"
---

# Phase 43 Plan 10: Tuning Module and Sweep Harness Summary

**One tuning table now feeds the route table, proven by test to trace to a committed measurement record (status not_run, baselines kept), and a dry-by-default sweep harness can run the paid effort sweep and caching proof only when told to. No real call was made.**

## Performance

- **Duration:** about 30 min
- **Completed:** 2026-09-30
- **Tasks:** 3 of 3
- **Files:** 7 created, 2 modified

## Accomplishments

- `llm_tuning.ts` holds the baselines, the frozen `LLM_TUNING` table and the pure rules. `LLM_ROUTES` builds every route from `LLM_TUNING[name]`, so the existing `claude_request` snapshots are unchanged (every route still uses its baseline).
- `llm_measurements.json` is committed with `status: "not_run"`, nine routes in sweep order, efforts low then medium, and no text fields. The traceability test binds `LLM_TUNING` to it by status, and re-derives the record's own fields.
- `sweep_rules.mjs` carries the tone lint (11 rule ids, including `meta_commentary` on the raw reply, built from the leaked self-correction in commit 41a68823), structural checks per route, the cache verdict (512-token minimum), the $4.50 stop line and the whitelisting record builder. The derivation is imported from `llm_tuning.ts`, not copied.
- `sweep_fixtures.mjs` has exactly five inputs for each of the nine swept routes (stage-2 routes as static fallbacks, narration as victory and defeat outros with a lone character and a party), plus `worldFillInputFrom` and `classFillInputFrom`.
- `sweep.live.ts` has four modes (dry, check-key, A, B). Dry builds and validates every request, asserts byte-stable bodies, stubs fetch to throw, never reads the key and writes nothing.

## Dry run (shown by Plan 43-12 at its checkpoint)

Command: `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts sweep` with `SWEEP_LIVE_RUN` unset.

- **Requests built and validated, none sent:** 90 Run A (9 routes x 2 efforts x 5 fixtures) and 18 Run B (9 routes x 2 calls) = 108.
- **Worst-case reservation total:** 3,998,458 micro-USD ($3.9985). This is an upper bound that charges every call at its full `max_tokens` and the whole input at the cache-write price. It is under the $4.50 stop line even in that worst case.
- **Research estimate for the real spend:** about $0.9 (plausible $0.5 to $1.5) against the $5 cap and $4.50 stop line.
- `git status --porcelain spacetimedb/src/data/llm_measurements.json` printed nothing after the dry run.

## Task Commits

1. **Task 1 (RED): failing tests for the tuning module and traceability** - `9716a5bb` (test)
2. **Task 1 (GREEN): tuning module, initial record, route table reading the tuning** - `50ee237f` (feat)
3. **Task 2: pure sweep rules and fixtures** - `525d71a0` (feat)
4. **Task 3: dry-by-default sweep harness and static guards** - `c69ad464` (feat)

## Verification

- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/llm_tuning.test.ts src/data/llm_routes.test.ts src/data/llm_limits.test.ts src/helpers/claude_request.test.ts`: 4 files, 337 tests passed.
- `src/data/model_literals.test.ts` and `src/data/pronoun_rules.test.ts`: passed (no model literal outside `llm_models.ts`, only the executor reaches fetch).
- `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/sweep_rules.test.mjs`: 93 passed, none skipped (the harness guards ran against the real file).
- Plan-level gate `CI=true pnpm exec vitest run --maxWorkers=1`: 68 files, 2,989 tests passed.
- `spacetime build -p spacetimedb`: build finished successfully (the existing "tsc not found" notice is unchanged). Nothing was published, called or generated.

## Decisions Made

See `key-decisions` above. The two worth a second look at verify time: pooling uses an epsilon of 1e-9 so means exactly 15 percent apart still pool (100 vs 85 pools, 100 vs 84 does not), and a route whose chosen cell has 5 successful samples but a Run B call that stopped at `max_tokens` falls back to the baseline instead of shipping a cap that already truncated.

## Deviations from Plan

**1. [Process] Task 2 had no separate RED commit.**
- **Found during:** Task 2
- **Issue:** The pure rules and their test file were written in the same pass, so the tests passed on first run and there is no failing-test commit for Task 2. Task 1 did have a RED commit (`9716a5bb`, module missing).
- **Fix:** None needed for correctness; the 93 cases cover the full behavior list and the static guards later ran against the real harness. Noted here for the TDD record (the plan is `type: execute`, so no plan-level gate applies).

**2. [Rule 3 - Blocking] Backspace characters in the test file.**
- **Found during:** Task 3
- **Issue:** A scripted edit wrote `\b` as a backspace byte into two regexes of `sweep_rules.test.mjs`, so two guards found nothing. Caught because a guard asserted at least 6 `say(` calls and got 0.
- **Fix:** Replaced the control characters with real `\b` escapes; confirmed none remain in any new file.
- **Commit:** `c69ad464`

**3. [Rule 2 - Safety] Record written in a finally block.**
- **Found during:** Task 3 desk check
- **Issue:** The plan writes the record after the loops; a crash mid-run would lose paid samples and the running spend.
- **Fix:** Run A and Run B write the record in `finally`. Not exercised (paid paths cannot run in this plan), covered by review.
- **Commit:** `c69ad464`

No other deviations. No architectural changes.

## Known Stubs

None. `LLM_TUNING` entries are intentionally the baseline (status `insufficient_data`, smoke_test `not_swept`) until Plan 43-14 applies a measurement; the traceability test makes that state explicit rather than hiding it.

## Threat Flags

None. No new network endpoint, auth path or schema; the harness lives under `scripts/llm`, outside the `spacetimedb/src` fetch guard.

## Issues Encountered

- The paid branches (Run A, Run B, the network call, the key read) are untested by execution on purpose. They are covered by TypeScript checking of the harness file, the static source guards and review. Plan 43-12 is their first real run; the user should expect to watch the first few scrubbed lines before letting it continue.
- `spacetimedb` `tsc --noEmit` reports errors in files this plan did not touch (`combat.ts`, `corpse.ts`, `location.ts` and their tests); none are in `llm_tuning.ts` or `llm_routes.ts`.

## Next Phase Readiness

Plan 43-12 can show the dry-run numbers above at its approval checkpoint and then run `SWEEP_LIVE_RUN=A`, then `B`, always with the `sweep` filter. Plan 43-14 rewrites the `LLM_TUNING` literals from the record (status `applied`); the traceability test already enforces that the values match `deriveRouteTuning`.

## Self-Check: PASSED

- Files: llm_tuning.ts, llm_tuning.test.ts, llm_measurements.json, llm_routes.ts, llm_routes.test.ts, sweep_rules.mjs, sweep_rules.test.mjs, sweep_fixtures.mjs, sweep.live.ts all present.
- Commits `9716a5bb`, `50ee237f`, `525d71a0`, `c69ad464` present in git history.
