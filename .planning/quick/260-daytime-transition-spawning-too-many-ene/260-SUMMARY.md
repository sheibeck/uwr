---
phase: quick-260
plan: 01
subsystem: gameplay
tags: [enemy-spawning, day-night-cycle, location, spacetimedb]

requires: []
provides:
  - Fixed day/night transition spawn cap enforcement for locations with group enemies
affects: [enemy-spawning, location-bootstrap, day-night-cycle]

tech-stack:
  added: []
  patterns:
    - "DB-recount pattern: query actual row count after mutations rather than tracking local increment variables"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/location.ts

key-decisions:
  - "Recount DB rows after each spawnEnemy call instead of incrementing a local counter, because spawnEnemy inserts groupCount rows (not always 1) per call"
  - "Added safety break guard when newCount <= count to prevent infinite loops if spawnEnemy becomes a no-op"
  - "Placed countNonEventSpawns as a module-private function (not exported) since it is an internal implementation detail"

requirements-completed: [QUICK-260]

duration: 8min
completed: 2026-02-21
---

# Quick Task 260: Daytime Transition Spawning Too Many Enemies

**Fixed spawn-count tracking in respawnLocationSpawns and ensureLocationRuntimeBootstrap so group enemies no longer cause spawn cap to be exceeded on day/night transition**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:08:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `countNonEventSpawns(ctx, locationId)` private helper that queries the live DB for the true non-event spawn count
- Fixed `respawnLocationSpawns`: replaced local `count += 1` increment with `count = countNonEventSpawns(ctx, locationId)` after each `spawnEnemy` call, plus a safety break guard
- Fixed `ensureLocationRuntimeBootstrap`: same DB-recount pattern, same safety guard
- Module publishes without error to local SpacetimeDB

## Root Cause

`spawnEnemy` inserts one `EnemySpawn` row per group member (`groupCount` rows, which can be 2-4+). Both `respawnLocationSpawns` and `ensureLocationRuntimeBootstrap` incremented a local `count` variable by 1 per `spawnEnemy` call. For a group of 4, count went up by 1 but 4 rows were added, so the while loop ran again and kept inserting groups. Embermarch Gate (cap=6) ended up with 16 spawns on daytime transition because each group call was counted as only 1 against the cap.

## Task Commits

1. **Task 1: Fix spawn count tracking** - `4ab0c23` (fix)

## Files Created/Modified

- `spacetimedb/src/helpers/location.ts` - Added `countNonEventSpawns` helper; fixed `respawnLocationSpawns` and `ensureLocationRuntimeBootstrap` to use DB recount after each spawn call

## Decisions Made

- Used DB-recount pattern (query live DB after each mutation) rather than trying to predict how many rows `spawnEnemy` inserts — more robust and self-correcting
- Safety guard `if (newCount <= count) break` prevents infinite loops if spawnEnemy throws or is a no-op for any reason

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Fix is live on local. Manual verification: trigger a day/night transition and confirm no location exceeds its spawn cap (3 + locationId%4, max 6 non-event spawns).
- Maincloud deployment is manual — user must publish when ready.

## Self-Check

- [x] `countNonEventSpawns` exists in location.ts (line 349)
- [x] `respawnLocationSpawns` uses DB recount after each spawn (line 374)
- [x] `ensureLocationRuntimeBootstrap` uses DB recount after each spawn (line 342)
- [x] Module publishes without error
- [x] Commit `4ab0c23` exists

## Self-Check: PASSED

---
*Phase: quick-260*
*Completed: 2026-02-21*
