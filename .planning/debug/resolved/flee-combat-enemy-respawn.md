---
status: resolved
trigger: "Enemies killed during combat respawn to full count after player successfully flees."
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:05:00Z
---

## Current Focus

hypothesis: RESOLVED
test: Fix applied and verified via code trace
expecting: n/a
next_action: n/a

## Symptoms

expected: Enemies killed during combat should remain dead after the player flees. If player killed 1 of 3 wolves then fled, the zone should show 2 wolves.
actual: After fleeing, the zone restores to the original pre-combat enemy count. Kill 1 of 3 wolves, flee successfully → zone shows 3 wolves again. Kill 1 of 4 night rats (pulled 3), flee → zone shows 4 night rats again.
errors: None visible to the user — just incorrect enemy counts.
reproduction: Enter combat with multiple enemies, kill at least one, then successfully flee. After fleeing, check enemy count in the zone.
started: Newly discovered. Location: Ashen Road. Characters: level 1 enchanter.

## Eliminated

(none — root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-22T00:01:00Z
  checked: spacetimedb/src/reducers/combat.ts lines 2046-2116 (leash reset block)
  found: |
    When activeParticipants.length === 0 (all fled/dead), the leash reset executes.
    It collects ALL enemies from combatEnemy.by_combat (line 2059), including those with currentHp=0n (killed during fight).
    It then re-inserts ALL of them as enemySpawnMember rows (lines 2079-2089) with no HP check.
    This restores the full original spawn count, even for enemies the player killed.
  implication: Every enemy pulled into combat gets a spawn member row, regardless of whether it was killed.

- timestamp: 2026-02-22T00:01:00Z
  checked: takeSpawnMember (lines 54-64)
  found: When an enemy is pulled into combat, its EnemySpawnMember row is deleted by takeSpawnMember().
  implication: The only way to restore the spawn is via the leash reset re-insert logic. This logic must skip dead enemies.

- timestamp: 2026-02-22T00:01:00Z
  checked: Victory path (lines 2607+) vs leash path (lines 2046-2116)
  found: |
    Victory path (all enemies dead): Spawn is properly depleted via enemySpawn.id.delete or state update.
    Leash path (flee/all-dead participants): Was restoring spawn to full count for all enemies in combat, dead or alive.
    Leash check fires before livingEnemies check; when all enemies are killed, victory fires normally.
  implication: The leash path intentionally resets living enemies (correct behavior) but incorrectly also reset dead enemies.

- timestamp: 2026-02-22T00:03:00Z
  checked: HP reset loop (lines 2049-2054) vs enemies snapshot
  found: |
    The enemies array is captured at line 1941 as a snapshot before the HP reset.
    The HP reset writes to DB but does not update the enemies array.
    Therefore enemy.currentHp on line 2081 still holds the pre-reset value — correctly identifying dead enemies.
  implication: Fix using enemy.currentHp > 0n is safe; it checks the original combat-end HP, not the post-reset value.

## Resolution

root_cause: |
  In the leash reset block (combat.ts ~line 2079), when re-adding enemies back to the spawn after
  a leash (all players fled/dead), the code iterated ALL combatEnemy rows for the combat and re-inserted
  them as enemySpawnMember rows — including enemies with currentHp=0n (killed during combat).
  This restored the full original enemy count instead of preserving kills made before fleeing.

fix: |
  Added `enemy.currentHp > 0n` condition inside the loop at lines 2080-2089 to skip dead enemies
  when re-populating spawn members after a leash reset. The enemies array snapshot preserves
  original HP values before any HP restoration, so this check correctly identifies combat kills.

verification: |
  Code trace verified:
  - Scenario A (kill 1 of 3 wolves, flee): enemies snapshot has 2 alive (currentHp>0), 1 dead (currentHp=0).
    savedMembers=[] (all were pulled). Loop re-inserts 2 alive wolves. groupCount=2. Correct.
  - Scenario B (kill 1 of 3 pulled from 4, flee): savedMembers=[1 unpulled]. Re-inserts 2 alive.
    Total groupCount=3. Correct.
  - Scenario C (all enemies killed before flee): livingEnemies.length===0 triggers victory branch
    (line 2607) first; leash block never reached. Unaffected.
  - Scenario D (flee without killing anyone): all enemies have currentHp>0. All re-inserted as before.
    Full spawn restored. Correct.

files_changed:
  - spacetimedb/src/reducers/combat.ts
