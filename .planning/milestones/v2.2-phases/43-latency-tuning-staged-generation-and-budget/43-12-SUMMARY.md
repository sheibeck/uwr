---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 12
subsystem: api
tags: [llm, anthropic, effort-sweep, prompt-caching, latency, measurement, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: sweep harness (scripts/llm/sweep.live.ts), llm_tuning.ts record lifecycle, deriveRouteTuning, lat06Decision (43-10)
provides:
  - spacetimedb/src/data/llm_measurements.json committed with status measured (Run A, Run B, caching, classReveal)
  - "measurement record hygiene" unit tests guarding the record (status, no text or key material, cost under $5, measured-record shape)
  - LAT-06 verdict recorded as leave_out (class reveal p50 4665 ms, p95 7113 ms against a 10000 ms threshold)
affects: [43-14, 43-15]

tech-stack:
  added: []
  patterns:
    - "Paid measurement behind a blocking human checkpoint; the harness writes only counts, sizes, timings, stop reasons, pass flags and lint rule ids"

key-files:
  created: []
  modified:
    - spacetimedb/src/data/llm_measurements.json
    - spacetimedb/src/data/llm_tuning.test.ts

key-decisions:
  - "The user approved the paid sweep at the Task 2 checkpoint; exactly one Run A and one Run B were made, no re-runs"
  - "Record committed as status measured (not applied); Plan 43-14 applies the derived values"
  - "The local SpacetimeDB server was not restarted: the harness calls Anthropic directly and no Task 3 step needed a spacetime sql read"

patterns-established:
  - "A hygiene test that builds its synthetic bad records from explicit overrides, so it does not depend on the committed record's status"

requirements-completed: []  # LAT-01, LAT-02, LAT-06 measurement evidence only; standing rule: no requirements mark-complete

duration: ~25 min of wall clock for the paid runs (Run A 599.7 s, Run B 112.6 s)
completed: 2026-10-01
---

# Phase 43 Plan 12: Paid effort sweep and caching proof Summary

**108 real Claude Sonnet 5.5 calls (90 effort-sweep plus 18 caching/timing) for $0.9221 of the $5.00 cap: low effort wins or ties on all 9 routes, prompt caching works on all 9, and the class reveal is fast enough (p50 4.7 s) that parallel generation stays out (LAT-06 verdict leave_out).**

## User answer

Task 2 checkpoint (blocking, never auto-approved): the user answered **approve** (via the orchestrator's AskUserQuestion, "Approve (Recommended)"). No paid call was made before that answer (record status was still `not_run`).

## Pre-flight evidence (Task 1, no spend)

| Item | Result |
|------|--------|
| admin_llm_status key_set / key_length | true / 108 |
| harness check-key keyPresent / length / formatOk | true / 108 / true |
| Dry run | 90 Run A + 18 Run B requests built and validated, none sent |
| Worst-case reservation for the 108 requests | 3,998,458 micro-USD ($3.9985) |
| Research likely estimate | about $0.9 |
| Cap / harness stop line | $5.00 / $4.50 |

No key characters appear anywhere in this file.

## Run results

- **Calls made:** 108 (Run A 90, Run B 18). Every call ok, every stop reason `end_turn`, no `max_tokens` stop in Run A or Run B, harness never hit its stop line.
- **Total spend:** **922,050 micro-USD ($0.9221)**. Run A alone: 747,187 micro-USD ($0.7472). Against the $3.9985 worst-case bound and the roughly $0.9 research estimate: the actual cost matches the estimate.
- **Wall clock:** Run A 599.7 s, Run B 112.6 s.

### Effort sweep (Run A: 5 calls per cell, latency in ms)

Chosen effort is `low` on every route; 8 of 9 are ties (low and medium indistinguishable on pass counts), `renown_perk_gen` is a decisive win for low (medium had one tone failure). All cells: 5/5 ok, 5/5 schemaOk.

| Route | Chosen | Tie | low p50 / p95 | medium p50 / p95 | p99 out tokens | Derived max_tokens | Suggested timeout (ms) | Tone failures |
|-------|--------|-----|---------------|------------------|----------------|--------------------|------------------------|---------------|
| creation_race | low | yes | 3803 / 4700 | 2974 / 3814 | 265 | 512 | 30000 | none |
| creation_class_reveal | low | yes | 5097 / 6813 | 3803 / 4182 | 327 | 512 | 30000 | none |
| creation_class | low | yes | 4868 / 12273 | 4451 / 5153 | 465 | 768 | 50000 | none |
| world_gen_start | low | yes | 9673 / 11131 | 9192 / 10324 | 818 | 1024 | 45000 | none |
| world_gen | low | yes | 17724 / 20955 | 18835 / 20001 | 1988 | 2560 | 85000 | none |
| skill_gen | low | yes | 5833 / 6696 | 4902 / 6341 | 624 | 1024 | 30000 | none |
| renown_perk_gen | low | no | 6201 / 6920 | 5719 / 6300 | 756 | 1024 | 30000 | medium: 1 x ability_name_words |
| npc_conversation | low | yes | 3564 / 9659 | 3877 / 4424 | 379 | 512 | 40000 | low: 1 x exclamation; medium: 1 x exclamation |
| combat_narration | low | yes | 2680 / 2837 | 3088 / 3272 | 168 | 256 | 30000 | none |

Tone lint: **zero `meta_commentary` hits** across all 90 samples. The only failures were `ability_name_words` (renown_perk_gen, medium, 1 sample) and `exclamation` (npc_conversation, one sample in each effort). p95 on 5 samples equals the slowest sample; the low-effort outliers (creation_class 12273 ms, npc_conversation 9659 ms) are single slow calls, not a trend.

### Caching proof (Run B: 2 identical sequential calls per route at the derived values)

All 9 routes **pass**: call 2 has `cache_read_input_tokens > 0`; none "not cacheable", none FAILED.

| Route | Call 1 cache write / read | Call 2 cache_read_input_tokens |
|-------|---------------------------|--------------------------------|
| creation_race | 3883 / 0 | 3883 |
| creation_class_reveal | 5510 / 0 | 5510 |
| creation_class | 6038 / 0 | 6038 |
| world_gen_start | 4347 / 0 | 4347 |
| world_gen | 0 / 5007 | 5007 |
| skill_gen | 0 / 5901 | 5901 |
| renown_perk_gen | 0 / 5553 | 5553 |
| npc_conversation | 0 / 4003 | 4003 |
| combat_narration | 0 / 3631 | 3631 |

For the last five routes (and world_gen), call 1 of Run B already read the cache because Run A had warmed the same prefix within the cache lifetime; that is expected and is itself evidence the cache works across calls. Also note combat_narration Run A call 1 showed a partial hit (read 2548, write 1083).

### Class reveal and LAT-06

Post-staging class-reveal latencies (ms): 5726, 4125, 3883, 5097, 6813 (Run A low samples) and 3469, 4365 (Run B). **p50 4665 ms, p95 7113 ms against the 10000 ms threshold. LAT-06 verdict: `leave_out`; parallelBuilt false.** Parallel generation stays out of the phase.

## Task Commits

1. **Task 1: record-hygiene test and free pre-flight** - `cf27b86b` (test)
2. **Task 3: effort sweep and caching measurements** - `5c4f0abe` (chore; only `spacetimedb/src/data/llm_measurements.json`, status measured)
3. **Task 3 follow-up: hygiene test fix** - `7ebfc7a6` (fix, see Deviations)

Task 2 was the checkpoint (no commit). Plan metadata commit follows this summary.

## Verification

- `grep -cE "prompt|completion|apiKey|sk-ant" spacetimedb/src/data/llm_measurements.json` printed 0.
- `status` is `measured`; `model` is `claude-sonnet-5-5`; 9 route keys in LLM_SWEEP_ROUTES order; `totals.costMicroUsd` is 922050 (< 5,000,000); every route has a caching entry; classReveal has latencies and a verdict.
- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/llm_tuning.test.ts`: 47/47 pass (LLM_TUNING still equals the baseline because status is measured, not applied).
- Full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 68 files, 3019 tests, all pass.
- `git show --stat` of the measurement commit lists only `spacetimedb/src/data/llm_measurements.json`.
- `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hygiene test relied on the committed record being not_run**
- **Found during:** Task 3, after Run B, when the tuning test first ran on the measured record
- **Issue:** The "fails on a measured record that lacks caching entries or the model" test spread the committed record and expected "no caching entry" problems; that held only while the committed record was `not_run` (empty caching). With the real measured record the test failed (1 of 47).
- **Fix:** The synthetic record now explicitly overrides `caching: {}`, so it is independent of the committed record's state.
- **Files modified:** `spacetimedb/src/data/llm_tuning.test.ts`
- **Commit:** `7ebfc7a6` (kept separate so the measurement commit contains only the record, as the plan requires)

Otherwise the plan executed as written. No harness stop, no retries, no extra modes.

## Local server

The SpacetimeDB server started in Task 1's pre-flight had exited by Task 3 (ping refused). No Task 3 step needed a `spacetime sql` read (the harness calls Anthropic directly via `buildClaudeRequest`), so the server was not restarted. No PID to record or leave running. Nothing was published; maincloud was never touched; no git push.

## Known Stubs

None.

## Threat Flags

None (no new network endpoints, auth paths or schema changes; the sweep used the existing harness and a local key read in-process).

## Next

Plan 43-14 applies the derived values (all routes effort low, max_tokens as tabulated) from this record; the record stays `measured` until then.

## Self-Check: PASSED

- FOUND: spacetimedb/src/data/llm_measurements.json (status measured)
- FOUND commits: cf27b86b, 5c4f0abe, 7ebfc7a6
