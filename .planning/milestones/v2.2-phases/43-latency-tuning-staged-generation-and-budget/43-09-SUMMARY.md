---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 09
subsystem: ui
tags: [vue, composables, llm, progress-lines, indicator, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: ten-route table and route registries (43-04, 43-05); staged world generation with FILLING and FILL_ERROR steps (43-08)
provides:
  - LLM_PROGRESS_ROTATE_MS (5000), LLM_INDICATOR_POOLS, LLM_INPUT_LOCKING_WORLD_GEN_STEPS and LLM_INPUT_LOCKING_CREATION_STEPS in the import-free server data module
  - indicatorLineFor(route, rotation) and a rotation-aware selectLlmIndicator in useLlmStatus
  - a 5 s rotation ticker inside useLlmStatus, cleared on scope dispose
  - useWorldGeneration and useCharacterCreation read their input-locking step lists from server data
affects: [43-13, 43-14, 43-15]

tech-stack:
  added: []
  patterns:
    - "Server data is the source of truth for progress copy and for which steps lock input; the client imports both"
    - "Rotation only picks a line from the winning route's pool; it never changes which job wins"
    - "A timer is started only inside an effect scope and cleared with onScopeDispose"

key-files:
  created:
    - src/composables/generationLocks.test.ts
  modified:
    - spacetimedb/src/data/llm_indicator_lines.ts
    - spacetimedb/src/data/llm_indicator_lines.test.ts
    - src/composables/useLlmStatus.ts
    - src/composables/useLlmStatus.test.ts
    - src/composables/useWorldGeneration.ts
    - src/composables/useCharacterCreation.ts

key-decisions:
  - "indicatorLineFor falls back to the route's static line when a known non-silent route has an empty or missing pool, so rotation can never blank a live indicator"
  - "Rotation index is normalised with a double modulo so a negative or fractional rotation still lands inside the pool"
  - "An injected rotation ref disables the internal ticker (the caller owns the clock); no ticker starts outside an effect scope"
  - "App.vue is unchanged: it already calls useLlmStatus({ llmJobs }) inside setup, which is an active scope, so the existing indicator rotates with no component or style change"

patterns-established:
  - "Source guard tests strip comments before checking a composable has no step literals of its own"

requirements-completed: []  # LAT-05, LAT-03, LAT-04 client half; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "While a generation job is active the existing Keeper indicator rotates through in-voice lines from a server data pool about every 5 seconds; rotation 0 is exactly the Phase 42 line for every route"
    requirement: LAT-05
    verification:
      - kind: unit
        ref: "src/composables/useLlmStatus.test.ts#useLlmStatus rotation"
        status: pass
      - kind: unit
        ref: "src/composables/useLlmStatus.test.ts#indicatorLineFor"
        status: pass
      - kind: unit
        ref: "src/composables/useLlmStatus.test.ts#selectLlmIndicator rotation"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every pool line starts with The Keeper, ends with three ASCII dots, has no exclamation mark, no banned phrase, never calls anyone it, they or she, and speaks to the player only as you; pools are frozen, unique within a pool and start with the Phase 42 line"
    requirement: LAT-05
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_indicator_lines.test.ts#LLM_INDICATOR_POOLS"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/data/pronoun_rules.test.ts#repository pronoun guard"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stage-2 steps never lock input: world-gen FILLING and FILL_ERROR and creation CLASS_FILLING and CLASS_FILL_ERROR are excluded from the locking lists, and both composables read the lists from server data"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "src/composables/generationLocks.test.ts#input-locking step lists"
        status: pass
      - kind: unit
        ref: "src/composables/generationLocks.test.ts#composables read the step lists from server data"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/data/llm_indicator_lines.test.ts#input-locking step lists (stage 2 never locks input)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The rotation timer is one 5 s interval per composable instance, cleared on scope dispose, never started outside a scope"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "src/composables/useLlmStatus.test.ts#advances the line after 5000 ms inside an effect scope and stops ticking after scope.stop()"
        status: pass
      - kind: unit
        ref: "src/composables/useLlmStatus.test.ts#starts no timer and does not throw when called outside any scope"
        status: pass
    human_judgment: false
  - id: D5
    description: "No new component, screen or style: App.vue and src/components are unchanged, the module stays import-free, the bundle guard passes"
    requirement: LAT-05
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_indicator_lines.test.ts#module source"
        status: pass
      - kind: unit
        ref: "src/legacyLlmRemoval.test.ts"
        status: pass
      - kind: integration
        ref: "pnpm build (vue-tsc, vite, scripts/check-bundle.mjs prints: bundle clean: 4 files scanned)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-01
---

# Phase 43 Plan 09: Rotating Keeper progress lines (client half) Summary

**The existing Phase 42 console indicator now rotates through in-voice Keeper lines from a server data pool every 5 seconds while a job is active (rotation 0 is the unchanged Phase 42 line), and the world-gen and creation input locks read their step lists from server data so stage-2 steps (FILLING, FILL_ERROR, CLASS_FILLING, CLASS_FILL_ERROR) never lock input.**

## Accomplishments

- `llm_indicator_lines.ts` (still import-free): `LLM_PROGRESS_ROTATE_MS = 5000`, frozen `LLM_INDICATOR_POOLS` (one key per route, pool[0] is the Phase 42 line, silent routes empty), and frozen `LLM_INPUT_LOCKING_WORLD_GEN_STEPS` (`PENDING`, `GENERATING`) and `LLM_INPUT_LOCKING_CREATION_STEPS` (`GENERATING_RACE`, `GENERATING_CLASS`).
- `useLlmStatus.ts`: exported `indicatorLineFor(route, rotation)`; `selectLlmIndicator(rows, scope?, rotation = 0)` picks the winner exactly as before and only then selects the line; `useLlmStatus({ llmJobs, rotation? })` owns a 5 s `setInterval` cleared by `onScopeDispose`, started only when a scope exists and no rotation ref is injected.
- `useWorldGeneration.ts` and `useCharacterCreation.ts` use the server-data step lists, closing the 43-08 note that the client had not yet treated FILLING and FILL_ERROR: the region is playable during and after a failed fill, and CLASS_FILLING / CLASS_FILL_ERROR leave the creation input open.
- Tests: pool voice and pronoun loop over every pool line, rotation, wrap, silent, fallback and timer-lifecycle cases (fake timers), pure list checks and source guards in the new `generationLocks.test.ts`.

## Task Commits

1. **Task 1 RED: failing pool and step-list tests** - `cdde247f` (test)
2. **Task 1 GREEN: pools, rotation interval and step lists in server data** - `cf456d95` (feat)
3. **Task 2 RED: failing rotation and lock tests** - `ab71a8d3` (test)
4. **Task 2 GREEN: rotation in useLlmStatus and stage-safe locking** - `3fd9e4b3` (feat)

## Final pool copy

- creation_race: "The Keeper is considering your fate..." / "The Keeper is consulting a very old and very dusty list of peoples..." / "The Keeper is pretending not to be impressed by your ancestry..."
- creation_class_reveal: "The Keeper is deciding what you are good for..." / "The Keeper is working out what you are..." / "The Keeper is sizing you up, unkindly..."
- creation_class: "The Keeper is sorting out the rest of what you can do..." / "The Keeper is deciding which of your talents to admit to..." / "The Keeper is writing down your abilities in very small print..."
- world_gen_start: "The Keeper is unrolling a map, with visible reluctance..." / "The Keeper is deciding where you will stand..." / "The Keeper is squinting at the horizon..."
- world_gen: "The Keeper is filling in the rest of the map, grudgingly..." / "The Keeper is deciding who else lives out here..." / "The Keeper is placing things that will want to eat you..." / "The Keeper is remembering the roads between places..."
- skill_gen: "The Keeper is weighing what you might become..."
- renown_perk_gen: "The Keeper is tallying what your name is worth..."
- npc_conversation: "The Keeper leans in to listen..."
- combat_narration, smoke_test: empty (silent)

## Deviations from Plan

None - plan executed exactly as written. TDD was followed per task (RED commit, then GREEN commit). Task 1 and Task 2 each have a separate test commit and feature commit.

## Verification

- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/data/llm_indicator_lines.test.ts src/data/pronoun_rules.test.ts`: 153 passed.
- `CI=true pnpm exec vitest run --maxWorkers=1 src/composables/useLlmStatus.test.ts src/composables/generationLocks.test.ts src/legacyLlmRemoval.test.ts`: 77 passed.
- `CI=true pnpm exec vitest run --maxWorkers=1` (full root suite): 66 files, 2854 tests, all passed.
- `pnpm build`: exit 0, "bundle clean: 4 files scanned".
- `git diff --stat src/App.vue src/components`: empty. No `spacetime publish`, `call` or `generate` was run.

## Flagged assumption (confirm at verify)

Each rotation changes the text of the existing `role="status"` region, so a screen reader may announce it about every 5 s. No component change was made to alter that (UX overhaul pending, backlog 999.6). The milestone lines when stage 1 lands remain ordinary server events (43-08, 43-13).

## Known Stubs

None.

## Threat Flags

None. T-43-29 (module stays import-free, bundle guard clean), T-43-30 (one interval per instance, cleared on dispose, fake-timer test) and T-43-31 (stage-2 steps excluded from locking lists, tests pin it) are mitigated as planned.

## Self-Check: PASSED

- FOUND: src/composables/generationLocks.test.ts
- FOUND: commits cdde247f, cf456d95, ab71a8d3, 3fd9e4b3
