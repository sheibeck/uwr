---
phase: quick-362
plan: 01
subsystem: world-gen, intent
tags: [spawn-safety, auto-look, world-gen, travel]
dependency_graph:
  requires: []
  provides: [safe-spawn-guarantee, auto-look-on-travel]
  affects: [world_gen.ts, llm_prompts.ts, intent.ts]
tech_stack:
  added: [vitest]
  patterns: [fallback-npc-insertion, extracted-look-function]
key_files:
  created:
    - spacetimedb/src/helpers/world_gen.test.ts
    - spacetimedb/src/reducers/intent.test.ts
  modified:
    - spacetimedb/src/helpers/world_gen.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/package.json
decisions:
  - "Fallback NPCs have sardonic personalities matching game tone"
  - "buildLookOutput extracted as module-level export for reuse by both look and travel"
  - "vitest added as devDependency with vi.mock for SpacetimeDB module isolation"
metrics:
  duration: 6min
  completed: "2026-03-08T18:31:00Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 10
---

# Quick Task 362: Ensure New Characters Spawn in Safe Location

Server-side safety net guarantees vendor + banker NPCs at starting location regardless of LLM output, plus auto-look on travel so players see full location overview without manual LOOK command.

## Task Summary

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Guarantee all core services at starting safe location | 9a9fd33 | Added banker npcType to LLM schema, prompt instruction for vendor+banker, findHomeLocation() helper, fallback NPC insertion after step 8 |
| 2 | Auto-look on travel + unit tests | 8959e53 | Extracted buildLookOutput(), auto-look after travel arrival, 10 unit tests across 2 test files |

## Changes Made

### LLM Prompts (llm_prompts.ts)
- Added `banker` to npcType enum in REGION_GENERATION_SCHEMA
- Added instruction requiring first safe location to have vendor + banker NPCs

### World Generation (world_gen.ts)
- Added `findHomeLocation()` exported helper: finds first safe non-uncharted location
- Added step 8b: after NPC insertion, checks home location for vendor/banker and inserts fallback NPCs if missing
- Fallback vendor: "The Reluctant Merchant" (sardonic personality)
- Fallback banker: "The Ledger Keeper" (meticulous personality)

### Intent Handler (intent.ts)
- Extracted `buildLookOutput(ctx, character)` as module-level exported function
- Refactored bare "look" handler to use buildLookOutput
- Added auto-look after travel: re-reads character, calls buildLookOutput, emits 'look' event

### Test Infrastructure
- Added vitest as devDependency with test script
- Created world_gen.test.ts: 6 tests (findHomeLocation + writeGeneratedRegion fallback behavior)
- Created intent.test.ts: 4 tests (buildLookOutput output, empty location, NPC markers, exits)
- Used vi.mock to isolate SpacetimeDB module imports

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 10 tests pass (vitest run): 2 test files, 10 tests, 0 failures
- banker npcType confirmed in REGION_GENERATION_SCHEMA
- Fallback NPCs confirmed in world_gen.ts
- buildLookOutput confirmed exported and called from travel handler

## Self-Check: PASSED
