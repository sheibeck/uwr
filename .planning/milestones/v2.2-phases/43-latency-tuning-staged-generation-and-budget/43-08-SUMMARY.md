---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 08
subsystem: api
tags: [spacetimedb, llm, world-generation, staged-generation, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: kill switch, ceiling and resting line (43-01 to 43-03); WORLD_START_SCHEMA, REGION_FILL_SCHEMA, WorldGenInput, WorldFillInput and the ten-route table (43-04); route registries (43-05)
provides:
  - startWorldGeneration enqueues the small world_gen_start job first for every trigger
  - writeRegionStart, writeRegionFill, ensureRegionServices, findRegionStart, buildWorldFillInput, startWorldFill, failWorldFill, retryWorldFill in helpers/world_gen.ts
  - WORLD_START_MILESTONE_LINE, WORLD_FILL_FAILED_MESSAGE, WORLD_FILL_REFUSED_MESSAGE, WORLD_FILL_RETRY_LINE, worldFillCompleteLine
  - applyWorldStartResult and applyWorldFillResult; staged world branches in applyLlmResult and applyLlmFailure
  - world_gen_state.step values FILLING and FILL_ERROR (plain strings, no schema change)
affects: [43-11, 43-13, 43-14, 43-15]

tech-stack:
  added: []
  patterns:
    - "Stage 2 input is read back from the stored stage-1 rows, never from the model reply"
    - "Each staged result is guarded by the step it needs (stage 1 GENERATING, stage 2 FILLING)"
    - "A failed stage 2 degrades to FILL_ERROR: the stage-1 region stays playable and only the player's explore starts a new fill job"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/world_gen.ts
    - spacetimedb/src/helpers/world_gen.test.ts
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
    - spacetimedb/src/helpers/llm_apply.characterization.test.ts
    - spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
    - spacetimedb/src/reducers/llm_cutover.test.ts

key-decisions:
  - "The monolithic writeGeneratedRegion and findHomeLocation are deleted (greenfield, no shim); the vendor and banker safety net moved verbatim into ensureRegionServices"
  - "writeRegionFill makes every new location reachable from the start location with a graph walk (not only the first one), so a model reply with an orphan location or a detached pair still leaves a connected region"
  - "startWorldFill treats an unreadable stage 1 (missing region or start location) as a failed fill (FILL_ERROR with the failed message, returns 'refused') instead of throwing, so a retry reducer can never roll back on it"
  - "The stage-1 apply records generatedRegionId before enqueueing stage 2, so the fill input is read from the stored rows in the same transaction"
  - "The staged characterization snapshots summarize the llm_job, llm_dispatch, budget, spend, sweep and gate tables as route:status per job, so a later prompt-size change cannot rewrite the world snapshots"

patterns-established:
  - "Fill neighbors exclude the new region itself: the start location is already connected to the source region when stage 2 is built"

requirements-completed: []  # LAT-03 and LAT-05 server half only; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "Every world-generation trigger (finishing a character, travelling to an uncharted edge, exploring after an error) enqueues exactly one world_gen_start job"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#world generation cutover (PIPE-01 / PIPE-04 / PIPE-05)"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/world_gen.test.ts#startWorldGeneration"
        status: pass
    human_judgment: false
  - id: D2
    description: "Applying stage 1 writes region, safe start location (bind stone and crafting) and first NPC, connects the source edge, places the character, posts arrival, ripple, discovery and milestone lines and enqueues the fill from stored rows (FILLING with one pending world_gen job)"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.test.ts#Phase 43 (plan 08): staged world apply"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.characterization.test.ts#llm apply world_gen_start success (stage 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The player stands in the new region with its first NPC while the fill job is still pending (end to end through runLlmJob with scripted replies)"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#staged world generation (LAT-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Applying stage 2 adds locations, NPCs, enemies, the services safety net and the uncharted boundary without renaming or duplicating stage-1 content, connects every new location, and sets COMPLETE"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/world_gen.test.ts#writeRegionFill"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.characterization.test.ts#llm apply world_gen success (stage 2, the fill)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A failed, malformed or refused stage 2 gives FILL_ERROR, keeps stage 1 playable with vendor and banker, posts one in-voice line naming [explore] (the resting line for the kill switch or ceiling), and never starts a new job on its own"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/world_gen.test.ts#failWorldFill, #startWorldFill"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.test.ts#Phase 43: a failure caused by the kill switch or the ceiling shows the resting line"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#staged world generation (LAT-03) > a stage-2 call failure leaves the stage-1 region playable"
        status: pass
    human_judgment: false
  - id: D6
    description: "A late or stale stage result never touches a state that has moved on; every new line passes the pronoun guard (the Keeper is he, people he or she)"
    requirement: LAT-05
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.test.ts#a late or stale result never touches a state that has moved on"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/data/pronoun_rules.test.ts#repository pronoun guard"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/world_gen.test.ts#staged world copy (Phase 43)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-10-01
---

# Phase 43 Plan 08: Staged world generation core Summary

**World generation runs as two jobs: a small world_gen_start job reveals the region, its safe start location and its first NPC and, in the same apply transaction, enqueues the world_gen fill; a failed fill leaves a playable FILL_ERROR region with vendor and banker and one in-voice [explore] line.**

## Accomplishments

- `world_gen.ts`: `startWorldGeneration` now enqueues `world_gen_start` (same input, same source key, resting copy kept). New `writeRegionStart`, `writeRegionFill`, `ensureRegionServices`, `findRegionStart`, `buildWorldFillInput`, `startWorldFill`, `failWorldFill`, `retryWorldFill` and the stage copy constants. `writeGeneratedRegion` and `findHomeLocation` are gone.
- `llm_apply.ts`: `applyWorldStartResult` and `applyWorldFillResult` replace `applyWorldGenResult`. `applyLlmFailure` fails `world_gen_start` through `failWorldGen` only while PENDING or GENERATING and `world_gen` through `failWorldFill` only while FILLING, both with the resting line when `isRestingErrorCode`.
- Tests migrated and extended in `world_gen.test.ts`, `llm_apply.test.ts`, `llm_apply.characterization.test.ts` and `llm_cutover.test.ts`.

## Task Commits

1. **Task 1: staged world-gen helpers** - `645d24cc` (feat)
2. **Task 2: staged world apply and failure handling with migrated characterization** - `bce22735` (feat)
3. **Task 3: trigger assertions flipped, end-to-end staged proof** - `c5974c1e` (test)

## Final copy of every new player-facing line

| Constant | Text |
|---|---|
| `WORLD_START_MILESTONE_LINE` (posted when stage 1 lands, system line) | The Keeper clears his throat. This ground will do; the rest of the region is still being remembered. |
| `WORLD_FILL_FAILED_MESSAGE` (stored on the state and posted, with " Type [explore] to try again.") | The Keeper loses the thread of the rest of the map. What he has already shown you will hold. |
| `WORLD_FILL_REFUSED_MESSAGE` (stored and posted the same way) | The Keeper cannot finish remembering this region right now. What he has shown you will hold. |
| `WORLD_FILL_RETRY_LINE` (posted by the explore intent in Plan 43-11; not posted by this plan) | The Keeper squints at the half-remembered land and tries again... |
| `worldFillCompleteLine(regionName)` | The rest of <regionName> settles into place. Try [travel] to see where the roads lead. |
| Arrival message tail (stage 1, replaces the "Paths lead to" list) | Try [look] to examine your surroundings. The Keeper is still remembering the roads out. |

For the kill switch or the ceiling the stored message and the posted line start with `LLM_RESTING_LINE` ("The Keeper is resting. Return later.") instead. A stage-1 failure keeps the Phase 41 wording ("The Keeper falters. ..." for a failed job, the grimace and incomplete lines for a bad reply).

## Migrated world_gen.test cases

- `findHomeLocation` (3 cases) removed with the function; its behavior is now `findRegionStart` (2 cases: lowest-id charted location, null when none).
- `writeGeneratedRegion` cases migrated to `writeRegionStart` plus `writeRegionFill` through a `writeBoth` helper: fallback vendor and banker, no duplicate vendor or banker, bind stone and crafting on the start location.
- Starter-region cases (danger 100, enemies clamped to level 1, non-starter danger increase) and the four validator-retention cases (clamp into the band, stats from the clamped level, starter level 1, danger cap 800 so level at most 9) kept, running on stage 2.
- The Plan 41-18 NPC gender cases (valid model gender, pronoun inference, clamp invalid, safety-net vendor and banker, every row has a gender) kept and extended to the stage-1 first NPC.
- `startWorldGeneration` cases kept; the enqueue case now asserts route and dedupe key `world_gen_start`.
- New: `writeRegionStart` (8), `writeRegionFill` (16), `ensureRegionServices`, `buildWorldFillInput` (3), `startWorldFill` (8), `failWorldFill` (5), `retryWorldFill` (5), staged copy (3) and the no-self-retry source guard.

## Characterization snapshot changes

All world entries; non-world entries unchanged (verified by comparing the parsed old and new snapshot files: 93 unchanged, 19 removed, 51 added, 0 changed; none of the removed or added keys is a non-world key).

Removed (19, the old one-shot `world_gen` describes):
`world_gen failure path` (4: creation events when no location, creation events when the character is gone, sets ERROR and tells a placed character, writes nothing when the state is gone); `world_gen success` (15: missing character quirk, COMPLETE, ERROR and PENDING returns silently, missing regionName, empty regionName, empty locations array, no locations key, code-fenced reply, invalid JSON for a creation_error and for a placed character, non-starter region, non-safe home location, state gone, starter region).

Added (51):
- `world_gen_start failure path` (9): placed character, no location yet, character gone, PENDING state failed too, left alone at FILLING, FILL_ERROR, COMPLETE and ERROR, state gone.
- `world_gen (fill) failure path` (8): FILL_ERROR with banker added for a placed character, character gone, left alone at GENERATING, PENDING, FILL_ERROR, COMPLETE and ERROR, state gone.
- `world_gen_start success (stage 1)` (18): starter region, non-starter region (passage plus connection), missing character quirk, no first NPC, code-fenced reply, closed gate (FILL_ERROR resting line), silent at FILLING, FILL_ERROR, COMPLETE, PENDING and ERROR, state gone, two invalid-JSON cases, four incomplete-reply cases (regionName missing or empty, startLocation missing, startLocation without a name).
- `world_gen success (stage 2, the fill)` (16): complete flow, non-starter level clamp, never renames or duplicates stage 1, missing character quirk, code-fenced reply, empty locations array, silent at GENERATING, PENDING, FILL_ERROR, COMPLETE and ERROR, state gone, invalid JSON, no locations key, a locations value that is not an array, stored region gone.

The stage-1 success snapshots omit the `llm_job`, `llm_dispatch`, `llm_player_budget`, `llm_spend`, `llm_sweep_tick` and `llm_admin_state` tables and carry a `_jobs` summary (`world_gen:pending`) instead; the job rows are still checked against the recorded schema in the same case.

## Verification

- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1` over world_gen, llm_apply, llm_apply.characterization, llm_cutover and pronoun_rules: 5 files, 411 tests pass.
- `CI=true pnpm exec vitest run --maxWorkers=1` (full root suite): 65 files, 2744 tests pass.
- `spacetime build -p spacetimedb`: "Build finished successfully" (with the pre-existing "tsc not found" notice).
- `tsc --noEmit -p spacetimedb/tsconfig.json`: no error in `world_gen.ts`, `llm_apply.ts` or the touched tests other than the pre-existing `node:fs`/`node:url` type lines in `llm_cutover.test.ts`.
- Acceptance greps: eight staged exports in `world_gen.ts` = 8; `route: 'world_gen_start'` = 1; `route: 'world_gen',` = 1; `writeGeneratedRegion` in `spacetimedb/src` = 0; `applyWorldStartResult|applyWorldFillResult` exports = 2; `WORLD_START_MILESTONE_LINE` in `llm_apply.ts` = 2; `applyWorldGenResult` = 0.
- No `spacetime publish`, `call` or `generate` was run; nothing touched the running local stack.

## Deviations from Plan

**1. [Process note] TDD** Tests were written alongside each task and each task is one commit (the pattern of Plans 43-01 to 43-04). Because `writeGeneratedRegion` was deleted in Task 1 as the plan prescribes, `llm_apply.ts` imported a missing symbol at commit `645d24cc` until Task 2 (`bce22735`); the Task 1 verify files do not touch `llm_apply`.

**2. [Rule 2 - Missing critical functionality] Every new location is reachable.** The plan's behavior list connects the first new location to the start location when no new location reached it. The must-have truth says "connects every new location to the region", and a reply with an orphan location or a detached pair would still leave unreachable locations. `writeRegionFill` walks the connection graph from the start location and connects each still-unreachable new location to it (the first-location rule is the special case). Pinned by two tests.

**3. [Rule 2 - Missing critical functionality] `startWorldFill` with an unreadable stage 1.** `buildWorldFillInput` throws a plain Error as specified. `startWorldFill` catches it and fails the fill (FILL_ERROR, `WORLD_FILL_FAILED_MESSAGE`, returns `'refused'`) so a retry reducer cannot roll back on a missing region, and the player still gets the [explore] line.

**4. [Rule 2] Small clamps.** A start or new location whose terrain is `uncharted` is written as `plains` (it must never be mistaken for an edge), `levelOffset` goes through `toBigIntSafe` within -10..10, enemy `level` through `toBigIntSafe` before the band clamp, `groupMin` and `groupMax` within 1..20 with `groupMax >= groupMin`.

No bugs found in prior code; no scope creep.

## Known Stubs

None.

## Notes for later plans

- **Plan 43-11 (sweeper):** `releaseStrandedLocks` in `llm_sweeper.ts` only recognises an active `world_gen` job as the lock holder of a PENDING or GENERATING state. A GENERATING state is now held by a `world_gen_start` job, so a stranded-lock sweep would fail a healthy stage-1 state older than the 60 s grace. Nothing is published before 43-15, but 43-11 must recognise `world_gen_start` for GENERATING and `world_gen` for FILLING (FILLING with no active fill job should go to FILL_ERROR through `failWorldFill`). Its tests currently seed `world_gen` jobs and still pass.
- **Plan 43-11 (explore):** `intent.ts` explore treats any non-ERROR state as "already explored" except PENDING and GENERATING (patience line). A FILLING state therefore answers "This region has already been explored." until 43-11 adds `retryWorldFill` ('busy', 'started', 'refused', 'none') and posts `WORLD_FILL_RETRY_LINE`. `retryWorldFill` does not post that line itself; a refusal posts the refusal line through `failWorldFill`.
- **Per-player cap:** the stage-1 job is still active (`received`) while its apply enqueues stage 2, so a player already holding three active capped jobs gets `busy` for the fill and ends in FILL_ERROR with the refused line, region playable. Expected under the cap contract; the explore retry covers it.
- **Client (UX overhaul pending, no UI work here):** `useWorldGeneration.ts` only treats PENDING and GENERATING as "generating"; FILLING and FILL_ERROR are not shown. The `world_gen_state.step` comment in `schema/tables.ts` still lists the four old values; comment-only, left alone under the smallest-change rule.
- The fill input's neighbor list excludes the new region (the start location is already connected to the source region when stage 2 is enqueued).

## Threat Flags

None. T-43-24 (fill input read from rows through the sanitized Plan 43-04 builder, stage 2 never re-emits stage-1 fields; the apply never reads stage-1 text from the stage-2 reply), T-43-25 (`toBigIntSafe` on every model number, enemy levels clamped from the stored region danger), T-43-26 (FILL_ERROR keeps the region playable with services, nothing auto-retries, pinned by the no-new-job tests and the `startWorldFill` caller scan), T-43-27 (stage 2 enqueued only by the stage-1 apply and `retryWorldFill`, dedupe key per state, caller scan test) and T-43-28 (only fixed in-voice lines stored on the public state, no digit or budget word tested) are mitigated and tested. No new endpoint or trust boundary.

## Self-Check: PASSED

- Commits `645d24cc`, `bce22735` and `c5974c1e` exist on master.
- All seven modified files exist and are committed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
