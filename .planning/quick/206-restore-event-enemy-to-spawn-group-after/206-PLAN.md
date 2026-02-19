---
phase: quick-206
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements:
  - QUICK-206
must_haves:
  truths:
    - "After fleeing combat where 1 of 5 rats was pulled, the spawn group shows 5 rats again"
    - "groupCount on EnemySpawn is restored to the original full count, not the reduced mid-combat count"
    - "EnemySpawnMember rows for actively-in-combat enemies are re-inserted on leash restore"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Fixed leash-restore block that re-inserts EnemySpawnMember rows for enemies that were pulled into combat"
      contains: "for (const enemy of enemies)"
  key_links:
    - from: "enemies (CombatEnemy[])"
      to: "ctx.db.enemySpawnMember.insert"
      via: "second loop after savedMembers re-insertion, filtering by spawnId"
      pattern: "enemy\\.spawnId === spawnId"
---

<objective>
Restore the full enemy group count when all players flee combat.

When a player pulls enemies from a spawn group (e.g. 1 rat from 5), the pulled
enemy's EnemySpawnMember row is deleted by takeSpawnMember(). On leash restore,
only the 4 un-pulled rows are re-inserted, so groupCount becomes 4 permanently.

Fix: after re-inserting savedMembers, loop over the in-scope `enemies` array and
re-insert an EnemySpawnMember for each CombatEnemy whose spawnId matches, then
increment `count` so groupCount reflects the correct total.

Purpose: Prevent spawn group shrinkage from player flee actions.
Output: Modified combat.ts with corrected leash-restore block.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-insert CombatEnemy rows as EnemySpawnMembers on leash restore</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In the all-flee/leash restore block (around line 1664), after the savedMembers
re-insertion loop ends (after `count += 1n;` on line 1663) and BEFORE the
`ctx.db.enemySpawn.id.update(...)` call on line 1665, insert the following block:

```typescript
          // Re-add enemies that were actively in combat
          // (their EnemySpawnMember rows were deleted by takeSpawnMember() when pulled)
          for (const enemy of enemies) {
            if (enemy.spawnId === spawnId) {
              ctx.db.enemySpawnMember.insert({
                id: 0n,
                spawnId: spawnId,
                enemyTemplateId: enemy.enemyTemplateId,
                roleTemplateId: enemy.enemyRoleTemplateId ?? 0n,
              });
              count += 1n;
            }
          }
```

The indentation must match the surrounding block (10 spaces / same as the
savedMembers re-insertion loop above it).

No imports are needed. No schema changes. `enemies`, `spawnId`, and `count` are
all already in scope at this location.

The updated `count` feeds directly into the `groupCount` field of the
`ctx.db.enemySpawn.id.update(...)` call immediately below, correcting the value
from 4 to 5 (or whatever the true total is).
  </action>
  <verify>
1. Compile the backend module:
   ```
   cd spacetimedb && spacetime publish uwr --project-path . --dry-run
   ```
   (or the equivalent local build command used in this project — confirm zero
   TypeScript errors)

2. Manual gameplay test:
   - Start the Hollowmere Infestation event (spawns a group of 5 rats)
   - Enter the location, pull 1 rat into combat
   - Flee combat (all players leave)
   - Return to the location and inspect the spawn — group count must display 5
  </verify>
  <done>
After fleeing, the enemy spawn's groupCount equals the original full composition
(e.g. 5 rats), not the reduced mid-combat count (e.g. 4). EnemySpawnMember rows
are restored for both un-pulled enemies (savedMembers) and pulled enemies
(combat loop).
  </done>
</task>

</tasks>

<verification>
- [ ] TypeScript compilation succeeds with no new errors
- [ ] Fleeing with 1 of 5 enemies pulled restores group to 5
- [ ] Fleeing with 2 of 5 enemies pulled restores group to 5
- [ ] An enemy killed in combat before flee still restores group to full count
  (CombatEnemy row persists with hp=0 until clearCombatArtifacts, so it is
  re-added here — this is the intended full-reset behavior on leash)
</verification>

<success_criteria>
groupCount on EnemySpawn is always restored to the full original composition
count after a leash event, regardless of how many enemies were actively engaged.
</success_criteria>

<output>
After completion, create `.planning/quick/206-restore-event-enemy-to-spawn-group-after/206-SUMMARY.md`
</output>
