---
phase: quick-207
plan: 01
subsystem: combat
tags: [spacetimedb, typescript, enemy-spawn, combat, player-death]

# Dependency graph
requires: []
provides:
  - Fixed player-death spawn restore that preserves un-pulled EnemySpawnMember rows
affects: [combat, enemy-spawn, spawn-restore]

# Tech tracking
tech-stack:
  added: []
  patterns: [count-existing-rows-before-inserting when restoring spawn group members]

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Remove delete-all-members loop so un-pulled enemies retain their EnemySpawnMember rows"
  - "Use ?? 0n fallback for roleTemplateId instead of guarding with if (enemyRow.enemyRoleTemplateId)"
  - "Count existing un-pulled members first with remainingMemberCount, then add pulled survivors on top"

patterns-established:
  - "Spawn restore pattern: count existing rows + re-insert only pulled survivors, never delete-all and re-insert-all"

requirements-completed: [QUICK-207]

# Metrics
duration: 5min
completed: 2026-02-18
---

# Quick Task 207: Restore Surviving Enemies to Spawn Group Summary

**Player-death spawn restore now preserves un-pulled EnemySpawnMember rows and counts them in groupCount, so the full surviving group is available when players re-approach a spawn after dying.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-18T00:00:00Z
- **Completed:** 2026-02-18T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed the delete-all-EnemySpawnMember loop from the player-death spawn restore block
- Added `remainingMemberCount` to count existing un-pulled rows before re-inserting pulled survivors
- Replaced the `if (enemyRow.enemyRoleTemplateId)` guard with `?? 0n` fallback so all surviving pulled enemies are re-inserted regardless of roleTemplateId
- `groupCount` now correctly reflects: (un-pulled survivors) + (pulled survivors with hp > 0)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace spawn restore block in player-death path** - `9988410` (fix)

## Files Created/Modified
- `spacetimedb/src/reducers/combat.ts` - Replaced delete-all + re-insert-all pattern with count-existing + re-insert-pulled-survivors pattern in the player-death spawn restore block (~line 2800)

## Decisions Made
- Remove the delete loop entirely rather than refining it. Un-pulled members already have correct EnemySpawnMember rows so they need no action — only pulled enemies (who had their rows implicitly removed when pulled) need to be re-inserted.
- Use `?? 0n` fallback for roleTemplateId to avoid silently skipping enemies whose roleTemplateId is 0/falsy — the old `if (enemyRow.enemyRoleTemplateId)` guard was discarding valid enemies.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled without errors in combat.ts. Pre-existing errors in other files (helpers/combat.ts, helpers/corpse.ts, helpers/location.ts, etc.) are out of scope and were not touched. Module published successfully.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fix deployed to local SpacetimeDB instance
- Manual test: pull 1-of-N enemies from a spawn group, die, re-approach spawn to verify full group count restored

---
*Phase: quick-207*
*Completed: 2026-02-18*
