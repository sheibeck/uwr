---
phase: quick-245
plan: 01
subsystem: world-events
tags: [spacetimedb, enemy-spawn, world-events, combat]

requires:
  - phase: quick-238
    provides: individual EnemySpawn pattern (groupCount=1 per enemy)
provides:
  - spawnEventContent loop that creates N individual EnemySpawn rows per event enemy spec
affects: [world-events, enemy-spawn, combat]

tech-stack:
  added: []
  patterns: ["per-enemy loop in spawnEventContent: for (let i = 0; i < enemySpec.count; i++) creates one EnemySpawn(groupCount=1) + one EnemySpawnMember + one EventSpawnEnemy per iteration"]

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/world_events.ts

key-decisions:
  - "Align event spawner with quick-238 individual-spawn pattern: groupCount=1 per spawn instead of groupCount=N on a single spawn"
  - "despawnEventContent required no changes — already iterates by_event index and deletes each EventSpawnEnemy + linked spawn individually"

patterns-established:
  - "Event enemy spawning: one EnemySpawn + one EnemySpawnMember + one EventSpawnEnemy per enemy, all with groupCount=1n"

requirements-completed: [QUICK-245]

duration: 5min
completed: 2026-02-21
---

# Quick-245: Fix Hollowmere Infestation Event to Spawn Summary

**spawnEventContent now loops per enemy so hollowmere_rat_infestation spawns 5 individual Bog Rat EnemySpawn rows (groupCount=1 each) instead of 1 grouped spawn with groupCount=5**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21
- **Completed:** 2026-02-21
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced single-group spawn block (one EnemySpawn with groupCount=N) with a per-enemy loop (N EnemySpawn rows each with groupCount=1n)
- Each iteration inserts exactly one EnemySpawn, one EnemySpawnMember, and one EventSpawnEnemy row
- Module compiled and published successfully to local SpacetimeDB

## Task Commits

1. **Task 1: Fix spawnEventContent to loop per enemy** - `337751a` (fix)

## Files Created/Modified

- `spacetimedb/src/helpers/world_events.ts` - `spawnEventContent` rewritten to loop N times with individual spawns

## Decisions Made

- No changes needed to `despawnEventContent` — it already iterates `ctx.db.eventSpawnEnemy.by_event.filter(eventId)` and deletes each linked spawn, so it handles N individual spawns correctly without modification.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All world events (hollowmere_rat_infestation: 5 rats, hollowmere_siege: 4 bog lurkers, ashen_awakening: 3 ash jackals) now produce correct individual spawn counts
- Fire any event via the admin panel or `fire_world_event` reducer to verify N individual EnemySpawn rows appear

---
*Phase: quick-245*
*Completed: 2026-02-21*
