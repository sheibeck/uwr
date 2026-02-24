---
phase: quick-313
plan: 01
subsystem: client
tags: [spacetimedb, vite, module-bindings, v2-sdk]

# Dependency graph
requires:
  - phase: quick-311
    provides: "v2 bare type migration across 36 files"
  - phase: quick-312
    provides: "initial diagnosis of columns undefined error"
provides:
  - "Clean v2 module_bindings without private/scheduled table definitions"
  - "Stale v1 binding files removed from repo"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "v2 SDK bindings must exclude private/scheduled tables — client cannot subscribe to them"

key-files:
  created: []
  modified:
    - "src/module_bindings/index.ts"
    - "src/module_bindings/types/reducers.ts"

key-decisions:
  - "Committed existing working-tree changes from prior spacetime generate rather than re-running"

patterns-established:
  - "Private server tables must never appear in client module_bindings — causes undefined column metadata crash"

requirements-completed: [QUICK-313]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Quick 313: Debug Persistent Columns Undefined Error Summary

**Removed 16 private/scheduled tables from v2 bindings and deleted 32 stale v1 files to fix 'Cannot read properties of undefined (reading columns)' crash**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T19:56:30Z
- **Completed:** 2026-02-24T19:58:04Z
- **Tasks:** 2
- **Files modified:** 34

## Accomplishments
- Eliminated the "Cannot read properties of undefined (reading 'columns')" error that crashed the SpacetimeDB v2 client
- Removed 16 private/scheduled table definitions from index.ts (aggro_entry, bank_slot, bard_song_tick, cast_tick, combat_loop_tick, day_night_tick, disconnect_logout_tick, effect_tick, enemy_respawn_tick, event_despawn_tick, health_regen_tick, hot_tick, inactivity_tick, location_enemy_template, loot_table_entry, resource_gather_tick)
- Deleted 32 stale v1-style separate binding files (_table.ts and _reducer.ts) no longer produced by v2 generator
- Cleared Vite dependency cache and verified dev server starts cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit clean v2 bindings and delete stale v1 files** - `d37b6f7` (fix)
2. **Task 2: Clear Vite dependency cache and verify dev server starts** - no commit (cache operation only)

## Files Created/Modified
- `src/module_bindings/index.ts` - Updated v2 bindings without 16 private table definitions
- `src/module_bindings/types/reducers.ts` - Updated to exclude private/scheduled reducer types
- 32 stale v1 files deleted (16 `*_table.ts` + 16 `*_reducer.ts` for private/scheduled entities)

## Decisions Made
- Used existing working-tree changes from prior `spacetime generate` run rather than re-running the generator

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Client bindings are clean and only reference public tables
- Vite dev server compiles without errors
- No blockers for continued development

## Self-Check: PASSED

- FOUND: src/module_bindings/index.ts
- FOUND: src/module_bindings/types/reducers.ts
- FOUND: 313-SUMMARY.md
- FOUND: commit d37b6f7
- CONFIRMED DELETED: aggro_entry_table.ts (and all 31 other stale files)

---
*Phase: quick-313*
*Completed: 2026-02-24*
