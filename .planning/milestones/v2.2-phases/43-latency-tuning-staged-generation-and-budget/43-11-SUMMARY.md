---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 11
subsystem: api
tags: [spacetimedb, llm, world-generation, sweeper, explore, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: retryWorldFill, failWorldFill, WORLD_FILL_FAILED_MESSAGE, WORLD_FILL_RETRY_LINE, FILLING and FILL_ERROR states, world_gen_start and world_gen routes (43-08)
provides:
  - releaseStrandedLocks releases a stranded FILLING lock to the playable FILL_ERROR through failWorldFill
  - world_gen_start counted as the holder of PENDING/GENERATING; world_gen as the holder of FILLING
  - explore calls retryWorldFill before the uncharted check (busy, started, refused, none)
  - reducer-level tests for retry, patience, resting, travel and keep-playing, plus an end-to-end fail-then-retry-then-complete flow
affects: [43-13, 43-14, 43-15]

tech-stack:
  added: []
  patterns:
    - "Two lock-holder sets in the sweeper: stage 1 jobs hold PENDING/GENERATING, stage 2 jobs hold FILLING"
    - "A stranded stage-2 lock degrades to FILL_ERROR (playable), never to ERROR; only the player's explore re-enqueues a fill"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/llm_sweeper.ts
    - spacetimedb/src/helpers/llm_sweeper.test.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts

key-decisions:
  - "The sweeper keeps two holder sets (world_gen_start for PENDING/GENERATING, world_gen for FILLING) instead of one merged set, so a stray world_gen job cannot hold a stage-1 state and a stage-1 job cannot hold a FILLING state"
  - "travel.ts is unchanged: its uncharted trigger never fires on a converted passage, proven by tests"
  - "A refused retry posts nothing in intent.ts; failWorldFill already posts the resting or refusal line"

patterns-established:
  - "Sweeper source guard: llm_sweeper.ts contains no startWorldFill, retryWorldFill or enqueueLlmJob call"

requirements-completed: []  # LAT-03 server half only; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "A FILLING state with no active world_gen job for more than 60 s becomes FILL_ERROR (never ERROR) with the failed message, vendor and banker at the start location, one line and its stage-1 rows kept; the sweeper never retries"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_sweeper.test.ts#a FILLING world-gen state (stage 2)"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_sweeper.test.ts#a FILL_ERROR state is never touched and no llm_job row is created for it"
        status: pass
    human_judgment: false
  - id: D2
    description: "A healthy stage-1 state (PENDING or GENERATING with an active world_gen_start job) is not failed by the sweeper; without one it still goes to ERROR (43-08 carry-over)"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_sweeper.test.ts#stranded generation locks > a %s world-gen state whose world_gen_start job is still active (stage 1) is left alone"
        status: pass
    human_judgment: false
  - id: D3
    description: "Explore at the start location or the passage of a FILL_ERROR region starts exactly one world_gen job and no world_gen_start, moves to FILLING and posts WORLD_FILL_RETRY_LINE; FILLING answers with the patience line; the kill switch or ceiling answers with the resting line and keeps FILL_ERROR"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#staged world generation: retries and play (LAT-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Travelling onto the passage of a FILLING or FILL_ERROR region starts no new generation; look and travel keep working"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#staged world generation: retries and play (LAT-03)"
        status: pass
    human_judgment: false
  - id: D5
    description: "End to end: stage 1 applied, stage 2 fails (529), the region stays, explore re-enqueues stage 2 only, a scripted fill reply completes it"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#end to end: stage 1 applied, stage 2 fails, the region stays"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-01
---

# Phase 43 Plan 11: Staged world-gen loop (sweeper, explore retry, travel guard) Summary

**A stranded stage-2 lock is released by the sweeper into the playable FILL_ERROR, and the player's explore retries stage 2 only through retryWorldFill; the sweeper now counts world_gen_start as the stage-1 lock holder so a healthy GENERATING state is never failed after 60 s.**

## Accomplishments

- `llm_sweeper.ts` `releaseStrandedLocks`: `world_gen_start` jobs hold PENDING/GENERATING, `world_gen` jobs hold FILLING. A FILLING state past the 60 s grace with no active fill job goes through `failWorldFill(ctx, state, WORLD_FILL_FAILED_MESSAGE)` in the same try/catch and logging pattern. ERROR, FILL_ERROR and COMPLETE are never touched. Header comment updated.
- `intent.ts` explore: `retryWorldFill(ctx, character, ctx.sender)` runs after the location-0 starter branch and before the "nothing uncharted" check. busy posts `STARTER_RETRY_MESSAGES.busy`, started posts `WORLD_FILL_RETRY_LINE`, refused returns (the line is already posted), none falls through unchanged.
- `travel.ts` is untouched (`git diff --stat` empty); tests prove travelling onto a FILLING or FILL_ERROR passage creates no state and no job.

## Task Commits

1. **Task 1 RED:** `3efb5961` (test) - sweeper tests (stranded FILLING, world_gen_start holding, FILL_ERROR untouched, no-retry source guard)
2. **Task 1 GREEN:** `152f9af3` (feat) - sweeper change
3. **Task 2 RED:** `c1acd068` (test) - explore retry, patience, resting (kill switch and ceiling), nothing-to-retry, ERROR retry unchanged, travel, look/travel keep-playing, end-to-end
4. **Task 2 GREEN:** `fc04280f` (feat) - explore retry wiring

## Verification

- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/llm_sweeper.test.ts`: 50 pass.
- `... src/reducers/llm_cutover.test.ts src/reducers/intent.test.ts`: 194 pass.
- `CI=true pnpm exec vitest run --maxWorkers=1` (full root suite): 68 files, 3013 tests pass.
- `spacetime build -p spacetimedb`: "Build finished successfully" (pre-existing "tsc not found" notice).
- Acceptance greps: `failWorldFill(` in llm_sweeper.ts = 1; `world_gen_start` in llm_sweeper.ts >= 1 (4); `retryWorldFill(ctx, character, ctx.sender)` in intent.ts = 1.
- No `spacetime publish`, `call` or `generate` was run; no Anthropic call; nothing touched the running local stack.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality, 43-08 carry-over] Two holder sets instead of one.** The plan says to count both routes into `worldGenHeld`. The 43-08 carry-over requires `world_gen_start` for PENDING/GENERATING and `world_gen` for FILLING, so a merged set would let a leftover stage-2 job hold a stage-1 state (or the reverse) forever. I kept two sets. The existing test "a GENERATING world-gen state whose world_gen job is still active is left alone" seeded a `world_gen` job as the GENERATING holder (the pre-43-08 shape); it was migrated to a `world_gen_start` job (parametrized over PENDING and GENERATING), and a new case pins that an active stage-2 `world_gen` job does NOT hold a GENERATING state. No assertion was weakened or removed.

**2. [Process note] TDD** Each task has a separate RED test commit (failing before the change: 6 sweeper and 7 cutover tests failed) and a GREEN feat commit. Task 2 tests for travel, look and "nothing uncharted" passed already before the change, as expected (travel.ts needs no change).

## Pinned by tests (as requested in the carry-over)

- Sweeper treats `world_gen_start` as the stage-1 holder and `world_gen` as the FILLING holder (3 + 1 + 3 + 1 cases).
- A FILLING state used to answer "already explored"; it now answers the patience line, and a FILL_ERROR state posts `WORLD_FILL_RETRY_LINE` and starts one fill job.

## Known Stubs

None.

## Notes for later plans

- Client (Plan 43-09 / UX overhaul): FILLING and FILL_ERROR never lock input; `useWorldGeneration.ts` still only treats PENDING/GENERATING as generating.
- `retryWorldFill` matches any location in the generated region (not only the start location and the passage); a FILL_ERROR region can be retried from anywhere inside it, which is a superset of the plan's behavior.
- The explore retry hands the state to the retrying player (`playerId`, `characterId`), so that player owns the new job and its cost (T-43-38 accepted).

## Threat Flags

None. T-43-36 (one fill job per state through the dedupe key, enqueue path applies caps, kill switch and ceiling; busy while FILLING) and T-43-37 (stranded lock released after 60 s into FILL_ERROR) are mitigated and tested. No new endpoint or trust boundary.

## Self-Check: PASSED

- Commits `3efb5961`, `152f9af3`, `c1acd068` and `fc04280f` exist on master.
- All four modified files exist and are committed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
