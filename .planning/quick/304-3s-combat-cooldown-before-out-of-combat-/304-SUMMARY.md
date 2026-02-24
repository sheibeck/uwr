---
phase: quick-304
plan: 01
subsystem: combat
tags: [regen, combat-cooldown, stamina, spacetimedb]

# Dependency graph
requires:
  - phase: 3.1
    provides: "Combat system with regen_health reducer and clearCombatArtifacts"
provides:
  - "3-second post-combat cooldown using in-combat regen rates"
  - "lastCombatEndAt timestamp on Character table"
  - "Bumped stamina regen (in-combat 1->2, out-of-combat floor 2->3)"
affects: [combat-balance, regen]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Post-combat cooldown via timestamp comparison in regen tick"]

key-files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/combat.ts
    - src/module_bindings/character_table.ts
    - src/module_bindings/character_type.ts

key-decisions:
  - "Used u64 microseconds instead of t.timestamp() for lastCombatEndAt to match existing microsecond arithmetic patterns in regen system"
  - "Cooldown check uses both undefined and null guards for robustness with optional fields"

patterns-established:
  - "Post-combat cooldown: stamp exit time, check elapsed in regen tick"

requirements-completed: [COMBAT-COOLDOWN-REGEN, STAMINA-REGEN-BUMP]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Quick 304: 3s Combat Cooldown Before Out-of-Combat Regen Summary

**3-second post-combat cooldown using in-combat regen rates, with stamina regen bumped (in-combat 1->2 per tick, out-of-combat floor 2->3)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T03:05:04Z
- **Completed:** 2026-02-24T03:06:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Characters now use in-combat regen rates for 3 seconds after combat ends before switching to out-of-combat rates
- In-combat stamina regen doubled from 1 to 2 per tick
- Out-of-combat stamina regen minimum floor raised from 2 to 3
- clearCombatArtifacts stamps lastCombatEndAt on all combat participants when combat resolves

## Task Commits

Each task was committed atomically:

1. **Task 1: Add lastCombatEndAt field to Character table** - `c9715db` (feat)
2. **Task 2: Stamp lastCombatEndAt in clearCombatArtifacts and update regen logic** - `89d88f8` (feat)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - Added optional u64 lastCombatEndAt field to Character table
- `spacetimedb/src/reducers/combat.ts` - Stamped lastCombatEndAt in clearCombatArtifacts, added COMBAT_COOLDOWN_MICROS constant, cooldown detection in regen_health, bumped stamina regen rates
- `src/module_bindings/character_table.ts` - Regenerated client bindings
- `src/module_bindings/character_type.ts` - Regenerated client bindings

## Decisions Made
- Used u64 microseconds for lastCombatEndAt to match existing microsecond arithmetic in the regen system (REGEN_TICK_MICROS, startedAtMicros patterns)
- Changed clearCombatArtifacts guard from `if (character && character.combatTargetEnemyId)` to `if (character)` so lastCombatEndAt is always stamped, even if combatTargetEnemyId was already cleared

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Combat cooldown system is complete and deployed locally
- Module published successfully with --clear-database (schema change)
- Client bindings regenerated

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: quick-304*
*Completed: 2026-02-24*
