---
status: resolved
trigger: "Enemy spawn pool is being incorrectly drained in two scenarios involving 'adds' (delayed enemy join timers)"
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:02:00Z
---

## Current Focus

hypothesis: RESOLVED
test: n/a
expecting: n/a
next_action: n/a

## Symptoms

expected: After killing 1 rat from a group of 3 (other 2 scheduled as adds), the 2 un-joined adds should remain in spawn pool
actual: Location shows 0 or 1 rats after combat ends — the 2 pending adds were lost from spawn pool
errors: None (silent data corruption)
reproduction: 1) Location has 3 rats in spawn pool. 2) Player aggressively pulls 1 rat. 3) Other 2 scheduled as adds (~10s timer). 4) Player kills 1 rat before 10s timer fires. 5) Combat ends via victory path. 6) Check spawn pool — missing 2 rats.
started: Reported alongside flee bug (f913ad0 fixed flee case partially)

Bug 3 (flee with adds):
expected: Kill 1 of 4 rats, flee — location should show 3 rats
actual: Location shows 4 rats (all restored including the dead one)
reproduction: 1) 4 rats in spawn pool. 2) Pull -> 3 adds join. 3) Kill 1. 4) Flee. 5) Check spawn pool — still 4 instead of 3.

What works: Killing a rat that jumps a player during resource loot correctly removes it from spawn pool.

## Eliminated

- hypothesis: The flee path doesn't re-insert dead enemies
  evidence: Line 2081 `if (enemy.spawnId === spawnId && enemy.currentHp > 0n)` correctly skips killed enemies
  timestamp: 2026-02-22

- hypothesis: Bug 3 is caused by re-inserting killed enemies as EnemySpawnMember rows
  evidence: Not directly — the issue is that the killed enemy's spawn row is updated to state='available' with groupCount=0 rather than being deleted, causing it to appear in the UI's availableEnemies list
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: spawnEnemy() in helpers/location.ts lines 477-502
  found: Each enemy = 1 EnemySpawn row (groupCount:1) + 1 EnemySpawnMember row. A "group of 3 rats" = 3 separate EnemySpawn rows.
  implication: reserveAdds() reserves multiple separate EnemySpawn rows, setting each to state='engaged'

- timestamp: 2026-02-22
  checked: reserveAdds() in combat.ts lines 1053-1071
  found: For 'partial' outcome, reserved add spawns are set to state='engaged', lockedCombatId=combat.id. combatPendingAdd rows are inserted with arriveAtMicros = now + 10s. takeSpawnMember() is NOT called at reserve time.
  implication: The pending add spawns have their EnemySpawnMember rows intact at this point.

- timestamp: 2026-02-22
  checked: victory path in combat.ts lines 2639-2655
  found: Victory path iterates only over 'enemies' (combatEnemy rows). Pending adds that haven't joined have no combatEnemy rows. clearCombatArtifacts() deletes combatPendingAdd rows but does NOT restore their spawn states. Those spawns remain state='engaged' with a stale lockedCombatId pointing to a resolved combat. They are permanently leaked.
  implication: BUG 2 ROOT CAUSE confirmed.

- timestamp: 2026-02-22
  checked: leash/flee path in combat.ts lines 2047-2116
  found: Same issue — spawnIds only covers spawns from enemies (combatEnemy rows). Pending adds not yet joined are not in enemies. clearCombatArtifacts() deletes combatPendingAdd rows but doesn't restore spawn states.
  implication: Also affects flee path when player flees before pending adds arrive.

- timestamp: 2026-02-22
  checked: leash/flee path spawn update lines 2091-2096 (pre-fix)
  found: `groupCount: count > 0n ? count : spawn.groupCount`. For killed rats: count=0, spawn.groupCount=0. groupCount=0. But state is forced to 'available' (not deleted). UI availableEnemies filters by state='available'|'pulling', so shows groupCount=0 spawn as an enemy.
  implication: BUG 3 ROOT CAUSE confirmed. Killed rat's spawn becomes a ghost entry in the location.

- timestamp: 2026-02-22
  checked: UI availableEnemies computed in useCombat.ts lines 373-380
  found: Filters by state === 'available' || state === 'pulling'. Each EnemySpawn row = one enemy entry, regardless of groupCount.
  implication: A spawn with state='available' and groupCount=0 still shows as an enemy in the location list.

## Resolution

root_cause:
  Bug 2 (victory/flee/death paths + pending adds): clearCombatArtifacts() deletes combatPendingAdd rows but
    does not restore the spawn state of corresponding enemy spawns. Those spawns were set to state='engaged'
    by reserveAdds() and never released, causing them to be permanently inaccessible (ghost spawns stuck in
    'engaged' state with a stale lockedCombatId).

  Bug 3 (flee/leash and player-death paths + killed enemies): The spawn restoration block updates all enemy
    spawns to state='available' regardless of whether the enemy was killed. A killed enemy's spawn ends up
    with state='available' and groupCount=0 — appearing as a ghost entry in the UI's enemy list. The victory
    path correctly deletes spawns with groupCount=0; the flee/death paths did not.

fix:
  Bug 2: In clearCombatArtifacts(), before deleting each combatPendingAdd row, check if the row has a
    spawnId and if that spawn is still in state='engaged' locked to this combat. If so, restore it to
    state='available' with lockedCombatId=undefined. The EnemySpawnMember rows are still intact (takeSpawnMember
    was never called for pending adds), so groupCount is preserved correctly.

  Bug 3: In both the flee/leash path and the player-death path, after computing the restored count for each
    spawn: if count > 0 → update to available (as before); if count === 0 → delete the spawn and schedule a
    respawn timer. This matches what the victory path already does correctly.

verification:
  Code review confirms:
  - clearCombatArtifacts fix covers all 5 combat exit paths (admin end, empty enemies, leash/flee, victory, player death)
  - flee/leash fix at line 2105 and player-death fix at line 3332 mirror the victory path logic exactly
  - No new TypeScript errors introduced (pre-existing errors unchanged)
  - The 'engaged' state guard prevents false-positives: pending adds that DID join have their combatPendingAdd
    row deleted at join time, so they never appear in the clearCombatArtifacts loop

files_changed:
  - spacetimedb/src/reducers/combat.ts (3 hunks: clearCombatArtifacts, flee/leash spawn block, player-death spawn block)
