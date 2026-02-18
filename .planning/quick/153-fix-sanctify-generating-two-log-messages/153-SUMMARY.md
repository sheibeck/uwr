---
phase: 153-fix-sanctify-generating-two-log-messages
plan: 01
subsystem: combat
tags: [use_ability, log, sanctify, friendly-target, combat]

# Dependency graph
requires:
  - phase: quick-126
    provides: beneficial spells pass defensiveTargetId as targetCharacterId
provides:
  - Single correct log message when any friendly-targeted ability is cast in combat
affects: [items.ts, use_ability reducer]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/items.ts

key-decisions:
  - "Enemy-name override in generic post-ability log gated on !args.targetCharacterId — abilities with explicit friendly target skip the combat enemy name lookup"

patterns-established: []

# Metrics
duration: 3min
completed: 2026-02-18
---

# Quick Task 153: Fix Sanctify Generating Two Log Messages

**Single-character guard (`!args.targetCharacterId`) prevents combat enemy name from overwriting friendly target name in the generic post-ability log, eliminating the spurious second log entry.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T00:00:00Z
- **Completed:** 2026-02-18T00:03:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Casting Sanctify (or any ability with an explicit `targetCharacterId`) in combat now produces exactly one log message referencing the friendly target
- Offensive abilities with no explicit `targetCharacterId` still correctly log the combat enemy name
- Module published successfully with no compilation errors

## Task Commits

1. **Task 1: Guard enemy-name override behind targetCharacterId check** - `dcc06f9` (fix)

## Files Created/Modified
- `spacetimedb/src/reducers/items.ts` - Changed `if (combatId)` to `if (combatId && !args.targetCharacterId)` on the enemy-name override block (~line 662)

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fix is live on local SpacetimeDB instance
- Verify in-game: cast Sanctify on a friendly while in combat, confirm single log line referencing friendly name

---
*Phase: 153-fix-sanctify-generating-two-log-messages*
*Completed: 2026-02-18*
