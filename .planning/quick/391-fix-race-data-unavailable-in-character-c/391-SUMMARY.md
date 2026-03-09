---
phase: quick-391
plan: 01
subsystem: character-display
tags: [bugfix, race-lookup, circular-dependency, refactor]
dependency_graph:
  requires: []
  provides: [helpers/look.ts, race-definition-lookup]
  affects: [intent.ts, travel.ts, commands.ts]
tech_stack:
  added: []
  patterns: [race_definition-by_name-index-lookup, helpers-extraction]
key_files:
  created:
    - spacetimedb/src/helpers/look.ts
  modified:
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/helpers/travel.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/intent.test.ts
decisions:
  - Re-export buildLookOutput from intent.ts for backward compatibility
  - race_definition checked first, legacy race table as fallback
metrics:
  duration: 2min
  completed: 2026-03-09
---

# Quick Task 391: Fix Race Data Unavailable in Character Command

Race lookup in character command now uses race_definition table (v2.0 generated races) with by_name index, falling back to legacy race table. Extracted buildLookOutput to helpers/look.ts to break circular dependency between intent.ts and travel.ts.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract buildLookOutput to helpers/look.ts | 04d3530 | helpers/look.ts (new), intent.ts, travel.ts, commands.ts, intent.test.ts |
| 2 | Fix race lookup to use race_definition | ab10b23 | intent.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. `spacetime publish uwr -p spacetimedb` -- compiled and published successfully
2. No circular dependency: travel.ts imports from `./look` not `../reducers/intent`
3. All 7 existing tests pass
4. Character command checks race_definition.by_name first, falls back to race.iter()
