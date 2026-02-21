---
phase: quick-266
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-266]

must_haves:
  truths:
    - "Killing a social add does not cause it to reappear on the map after combat ends"
    - "The add's spawn groupCount reaches 0 after the add is consumed into combat"
    - "Victory path deletes the spawn and schedules respawn instead of setting it back to 'available'"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Fixed consumeSpawnCount flag for pending social adds"
      contains: "addEnemyToCombat(deps, ctx, combat, spawnRow, participants, true"
  key_links:
    - from: "combat.ts line ~2136"
      to: "takeSpawnMember"
      via: "consumeSpawnCount=true triggers the call"
      pattern: "takeSpawnMember.*spawnToUse\\.id"
---

<objective>
Fix social add kills not decrementing the spawn group count, which causes killed adds to reappear on the map after combat ends.

Purpose: When a social add joins combat via `combatPendingAdd`, `addEnemyToCombat` is called with `consumeSpawnCount=false`. This skips `takeSpawnMember`, so `groupCount` and `EnemySpawnMember` rows are never decremented. At victory, `spawn.groupCount > 0n` → spawn is reset to 'available' instead of deleted, causing the add to reappear immediately.

Output: One-line fix in combat.ts. No schema changes needed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Change consumeSpawnCount to true for pending social adds</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
At line 2136 in the pending add processing loop (inside `for (const pending of ctx.db.combatPendingAdd.by_combat.filter(combat.id))`), change the `addEnemyToCombat` call's 6th argument from `false` to `true`:

Before:
```typescript
        const newEnemy = addEnemyToCombat(
          deps,
          ctx,
          combat,
          spawnRow,
          participants,
          false,
          pending.enemyRoleTemplateId ?? undefined
        );
```

After:
```typescript
        const newEnemy = addEnemyToCombat(
          deps,
          ctx,
          combat,
          spawnRow,
          participants,
          true,
          pending.enemyRoleTemplateId ?? undefined
        );
```

No other changes needed. The `addEnemyToCombat` function at line 82 already gates `takeSpawnMember` behind `consumeSpawnCount`, so this single flag change causes the add's spawn member to be deleted and `groupCount` decremented when the add enters combat.

Note: `reserveAdds` already sets the spawn state to 'engaged', so passing `true` here is safe — `takeSpawnMember` just removes the member row and calls `refreshSpawnGroupCount`. The spawn state remains 'engaged' until victory resolution.
  </action>
  <verify>Publish module locally and confirm: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` compiles without errors.</verify>
  <done>Module publishes cleanly. The `consumeSpawnCount` argument for pending add processing is `true` at line 2136.</done>
</task>

</tasks>

<verification>
After publishing locally, reproduce the bug scenario:
1. Engage enemies that have social adds (e.g. a spawn group with 2+ members)
2. Let the social add arrive in combat
3. Win the combat
4. Confirm the add's spawn does NOT reappear on the map immediately

The spawn should be deleted and a respawn scheduled rather than reset to 'available'.
</verification>

<success_criteria>
- `spacetimedb/src/reducers/combat.ts` line 2136 reads `true` (not `false`)
- Module compiles and publishes to local without errors
- Killing social adds no longer causes immediate reappearance on map after victory
</success_criteria>

<output>
After completion, create `.planning/quick/266-social-add-kills-not-decrementing-spawn-/266-SUMMARY.md`
</output>
