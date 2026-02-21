---
phase: quick-246
plan: "01"
subsystem: combat
tags: [combat, enemy-spawns, add-spawns, wipe, flee, bug-fix]
dependency_graph:
  requires: []
  provides: [add-spawn-reset-on-wipe]
  affects: [combat_loop]
tech_stack:
  added: []
  patterns: [multi-spawn-iteration]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Mirror the leash path's Set-based multi-spawn loop in the wipe/flee path rather than adding a separate table scan"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-21"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase quick-246 Plan 01: Return Surviving Adds to Location on FLE Summary

**One-liner:** Fixed wipe/flee path to reset all engaged add spawns (not just the primary spawn) by iterating all unique spawnIds from the enemies array, matching the leash path pattern.

## What Was Done

After quick-238, all enemies became individual EnemySpawn rows. When cross-aggro adds are pulled, they get `state='engaged'` and `lockedCombatId=combat.id`. On wipe/flee the old code used a single `by_location.filter(combat.locationId)` lookup that only found the primary spawn at the combat's locationId — add spawns at other locations (or sharing a location but distinct rows) were left orphaned in `state='engaged'`.

## The Fix

In the `!stillActive` block (line ~3139 of `combat.ts`), replaced:

```typescript
const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
  (s) => s.lockedCombatId === combat.id
);
if (spawn) { /* single spawn reset */ }
```

With:

```typescript
const wipeSpawnIds = new Set(enemies.map((e: any) => e.spawnId));
for (const spawnId of wipeSpawnIds) {
  const spawn = ctx.db.enemySpawn.id.find(spawnId);
  if (!spawn) continue;
  // count existing members + re-insert surviving pulled enemies
  // update spawn to state='available', lockedCombatId=undefined
}
```

This mirrors the leash path (line ~1928) which already used this pattern correctly.

## Behavior

- Primary spawn: reset to `state='available'`, surviving enemies (hp>0) re-inserted as EnemySpawnMember rows, dead enemies stay depleted.
- Add spawns (cross-aggro): same reset — no longer orphaned in `state='engaged'`.
- Dead enemies (currentHp===0n): NOT re-inserted; they remain depleted.
- Leash path: unchanged (was already correct).

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix wipe/flee spawn reset to handle all add spawns | de6f285 | spacetimedb/src/reducers/combat.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` completed successfully (Build finished, no TS errors).
- Modified block confirmed: iterates all spawnIds from enemies array, inserts surviving (hp>0) enemies as EnemySpawnMember rows, calls `ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined, groupCount: count })` for each spawn.

## Self-Check: PASSED

- File modified: `spacetimedb/src/reducers/combat.ts` - confirmed exists and contains correct multi-spawn loop.
- Commit de6f285 exists in git log.
