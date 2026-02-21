---
phase: quick-266
plan: "01"
subsystem: combat
tags: [bug-fix, social-adds, spawn-management, combat]
dependency_graph:
  requires: []
  provides: [social-add-spawn-count-fix]
  affects: [enemy-spawn-lifecycle, combat-victory-resolution]
tech_stack:
  added: []
  patterns: [takeSpawnMember-for-social-adds]
key_files:
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Pass consumeSpawnCount=true to addEnemyToCombat for pending social adds so takeSpawnMember is called when adds enter combat"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-21"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-266 Plan 01: Fix Social Add Kills Not Decrementing Spawn Count

**One-liner:** Set `consumeSpawnCount=true` for social adds entering combat so `takeSpawnMember` decrements `groupCount`, preventing reappearance after victory.

## What Was Done

When a social add joins combat via `combatPendingAdd`, `addEnemyToCombat` was called with `consumeSpawnCount=false`. This skipped `takeSpawnMember`, leaving `groupCount` and `EnemySpawnMember` rows unchanged. At victory resolution, `spawn.groupCount > 0` caused the spawn to be reset to 'available' instead of deleted — making killed social adds immediately reappear on the map.

The fix: changed the 6th argument in the `addEnemyToCombat` call (line 2136 of combat.ts) from `false` to `true`. This causes `takeSpawnMember` to fire when the add enters combat, removing the member row and decrementing `groupCount`. Victory resolution then correctly deletes the spawn and schedules a respawn.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Change consumeSpawnCount to true for pending social adds | 2a0092d | spacetimedb/src/reducers/combat.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

Module compiled and published to local SpacetimeDB without errors.

## Self-Check: PASSED

- File modified: `spacetimedb/src/reducers/combat.ts` - FOUND
- Commit 2a0092d - FOUND
- Line 2136 reads `true` - CONFIRMED
