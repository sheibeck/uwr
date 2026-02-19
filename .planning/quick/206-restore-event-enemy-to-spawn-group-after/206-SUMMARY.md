---
phase: quick-206
plan: 01
subsystem: combat
tags: [spacetimedb, combat, spawn, leash, flee]

# Dependency graph
requires: []
provides:
  - "Leash-restore block in combat.ts re-inserts EnemySpawnMember rows for actively-pulled enemies"
  - "groupCount on EnemySpawn is restored to full original composition after all-flee events"
affects: [combat, spawn-groups, event-encounters]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Loop over the in-scope enemies[] array (already populated) rather than re-querying the DB, since CombatEnemy rows persist until clearCombatArtifacts runs after this block"
  - "Use enemyRoleTemplateId ?? 0n to handle enemies that have no role template, matching existing EnemySpawnMember insert pattern"

patterns-established: []

requirements-completed: [QUICK-206]

# Metrics
duration: 5min
completed: 2026-02-18
---

# Phase quick-206 Plan 01: Restore Event Enemy to Spawn Group After Flee Summary

**Fixed leash-restore block in combat.ts to re-insert EnemySpawnMember rows for pulled CombatEnemy rows, restoring groupCount to the full original spawn composition after all-flee events**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-18T00:00:00Z
- **Completed:** 2026-02-18T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Identified the missing loop in the all-flee/leash restore block in combat.ts
- Inserted a second loop after savedMembers re-insertion that iterates over the in-scope `enemies` array
- Each CombatEnemy whose `spawnId` matches the current spawn gets an EnemySpawnMember row re-inserted and increments `count`
- The corrected `count` feeds directly into `groupCount` in the `ctx.db.enemySpawn.id.update(...)` call, restoring the full original composition (e.g. 5 rats, not 4)

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-insert CombatEnemy rows as EnemySpawnMembers on leash restore** - `fdf46d1` (fix)

## Files Created/Modified
- `spacetimedb/src/reducers/combat.ts` - Added second loop in all-flee leash-restore block (lines 1665-1677) to re-insert EnemySpawnMember rows for actively-pulled enemies and increment groupCount accordingly

## Decisions Made
- Loop over existing `enemies[]` array rather than re-querying DB: CombatEnemy rows persist in scope until `clearCombatArtifacts` is called after this block, so they are available and correct to use here.
- Use `enemy.enemyRoleTemplateId ?? 0n` to handle enemies with no role template, consistent with the existing `EnemySpawnMember` insert pattern used in the savedMembers loop above.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated files (helpers/combat.ts, helpers/corpse.ts, helpers/location.ts, reducers/items.ts, reducers/movement.ts, reducers/social.ts, seeding/ensure_enemies.ts) were present before this change. No errors exist in `src/reducers/combat.ts`. These are out of scope per deviation rules and logged here for awareness.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fix is complete and committed
- Manual gameplay test required: pull 1 of 5 rats into combat, flee, verify spawn shows 5 rats again

---
*Phase: quick-206*
*Completed: 2026-02-18*
