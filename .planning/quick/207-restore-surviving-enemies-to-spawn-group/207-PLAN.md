---
phase: quick-207
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements:
  - QUICK-207
must_haves:
  truths:
    - "After a player dies, the spawn group restores to the full pre-combat count (pulled + un-pulled survivors)"
    - "Un-pulled enemies that never entered combat retain their EnemySpawnMember rows"
    - "Dead enemies (hp=0) are excluded from the restored spawn group"
    - "The spawn's groupCount reflects the actual total surviving members"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Fixed player-death spawn restore block"
      contains: "remainingMemberCount"
  key_links:
    - from: "player-death path"
      to: "enemySpawnMember table"
      via: "by_spawn index filter — reads existing rows, does not delete them"
      pattern: "remainingMemberCount"
---

<objective>
Fix the player-death spawn restore block so that un-pulled EnemySpawnMember rows are preserved and counted when rebuilding the spawn group.

Purpose: When a player dies after pulling only some enemies from a spawn group, the remaining un-pulled enemies must return to the group at their original count, not be discarded.
Output: Modified combat.ts with the delete loop removed and a corrected groupCount calculation.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/.planning/PROJECT.md
@C:/projects/uwr/.planning/ROADMAP.md
@C:/projects/uwr/spacetimedb/src/reducers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace spawn restore block in player-death path</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `spacetimedb/src/reducers/combat.ts`, replace the spawn restore block at lines 2800-2824 (inside the `if (spawn)` block that precedes `const fallenNames`).

REMOVE this code (lines 2801-2817):
```typescript
for (const member of ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)) {
  ctx.db.enemySpawnMember.id.delete(member.id);
}
let count = 0n;
for (const enemyRow of enemies) {
  if (enemyRow.spawnId !== spawn.id) continue;
  if (enemyRow.currentHp === 0n) continue;
  if (enemyRow.enemyRoleTemplateId) {
    ctx.db.enemySpawnMember.insert({
      id: 0n,
      spawnId: spawn.id,
      enemyTemplateId: enemyRow.enemyTemplateId,
      roleTemplateId: enemyRow.enemyRoleTemplateId,
    });
    count += 1n;
  }
}
```

REPLACE WITH:
```typescript
// Un-pulled members are already correct — keep them, just count them
const remainingMemberCount = BigInt([...ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)].length);
let count = remainingMemberCount;
// Re-insert surviving pulled enemies back into the spawn group
for (const enemyRow of enemies) {
  if (enemyRow.spawnId !== spawn.id) continue;
  if (enemyRow.currentHp === 0n) continue;
  ctx.db.enemySpawnMember.insert({
    id: 0n,
    spawnId: spawn.id,
    enemyTemplateId: enemyRow.enemyTemplateId,
    roleTemplateId: enemyRow.enemyRoleTemplateId ?? 0n,
  });
  count += 1n;
}
```

The `ctx.db.enemySpawn.id.update` call immediately after (lines 2818-2823) is correct as-is — no change needed there.

Key points:
- Remove the entire delete loop — un-pulled members must survive
- Remove the `if (enemyRow.enemyRoleTemplateId)` guard — use `?? 0n` fallback for roleTemplateId instead
- `enemies` and `spawn` are already in scope — no new imports needed
  </action>
  <verify>
Run the TypeScript compiler against the backend module:
```bash
cd C:/projects/uwr/spacetimedb && npx tsc --noEmit
```
Expect: zero errors related to combat.ts.

Then publish:
```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```
Expect: successful publish with no panics in `spacetime logs uwr`.
  </verify>
  <done>
- `npx tsc --noEmit` exits 0 with no errors in combat.ts
- Module publishes successfully
- In-game: pulling 1 of 5 enemies, dying, then re-approaching the spawn shows 5 enemies available (not 1)
- Dead enemies (hp=0) do not reappear in the group
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit`
2. Module publishes: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
3. Logs show no panics: `spacetime logs uwr`
4. Manual test: Pull subset of spawn group, die in combat, verify full original group is restored at the spawn point
</verification>

<success_criteria>
- The delete loop for EnemySpawnMember is gone from the player-death path
- Un-pulled members retain their rows in the EnemySpawnMember table
- groupCount = (un-pulled survivors) + (pulled survivors with hp > 0)
- Dead enemies are excluded from the restored group
- TypeScript compiles and module publishes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/207-restore-surviving-enemies-to-spawn-group/207-SUMMARY.md` following the summary template.
</output>
