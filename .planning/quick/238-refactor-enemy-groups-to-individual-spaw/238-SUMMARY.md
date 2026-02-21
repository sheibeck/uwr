---
phase: quick-238
plan: 01
subsystem: backend-spawning, backend-combat, client-ui
tags: [enemy-spawning, combat, faction, aggro, individual-spawns, location]
dependency_graph:
  requires: []
  provides: [individual-enemy-spawns, faction-based-aggro, danger-tiered-caps]
  affects: [EnemySpawn, EnemySpawnMember, resolve_pull, LocationGrid]
tech_stack:
  added: []
  patterns: [individual-row-per-enemy, faction-id-matching, danger-tier-scaling]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/location.ts
    - spacetimedb/src/reducers/combat.ts
    - src/components/LocationGrid.vue
    - spacetimedb/src/index.ts
decisions:
  - "Individual EnemySpawn rows (groupCount=1 each) instead of single multi-member spawn"
  - "factionId equality used for cross-spawn aggro candidates (undefined factionId never aggroes)"
  - "Danger-tiered caps: T1 (dm<130)=6, T2 (dm<190)=9, T3 (dm>=190)=12"
  - "groupCount field kept in EnemySummary type for debugging/future use"
metrics:
  duration: ~20min
  completed: "2026-02-21"
  tasks_completed: 4
  files_modified: 4
---

# Phase quick-238 Plan 01: Refactor Enemy Groups to Individual Spawns Summary

**One-liner:** Refactored enemy group spawning from single EnemySpawn-with-N-members to N individual EnemySpawn rows each with groupCount=1, enabled faction-based cross-spawn aggro in resolve_pull, and removed group multiplier display from client.

## Objective

Each enemy in a location is now its own first-class entity: individually targetable, individually trackable, and capable of responding to combat as a member of a faction rather than as a sub-member of a single spawn object.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor spawnEnemy to individual spawns with danger-tiered caps | 8b15e8a | spacetimedb/src/helpers/location.ts |
| 2 | Enable cross-spawn faction aggro in resolve_pull and update log messages | 47468ca | spacetimedb/src/reducers/combat.ts |
| 3 | Remove group multiplier display from client | ea62fbe | src/components/LocationGrid.vue |
| 4 | Update index.ts respawn call site to use danger-tiered caps | ee34b52 | spacetimedb/src/index.ts |

## What Was Built

### Task 1 — location.ts refactor

Added `getLocationSpawnCap(ctx, locationId): number` helper:
- dangerMultiplier < 130 (T1 starter): returns 6
- dangerMultiplier < 190 (T2 border): returns 9
- dangerMultiplier >= 190 (T3 dungeon/high): returns 12
- Default if region not found: 6

Refactored `spawnEnemy`: Instead of one `ctx.db.enemySpawn.insert` with `groupCount=N` followed by `seedSpawnMembers(..., N)`, now loops N times — each iteration inserts one EnemySpawn row with `groupCount: 1n` plus one EnemySpawnMember, calls `refreshSpawnGroupCount`. Returns first spawn (same return contract as before).

Refactored `spawnEnemyWithTemplate` identically.

Updated `ensureLocationRuntimeBootstrap` to use `getLocationSpawnCap` instead of `DEFAULT_LOCATION_SPAWNS`.

Updated `ensureSpawnsForLocation` to track both `available` and `total` counts, enforcing `total < cap` as the outer loop bound.

### Task 2 — combat.ts resolve_pull changes

Three changes:
1. `PULL_ALLOW_EXTERNAL_ADDS = true` (was `false`)
2. Candidates filter now uses `factionId` equality — both template and candidate must have defined `factionId` and they must match. Removes `socialGroup`/`creatureType` string matching.
3. Log messages updated to drop "1 of N" / "Remaining in group" framing:
   - Partial: "Your X pull draws attention. You engage Wolf, but 2 adds of the same faction will arrive in 4s."
   - Failure: "Your X pull is noticed. You engage Wolf and 2 adds of the same faction rush in immediately."
   - Success: "Your X pull is clean. You engage Wolf alone."

### Task 3 — LocationGrid.vue

Removed `<span v-if="enemy.groupCount > 1n">x{{ enemy.groupCount }}</span>` badge from enemy tile.
Updated context menu subtitle from `` `L${enemy.level}${enemy.groupCount > 1n ? ' x' + enemy.groupCount : ''} · ${enemy.factionName}` `` to `` `L${enemy.level} · ${enemy.factionName}` ``.

### Task 4 — index.ts

Added `getLocationSpawnCap` to location import block. Changed day/night cycle respawn from `respawnLocationSpawns(ctx, location.id, DEFAULT_LOCATION_SPAWNS)` to `respawnLocationSpawns(ctx, location.id, getLocationSpawnCap(ctx, location.id))`.

## Decisions Made

1. **Individual rows per enemy**: Each physical enemy is a separate EnemySpawn row with groupCount=1. The `groupCount` roll (minGroup/maxGroup + danger bias) now controls how many individual rows to insert, not how large a single spawn's group is.

2. **factionId-only aggro**: Dropped socialGroup/creatureType string matching in favor of factionId equality. Enemies with undefined factionId never generate faction adds — clean pull behavior is preserved for unfactioned enemies.

3. **Cap tracking in ensureSpawnsForLocation**: Added `total` counter alongside `available` so the cap is enforced even when some spawns are engaged/depleted.

4. **groupCount kept in EnemySummary**: The client-side type retains the field for debugging and potential future use; it's just no longer displayed.

## Deviations from Plan

None — plan executed exactly as written.

**Note:** `npm run build` (client) fails with pre-existing TypeScript errors in App.vue unrelated to this task. LocationGrid.vue itself has no TypeScript errors. The pre-existing errors were confirmed by checking git stash state.

## Self-Check: PASSED

Files modified:
- [x] spacetimedb/src/helpers/location.ts — getLocationSpawnCap added, spawnEnemy/spawnEnemyWithTemplate refactored
- [x] spacetimedb/src/reducers/combat.ts — flag flipped, candidates filter updated, messages updated
- [x] src/components/LocationGrid.vue — badge removed, subtitle simplified
- [x] spacetimedb/src/index.ts — import updated, respawn call updated

Commits:
- [x] 8b15e8a — Task 1
- [x] 47468ca — Task 2
- [x] ea62fbe — Task 3
- [x] ee34b52 — Task 4
