---
phase: quick-349
plan: 01
subsystem: combat
tags: [combat, narration, llm, bugfix]
dependency_graph:
  requires: [quick-348]
  provides: [working-realtime-combat, intro-narration]
  affects: [combat-flow, llm-pipeline]
tech_stack:
  patterns: [delayed-fallback-tick, intro-narration-gate]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/combat_constants.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/helpers/combat_narration.ts
    - spacetimedb/src/data/llm_prompts.ts
decisions:
  - "12s fallback timeout for LLM intro narration (combat starts regardless)"
  - "Post-combat LLM summary is pure narrative fluff (no HP/damage numbers)"
  - "Combat loop starts on whichever comes first: LLM intro success, LLM intro failure, or 12s fallback"
metrics:
  duration: 3min
  completed: "2026-03-08"
---

# Quick Task 349: Fix Real-Time Combat Bugs and Add Intro Narration

Combat intro narration gates the combat_loop start, with a 12s fallback; post-combat summaries are pure narrative without game numbers.

## What Changed

### Task 1: Add intro narration at combat start and delay combat_loop

- Added `COMBAT_INTRO_TIMEOUT_MICROS` (12s) constant to combat_constants.ts
- Modified `startCombatForSpawn` to trigger LLM intro narration before combat begins
- Replaced immediate `scheduleCombatTick` with a 12s delayed fallback tick
- Updated `handleCombatNarrationResult` to schedule immediate combat tick on intro success
- Updated `handleCombatNarrationResult` to schedule immediate combat tick on intro failure (combat never stuck)
- Fixed missing `scheduleCombatTick` import in combat.ts reducer (was only available via `deps` inside `registerCombatReducers`, not in `startCombatForSpawn`)
- Added `ScheduleAt` import from spacetimedb for fallback tick scheduling
- Updated post-combat outro prompt to pure narrative style (no HP, mana, damage numbers per user requirement)

### Task 2: Republish server module and regenerate client bindings

- Published module to local SpacetimeDB with all quick-348 and quick-349 changes
- Regenerated client bindings (already up to date from prior generation)
- Verified `use_ability_realtime` reducer binding exists
- "No such reducer" error resolved by republishing module

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing scheduleCombatTick import in startCombatForSpawn**
- **Found during:** Task 1
- **Issue:** `scheduleCombatTick` was called at line 233 in `startCombatForSpawn` but was not imported at the top of the file (only available via `deps` destructuring inside `registerCombatReducers`)
- **Fix:** Added explicit import from `../helpers/combat`
- **Files modified:** spacetimedb/src/reducers/combat.ts
- **Commit:** 0121aad

**2. [Rule 2 - Missing Critical Functionality] Post-combat summary included game numbers**
- **Found during:** Task 1 (user requirement)
- **Issue:** `buildCombatOutroUserPrompt` included HP/maxHP numbers in survivor list and didn't instruct LLM to avoid game mechanics
- **Fix:** Changed survivor list to names only; added explicit instruction to write pure narrative without numbers
- **Files modified:** spacetimedb/src/data/llm_prompts.ts
- **Commit:** 0121aad

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 0121aad | feat(quick-349): add intro narration at combat start with delayed combat loop |
| 2 | (no changes) | Module republished to local SpacetimeDB; bindings already current |

## Self-Check: PASSED

- [x] spacetimedb/src/data/combat_constants.ts modified (COMBAT_INTRO_TIMEOUT_MICROS added)
- [x] spacetimedb/src/reducers/combat.ts modified (intro narration + fallback tick)
- [x] spacetimedb/src/helpers/combat_narration.ts modified (scheduleCombatTick on intro success/failure)
- [x] spacetimedb/src/data/llm_prompts.ts modified (pure narrative outro)
- [x] Module published to local SpacetimeDB
- [x] use_ability_realtime_reducer.ts exists in bindings
- [x] Commit 0121aad exists
