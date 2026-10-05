---
phase: 44-live-verification-and-tone-eval
plan: 02
subsystem: testing
tags: [llm, failure-drills, executor, sweeper, qual-03, vitest]
requires:
  - phase: 41-executor-and-domain-cutover
    provides: runLlmJob, claimLlmJob, sweepLlmJobs, applyLlmFailure
  - phase: 43-latency-tuning-and-budget
    provides: kill switch, global ceiling, staged creation and world-gen routes
provides:
  - Unified QUAL-03 failure-drill matrix over the real failure apply (offline, free)
  - Edge-family pins (boundary, adjacency, empty, ordering, precision) for the failure paths
affects: [44-06 live drills, phase 44 verification]
tech-stack:
  added: []
  patterns: [describe.each class x route matrix, events-mock line recording, source-pinned inline literals]
key-files:
  created:
    - spacetimedb/src/helpers/llm_failure_drills.test.ts
  modified: []
key-decisions:
  - "Leak pattern uses whole-word matches so the in-voice word narrate is not flagged as rate"
  - "Inline apply-layer lines are declared once in the test and pinned against llm_apply.ts source, since importing them needs a production export"
patterns-established:
  - "Failure drills run the real applyLlmFailure through a call-through spy and read lines from the events mock"
requirements-completed: []
duration: 55min
completed: 2026-10-05
status: complete
---

# Phase 44 Plan 02: Failure Drills Summary

**One 364-test file drills 7 failure classes across every lock-holding and non-lock LLM route through the real executor and real failure apply, plus the five QUAL-03 edge families, with no production change.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2
- **Files:** 1 created (`spacetimedb/src/helpers/llm_failure_drills.test.ts`)

## Accomplishments

- Matrix: truncation, refusal, 401, 429, 529, provider spend cap and timeout, each against creation_race, creation_class_reveal, creation_class, world_gen_start and world_gen. Each case asserts status and error code, the lock's failure state, exactly one in-voice line to the right player, one HTTP call, zero dispatch rows, exact bigint money and the call-log row.
- Local stops (kill switch, global ceiling) on all five lock routes: one resting line, lock released, full refund, no call; the line is identical for both causes.
- Non-lock routes (npc_conversation, skill_gen, renown_perk_gen, combat_narration): transient classes retry once then end terminal after 3 attempts with one line and one refund; others end at once; narration stays silent; renown still delivers the static options.
- Edge families: spend cap at ceiling minus 1, equal, plus 1 (enqueue and claim gates, using the job's own reservation); timeout at exactly the route timeout and 1 ms over, sweeper at timeout plus grace and 1 micro later on all five lock routes; retry-after 59, 60, 61 and huge; kill switch plus ceiling at once; provider 429 cap at exactly the local limit; sweeper racing a late 429; 4 statuses x 7 empty or malformed body variants, empty 200s, empty thrown message; three jobs in one sweep or claim pass in three orders with identical normalised end state; amounts beyond float range (2^53+1) stay exact.
- Leak and Keeper-pronoun checks run over every recorded player line and the public world-gen error message, with mutation checks proving the patterns can fail.

## Task Commits

1. **Task 1: drill matrix** - `64a75daf` (test)
2. **Task 2: edge families** - `cc14deec` (test)

## Verification

- `llm_failure_drills.test.ts` 364 passed; with `llm_sweeper.test.ts` 428 passed; `llm_executor.test.ts` + `llm_sweeper.test.ts` 173 passed unchanged. All with `--maxWorkers=1`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test correction] Leak pattern made whole-word**
- **Issue:** the plan's substring pattern would flag "narrate" (contains "rate") in the in-voice refusal line.
- **Fix:** word-boundary match; mutation tests prove it still flags "rate limit", "HTTP 529", "Claude", "key" and so on.

**2. [Plan intent] Four inline lines are declared in the test, not imported**
- The creation flicker, world-start failure, skill failure and renown fallback lines are literals inside `llm_apply.ts` (no export, and no production change is allowed). They are declared once and a test pins each verbatim against the source, so drift fails.

**3. [Test correction] Empty-usage 200 replies**
- A 200 with usage but no usable content is a billed failure by design, so the player is charged the real reported cost (not zero). The assertion was corrected to expect exactly that cost, and zero only when no usage was reported.

## Findings (no production defect found)

- A sweeper-expired job whose late reply is a 429 (unbilled) keeps the conservative reservation charge on the ledger (swap happens only when usage is present). This is the safe direction; recorded for awareness, not changed.
- The truth "reserved equals charged plus released" holds as the player's held figure moving from R to the charge (billed cost never exceeded the reservation in any drilled case).
- No double refund, double line or stranded lock was found in any case.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- File exists: `spacetimedb/src/helpers/llm_failure_drills.test.ts`; commits `64a75daf` and `cc14deec` exist.
- QUAL-03 is not marked complete: it also needs the live drills in Plan 44-06.
