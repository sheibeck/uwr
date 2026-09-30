---
phase: 41-executor-and-domain-cutover
plan: 13
subsystem: llm-cutover-creation
tags: [spacetimedb, llm, character-creation, enqueue, cutover, local-publish, bindings, tests]
status: complete
requires:
  - phase: 41-05 (enqueueLlmJob, SOURCE_KEYS.creation, llmRefusalMessage)
  - phase: 41-03 (creation reply clamping in creation_validate)
  - phase: 41-07 (executor, NO_AUTO_RETRY for creation routes)
  - phase: 41-10 (llm_cutover.test.ts harness, expectEnqueued)
provides:
  - "helpers/creation_generation.ts: startCreationGeneration(ctx, state, 'race' | 'class') returning 'reused' | 'enqueued' | 'duplicate' | 'refused'"
  - "submit_creation_input enqueues creation_race and creation_class jobs in its own transaction at the two GENERATING_* transitions"
  - "prepare_creation_llm deleted from the module, the bindings and the client composable"
affects: [41-14, 41-15, 41-16]
tech-stack:
  added: []
  patterns:
    - "Known-race reuse short-circuit lives in the race path of the helper, so a reused race costs no call and no budget"
    - "Refusal with no character context: revert the step and post a creation_error event (not fail())"
key-files:
  created:
    - spacetimedb/src/helpers/creation_generation.ts
    - spacetimedb/src/helpers/creation_generation.test.ts
  modified:
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts
    - spacetimedb/src/data/model_literals.test.ts
    - spacetimedb/src/helpers/schema_recorder.test.ts
    - src/composables/useCharacterCreation.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types/reducers.ts
  deleted:
    - src/module_bindings/prepare_creation_llm_reducer.ts
key-decisions:
  - "The 'considering' and archetype lines post only when startCreationGeneration returns 'enqueued' or 'duplicate'; a reused race posts the reuse text only and a refusal posts only the refusal"
  - "The client watch now just mirrors the step: isCreationLlmProcessing = (step is GENERATING_RACE or GENERATING_CLASS), so a refreshed tab shows generation in progress and the applied result on return"
  - "The schema_recorder smoke test that used prepare_creation_llm as its 'index.ts reducer is captured' probe now probes request_skill_offer (a stable reducer defined in index.ts)"
metrics:
  tasks: 2
  files: 11
  tests_added: 19
  suite: "1994 passed (spacetimedb, baseline 1976 + 10 creation_generation + 8 cutover); root client suite 2050 passed"
completed: 2026-09-30
---

# Phase 41 Plan 13: Character Creation Cutover Summary

Character creation now runs on the executor: `submit_creation_input` enqueues race and class generation in its own transaction through one helper that reuses known races for free, refuses cleanly with a reverted step, and never retries without the player. The prepare reducer and its client call are gone.

## What was built

### Task 1: startCreationGeneration (commit 97dfc587)
- `startCreationGeneration(ctx, state, generationType)`:
  - race: looks up `race_definition.by_name` with the trimmed, lowercased description; on a match moves the state to AWAITING_ARCHETYPE with `raceName`, `raceNarrative`, `raceBonuses` and posts the old reuse text unchanged, returning `'reused'` (no job). Otherwise enqueues `creation_race` with `{ raceDescription }`.
  - class: enqueues `creation_class` with `{ raceName ?? 'Unknown', raceNarrative ?? '', archetype ?? 'warrior' }`.
  - enqueue uses `SOURCE_KEYS.creation(state.id, type)`, `characterId 0n`, request `{ input: encodeRouteInput(input) }`. Refusal returns `'refused'` after setting the state back to AWAITING_RACE or AWAITING_ARCHETYPE and posting `creation_error` with `llmRefusalMessage(reason)`. A dedupe hit returns `'duplicate'`.
- `creation_generation.test.ts` (10 tests): enqueue shape and decoded input per route, state untouched on enqueue, reuse (state, bonus text, no job, case and whitespace insensitive), duplicate writes nothing more, race and class jobs for one state do not merge, defaults for archetype and race, refusal for both steps (no job, dispatch, sweep tick or reservation; revert; one refusal event).

