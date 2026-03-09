---
phase: quick-385
plan: 01
subsystem: character-creation
tags: [race-definition, llm-prompts, caching]
dependency_graph:
  requires: [character_creation_state, llm_task]
  provides: [race_definition]
  affects: [prepare_creation_llm, submit_llm_result]
tech_stack:
  added: []
  patterns: [race-definition-caching, case-insensitive-lookup]
key_files:
  created:
    - spacetimedb/src/schema/tables.ts (RaceDefinition table)
    - src/module_bindings/race_definition_table.ts (generated)
  modified:
    - spacetimedb/src/data/llm_prompts.ts (exact name preservation instructions)
    - spacetimedb/src/index.ts (race lookup + save logic)
    - src/module_bindings/index.ts (regenerated)
    - src/module_bindings/types.ts (regenerated)
decisions:
  - Race definitions cached by lowercase name for case-insensitive reuse
  - LLM prompt explicitly instructs exact name preservation in both schema description and user prompt
  - Early return in prepare_creation_llm skips LLM entirely when race exists
metrics:
  duration: 2min
  completed: 2026-03-09T01:10:00Z
---

# Quick Task 385: Preserve Exact Race Names in Character Creation

Race definitions now persist in a race_definition table; duplicate race picks reuse cached definitions without LLM calls, and the LLM prompt explicitly preserves player-typed race names.

## Changes Made

### Task 1: Add RaceDefinition table and update race prompt
- Added `RaceDefinition` table with `by_name` btree index on `nameLower` for case-insensitive lookup
- Updated `RACE_INTERPRETATION_SCHEMA` raceName field to instruct LLM to preserve exact player input
- Updated `buildRaceInterpretationUserPrompt` with explicit name preservation instructions
- **Commit:** 7928d7b

### Task 2: Race lookup before LLM + save after LLM
- In `prepare_creation_llm`: checks `raceDefinition.by_name` before creating LLM task; reuses existing race definition with early return if found
- In `submit_llm_result`: saves new race definition after successful LLM generation (with duplicate check)
- **Commit:** df9d9f1

### Task 3: Publish and verify
- Published module locally with `--clear-database` (new table)
- Regenerated client bindings with `race_definition_table.ts`
- **Commit:** 043bc23

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. Module compiles and publishes successfully -- PASS
2. race_definition table exists in schema -- PASS (2 references)
3. LLM prompt contains exact-name preservation instructions -- PASS (3 EXACT references)
4. prepare_creation_llm has race lookup logic -- PASS (2 raceDefinition.by_name refs)
5. submit_llm_result saves race definitions -- PASS (insert with duplicate check)
