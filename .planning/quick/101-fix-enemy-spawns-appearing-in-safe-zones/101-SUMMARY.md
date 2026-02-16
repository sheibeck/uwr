---
phase: quick-101
plan: 01
subsystem: combat-spawning
tags: [bugfix, safe-zones, enemy-spawns]
dependency_graph:
  requires: []
  provides: [safe-zone-enforcement]
  affects: [location-bootstrap, enemy-spawning]
tech_stack:
  added: []
  patterns: [guard-clauses, defensive-spawning]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/location.ts
decisions:
  - "isSafe guards added to all 4 enemy spawn entry points for complete coverage"
  - "Bootstrap cleanup removes existing enemy spawns from safe zones (data migration pattern)"
  - "Resource node spawning unaffected - resources spawn at all locations including safe zones"
metrics:
  duration_seconds: 69
  completed: 2026-02-16
---

# Quick Task 101: Fix Enemy Spawns Appearing in Safe Zones

**One-liner:** Added isSafe guards to all enemy spawn functions preventing enemy creation at safe locations like Hollowmere, with bootstrap cleanup of existing spawns.

## Changes Made

### Core Implementation

Added `isSafe` checks to all 4 enemy spawn entry points in `spacetimedb/src/helpers/location.ts`:

**1. `ensureSpawnsForLocation` (line 254)**
- Added early-return guard at function start
- Looks up location and returns immediately if `!location || location.isSafe`
- Prevents dynamic spawns triggered by player movement/selection

**2. `ensureLocationRuntimeBootstrap` (line 282)**
- Added `isSafe` check after resource node spawning (line 287)
- **Cleanup logic**: Deletes all existing enemy spawns at safe locations
  - Iterates through `enemySpawn.by_location.filter(location.id)`
  - Deletes all spawn members via `enemySpawnMember.by_spawn.filter(spawn.id)`
  - Deletes spawn row via `enemySpawn.id.delete(spawn.id)`
- Continues to next location after cleanup (skips spawn creation loop)
- Resource nodes still spawn at safe locations (unchanged behavior)

**3. `spawnEnemy` (line 335)**
- Added guard at function start (line 341-342)
- Looks up `locationRow` and throws `SenderError('Cannot spawn enemies in safe zones')` if safe
- Variable named `locationRow` to avoid shadowing existing `location` variable at line 400

**4. `spawnEnemyWithTemplate` (line 450)**
- Added identical guard at function start (line 455-456)
- Same error message and pattern as `spawnEnemy`
- Prevents ranger Track ability from spawning at safe zones

### Verification Coverage

All enemy spawn creation paths now respect `isSafe`:
- **Bootstrap** (server startup): skips + cleans up
- **Dynamic spawn** (movement/selection): early-return
- **Direct spawn** (internal API): throws error
- **Ability spawn** (ranger Track): throws error

Already-correct paths unchanged:
- `respawnLocationSpawns`: only called from day/night cycle which filters safe zones
- `respawn_enemy` reducer: already checks `isSafe` at line 991 in combat.ts
- Day/night cycle in index.ts: already checks `isSafe` at line 249

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

**Manual verification:**
1. Publish module and run `/synccontent`
2. Bootstrap cleanup runs - safe zone enemy spawns deleted
3. Travel to Hollowmere (starting town, isSafe: true)
4. Verify ENEMIES section shows "No enemies nearby"
5. Verify resource nodes still spawn at Hollowmere
6. Travel to unsafe location (e.g., Thornvale)
7. Verify enemies spawn normally

**Expected behavior:**
- Safe zones (Hollowmere) have zero enemy spawns
- Unsafe locations continue spawning enemies normally
- Resource gathering works at all locations including safe zones

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a609ded | fix(quick-101): prevent enemy spawns in safe zones |

## Files Modified

- `spacetimedb/src/helpers/location.ts` - Added isSafe guards to 4 spawn functions (21 lines added)

## Self-Check

Verifying all claimed changes exist in the codebase.

**File modifications:**
- FOUND: spacetimedb/src/helpers/location.ts

**Commits:**
- FOUND: a609ded

## Self-Check: PASSED

All claimed files and commits verified in codebase.
