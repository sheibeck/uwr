---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 14
subsystem: api
tags: [llm, tuning, max-tokens, effort, prompt-caching, lat-06, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: llm_measurements.json with status measured (43-12), deriveRouteTuning and lat06Decision (43-10)
provides:
  - LLM_TUNING literals equal to deriveRouteTuning over the committed record (9 routes tuned, smoke_test not swept)
  - llm_measurements.json status applied
  - "tuning end state" tests (terminal status, parallelBuilt rule, tuned-route provenance, caching outcome)
  - LAT-06 decision recorded: leave_out, parallel archetype generation not built
affects: [43-15]

key-files:
  created: []
  modified:
    - spacetimedb/src/data/llm_tuning.ts
    - spacetimedb/src/data/llm_tuning.test.ts
    - spacetimedb/src/data/llm_measurements.json
    - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
    - spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
    - spacetimedb/src/helpers/claude_request.test.ts

key-decisions:
  - "Tuned values were copied only from deriveRouteTuning output (printed by a throwaway test, then deleted); no hand-picked numbers"
  - "Low effort kept on all 9 routes (8 ties resolve to low, renown_perk_gen decisive)"
  - "LAT-06: leave_out, parallel class generation not built"

requirements-completed: []

metrics:
  completed: 2026-10-01
---

# Phase 43 Plan 14: Apply measured tuning, caching check, LAT-06 decision Summary

LLM_TUNING now runs on the values derived from the committed measurement record (status applied): low effort everywhere, max_tokens cut from 1024-8192 down to 256-2560, and the LAT-06 parallel-class build is recorded as leave_out (class reveal p50 4665 ms).

## Per-route tuning

Derived max_tokens = nearest-rank p99 x 1.25 rounded up to 256 (floor 256). Timeouts stay at baseline.

| Route | Baseline effort / max_tokens | Final effort / max_tokens | Status | p99 output tokens | Samples | Tie |
|---|---|---|---|---|---|---|
| creation_race | low / 4096 | low / 512 | tuned | 265 | 10 | yes |
| creation_class_reveal | low / 2048 | low / 512 | tuned | 327 | 10 | yes |
| creation_class | low / 4096 | low / 768 | tuned | 465 | 10 | yes |
| world_gen_start | low / 4096 | low / 1024 | tuned | 818 | 10 | yes |
| world_gen | low / 8192 | low / 2560 | tuned | 1988 | 10 | yes |
| skill_gen | low / 4096 | low / 1024 | tuned | 624 | 10 | yes |
| npc_conversation | low / 1024 | low / 512 | tuned | 379 | 10 | yes |
| combat_narration | low / 1024 | low / 256 | tuned | 168 | 5 | yes |
| renown_perk_gen | low / 2048 | low / 1024 | tuned | 756 | 10 | no (decisive) |
| smoke_test | low / 256 | low / 256 | not_swept | n/a | 0 | n/a |

9 routes have status tuned. All match the cross-check values in the plan prompt. `llm_routes.ts` is unchanged (values flow only through LLM_TUNING).

## Caching (LAT-02)

All 9 swept routes passed the caching proof (call 2 read cached tokens; none recorded notCacheable). Call-2 cache read tokens: creation_race 3883, creation_class_reveal 5510, creation_class 6038, world_gen_start 4347, world_gen 5007, skill_gen 5901, renown_perk_gen 5553, npc_conversation 4003, combat_narration 3631. (On world_gen, skill_gen, renown_perk_gen, npc_conversation and combat_narration the prefix was already cached when call 1 ran, so call 1 itself read from cache.)

## LAT-06 decision

Verdict leave_out. Post-staging creation_class_reveal over 7 recorded latencies (each plus a 300 ms dispatch allowance in the decision): p50 4665 ms and p95 7113 ms as recorded, against the 10,000 ms threshold. Parallel archetype class generation is not built (parallelBuilt false).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] llm_apply characterization snapshots reflect the new max_tokens**
- **Found during:** Task 1, plan-level full suite
- **Issue:** 4 snapshot tests in llm_apply.characterization.test.ts failed because the creation_class budget reservation (reservedMicroUsd) is derived from max_tokens, which dropped from 4096 to 768.
- **Fix:** Updated the snapshot with `-u` (path before `-u`), then reviewed the diff: only `reservedMicroUsd` lines changed (12 lines, same keys, lower values). No test logic changed.
- **Files modified:** spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
- **Commit:** 5e04e7ec

**2. [Rule 1 - Bug] Pinned 4096 in a claude_request mutation test**
- **Found during:** Task 1
- **Issue:** "mutating a returned body does not change the next one" asserted `LLM_ROUTES.skill_gen.maxTokens === 4096`, a stale tuning value. Its intent is that the route table is not mutated.
- **Fix:** Capture `maxTokensBefore` before the mutation and assert equality with it afterward (same intent, no pinned tuning number).
- **Files modified:** spacetimedb/src/helpers/claude_request.test.ts
- **Commit:** 5e04e7ec

claude_request snapshot update (9 snapshots): only `max_tokens` lines differed (effort stayed low), as the plan expected.

## Verification

- `src/data/llm_tuning.test.ts`, `llm_routes.test.ts`, `claude_request.test.ts`: 341 passed
- Task 1 RED confirmed (tuning end state failed on status measured), then green after applying
- Full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 68 files, 3106 tests passed
- `spacetime build -p spacetimedb`: build finished successfully (no publish, generate or call run)
- Acceptance node checks: status in applied/declined/deferred, verdict leave_out with parallelBuilt false, 9 of 9 caching entries pass

## Known Stubs

None.

## Self-Check: PASSED

- llm_tuning.ts, llm_tuning.test.ts, llm_measurements.json present and committed in 5e04e7ec
- Commit 5e04e7ec exists
