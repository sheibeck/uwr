---
phase: quick-213
plan: 01
subsystem: combat
tags: [spacetimedb, typescript, xp, refactor, rename]

# Dependency graph
requires: []
provides:
  - "awardXp function in helpers/combat.ts (renamed from awardCombatXp)"
  - "awardXp re-exported in index.ts import and deps object"
affects: [combat, quests]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/index.ts

key-decisions:
  - "awardCombatXp renamed to awardXp — function now called from quest reducers too, making the combat-specific name misleading"

patterns-established: []

requirements-completed: [QUICK-213]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Quick-213: Rename awardCombatXp to awardXp Summary

**Pure identifier rename of `awardCombatXp` to `awardXp` across 4 files — no logic changes, zero occurrences of the old name remain**

## Performance

- **Duration:** 3 min
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Renamed export function in `helpers/combat.ts` from `awardCombatXp` to `awardXp`
- Updated named import and both call sites in `reducers/commands.ts` (kill quest + delivery quest XP)
- Updated both `deps.awardCombatXp(` calls to `deps.awardXp(` in `reducers/combat.ts`
- Updated named import and deps object entry in `index.ts`
- Updated inline comments in `reducers/commands.ts` to reference `awardXp`

## Task Commits

1. **Task 1: Rename awardCombatXp to awardXp in all four files** - `09b62ab` (refactor)

## Files Created/Modified
- `spacetimedb/src/helpers/combat.ts` - Export function renamed from `awardCombatXp` to `awardXp`
- `spacetimedb/src/reducers/commands.ts` - Named import and 2 call sites updated; inline comments updated
- `spacetimedb/src/reducers/combat.ts` - Both `deps.awardCombatXp(` occurrences updated to `deps.awardXp(`
- `spacetimedb/src/index.ts` - Named import (line 133) and deps object entry (line 434) updated

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `awardXp` is the canonical name. Any future callers should import `awardXp` from `helpers/combat.ts`.

---
*Phase: quick-213*
*Completed: 2026-02-19*