### Task 2: wiring, deletion, publish, bindings, build (commits 3c578ac5, bea7be20)
- `reducers/creation.ts`: AWAITING_RACE and AWAITING_ARCHETYPE cases update the state to GENERATING_* then call `startCreationGeneration(ctx, updated, type)`; the progress line posts only on `'enqueued'` or `'duplicate'`. The stale "client calls generateCreationContent" comments in the two GENERATING_* cases now read "the server-side executor is generating; results arrive through character_creation_state".
- `index.ts`: `prepare_creation_llm` deleted with the three prompt-builder imports only it used (`buildCharacterCreationPrompt`, `buildRaceInterpretationUserPrompt`, `buildClassGenerationUserPrompt`); the world-gen prepare reducer and its imports are untouched (Plan 41-14).
- `useCharacterCreation.ts`: the prepare call and its `preparedForStep` ref removed; the step watch sets `isCreationLlmProcessing` from the GENERATING_* step.
- `model_literals.test.ts`: `spacetimedb/src/index.ts` pinned at 1 (the remaining `gpt-5.4` is the world-gen prepare reducer, deleted in 41-14).
- `llm_cutover.test.ts` (+8 tests): AWAITING_RACE enqueue with the considering line and no legacy task; AWAITING_ARCHETYPE enqueue with the archetype line; known race reused (no job, no considering line); refused race and refused class (revert, only the refusal event, nothing reserved); `capturedReducer('prepare_creation_llm')` undefined; end to end no-auto-retry run through `runLlmJob` for both a scripted 500 and a timeout (job failed at attempt 1, one HTTP call, no retry dispatch, state back at AWAITING_RACE, in-voice "Try again" event; a second submission creates a second pending job and dispatch and no extra HTTP call); the static client check now also rejects `prepareCreationLlm` and `prepare_creation_llm` under `src/` (outside `module_bindings`).

## Local publish

Code and reducer changes only (one reducer removed); the local server was running (ping 200). `pnpm spacetime:publish < /dev/null` needed no clear and no `--break-clients`:

```
Checking for breaking changes...
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

`spacetime logs uwr --server local` ends with `Updated program to 40f8bc1e...` and `Database updated`, no errors. `pnpm spacetime:generate -y` (the `-y` deletes only the stale `prepare_creation_llm_reducer.ts`). `spacetime build -p spacetimedb` prints "Build finished successfully" (the "tsc not found" line is the existing tool warning). Nothing targeted maincloud.

## Verification

- Server suite `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1`: 50 files, 1994 tests passed (baseline 1976).
- Root client suite `CI=true pnpm exec vitest run --maxWorkers=1`: 54 files, 2050 tests passed (baseline 2032; the root config also picks up the new server test files).
- `pnpm build` exits 0 (vue-tsc and Vite).
- Acceptance greps: `prepare_creation_llm` in index.ts 0; `prepareCreationLlm` in the composable 0; `preparedForStep` 0; `isCreationLlmProcessing` 3; `startCreationGeneration(ctx` in creation.ts 2; no `prepare_creation_llm` binding file; `SOURCE_KEYS.creation(` 1; `race_definition.by_name` 1; allowlist `'spacetimedb/src/index.ts': 1`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] schema_recorder smoke test asserted the deleted reducer**
- **Found during:** Task 2 full suite (1 failure, `schema_recorder.test.ts`: `capturedReducer('prepare_creation_llm')` expected a function)
- **Fix:** That test only needs some reducer defined in `index.ts` to prove capture works; it now probes `request_skill_offer`, which is stable (41-14 would otherwise break it again via `prepare_world_gen_llm`).
- **Files modified:** spacetimedb/src/helpers/schema_recorder.test.ts
- **Commit:** 3c578ac5

Otherwise executed as written. TDD note: helper and tests were committed together per task (as in 41-10 to 41-12), not as separate RED and GREEN commits.

## Notes for later plans

- The legacy `llm_task` table, `submit_llm_result` and the world-gen prepare reducer (with the last `gpt-5.4` literal in `index.ts`) remain until 41-14.
- Creation failures reuse the existing `applyLlmFailure` in-voice line ("The Keeper flickers. ... Try again."); no new Keeper-voice strings were added apart from reusing existing text, so there is nothing for the 41-18 pronoun sweep to add from this plan.
- A live creation run with real Claude replies needs the key from 41-16; here creation is proven with scripted replies and failures only.

## Known Stubs

None.

## Threat Flags

None. T-41-05 mitigated (creation routes are NO_AUTO_RETRY; end-to-end test for a 500 and a timeout); T-41-04 mitigated (dedupe on state id and type, budget and cap refusal reverts the step; tests); T-41-11 transferred as planned (Phase 40 tags, Plan 41-03 clamps; breadcrumb to /gsd-secure-phase); T-41-14 respected (local publish only).

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/creation_generation.ts, spacetimedb/src/helpers/creation_generation.test.ts, spacetimedb/src/reducers/creation.ts, spacetimedb/src/index.ts, spacetimedb/src/reducers/llm_cutover.test.ts, src/composables/useCharacterCreation.ts
- MISSING (intended): src/module_bindings/prepare_creation_llm_reducer.ts
- FOUND commits: 97dfc587, 3c578ac5, bea7be20
