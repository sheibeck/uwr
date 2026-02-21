---
phase: quick
plan: 237
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/combat.ts
autonomous: true
requirements: [237]
must_haves:
  truths:
    - "Enemy abilities target the pet when the pet holds top aggro"
    - "Enemy auto-attacks and abilities both respect pet aggro (consistent behavior)"
    - "Summoner's own hits only update the summoner's non-pet aggro entry"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "CombatEnemyCast with targetPetId field"
      contains: "targetPetId"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Fixed threat loop and pickEnemyTarget returning pet targets"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "executeEnemyAbility routing damage to pets"
  key_links:
    - from: "pickEnemyTarget"
      to: "CombatEnemyCast.targetPetId"
      via: "chosen.targetPetId stored on insert"
    - from: "CombatEnemyCast.targetPetId"
      to: "executeEnemyAbility targetPetId param"
      via: "existingCast.targetPetId passed through executeAbilityAction"
---

<objective>
Fix enemy ability targeting so pets that hold top aggro are targeted by enemy abilities, matching the behavior already implemented for enemy auto-attacks.

Purpose: When a summoner pet taunts and holds top aggro, enemy abilities should damage the pet, not bypass it to hit the summoner. The auto-attack loop already handles this correctly; ability targeting does not.
Output: Three coordinated code changes across schema, reducers, and helpers that make ability targeting consistent with auto-attack targeting.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix threat generation loop and pickEnemyTarget to return pet targets</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Two changes in this file:

**Change A — Threat generation loop (around line 2284):**
The summoner's auto-attack hit generates threat. The loop iterates all aggro entries looking for `entry.characterId === character.id && entry.enemyId === currentEnemy.id`. When a pet entry exists for the same summoner+enemy pair, the pet entry may match first (since `petId` is set but `characterId` still equals the summoner). Add `&& !entry.petId` to ensure only the summoner's own non-pet aggro entry is updated:

```typescript
// Before:
if (entry.characterId === character.id && entry.enemyId === currentEnemy.id) {

// After:
if (entry.characterId === character.id && entry.enemyId === currentEnemy.id && !entry.petId) {
```

**Change B — `pickEnemyTarget` function (lines 732-763):**
Currently the function's aggro branch only looks for entries matching `activeParticipants` (which are `CombatParticipant` rows with only `characterId`, never `petId`). Pet aggro entries are therefore invisible to it.

Change the return type from `bigint | undefined` to `{ characterId?: bigint; petId?: bigint } | undefined` and update all callers.

New aggro branch logic:
1. Get all aggro entries for this enemy filtered by `enemyId`
2. Find the top entry (max value) regardless of whether it's a pet or character entry
3. If the top entry has `petId`, return `{ petId: entry.petId }` — the pet is the target
4. If the top entry has only `characterId`, return `{ characterId: entry.characterId }`
5. If no entries, fall back to `{ characterId: activeParticipants[0]?.characterId }`

The other branches (`lowest_hp`, `random`, `self`, `all_allies`) return `{ characterId: ... }` unchanged.

Update all callers of `pickEnemyTarget` in the same file:
- Line ~2067: `const targetId = pickEnemyTarget(...)` — rename to `const target = pickEnemyTarget(...)` and use `target?.characterId ?? target?.petId` as needed
- Line ~2074: `if (!targetId) continue;` — change to `if (!target) continue;`
- Lines ~2084-2093 (dot/debuff already-applied checks): these check `characterEffect.by_character.filter(targetId)` — when targeting a pet, pets don't have character effects, so the check should short-circuit to `false` (i.e. always cast on pets). Guard: `if (!target.petId) { ...alreadyApplied check... }`
- Lines ~2152-2158 (debuff scoring): the highest-threat comparison uses `highestThreatEntry.characterId === targetId`. Update to compare against `target.characterId`
- Line ~2184-2196 (`combatEnemyCast.insert`): store `targetCharacterId: target?.characterId, targetPetId: target?.petId` (requires Task 2 to add the field first — do schema change before this)
- Line ~2195: `aggroTargetCharacterId: chosen.targetId` — split into `aggroTargetCharacterId: chosen.target?.characterId, aggroTargetPetId: chosen.target?.petId`

The `Candidate` type at line ~2044 needs updating: change `targetId: bigint` to `target: { characterId?: bigint; petId?: bigint }`.
  </action>
  <verify>
After making changes, publish locally:
`spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
Check that it compiles without errors. Check spacetime logs for any panics.
  </verify>
  <done>Module publishes successfully. `pickEnemyTarget` returns a target object with either `characterId` or `petId`. The threat loop no longer updates pet aggro entries when the summoner auto-attacks.</done>
</task>

<task type="auto">
  <name>Task 2: Add targetPetId to CombatEnemyCast schema and thread it through execution</name>
  <files>
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/helpers/combat.ts
  </files>
  <action>
**Change A — `spacetimedb/src/schema/tables.ts` (CombatEnemyCast table, around line 912):**
Add `targetPetId` optional field after `targetCharacterId`:

```typescript
export const CombatEnemyCast = table(
  {
    name: 'combat_enemy_cast',
    public: true,
    indexes: [{ name: 'by_combat', algorithm: 'btree', columns: ['combatId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    enemyId: t.u64(),
    abilityKey: t.string(),
    endsAtMicros: t.u64(),
    targetCharacterId: t.u64().optional(),
    targetPetId: t.u64().optional(),   // <-- add this
  }
);
```

**Change B — `spacetimedb/src/helpers/combat.ts` (`executeEnemyAbility`, around line 1892):**
Add `targetPetId?: bigint` parameter. When `targetPetId` is provided, route damage to the pet instead of the character.

Full updated signature:
```typescript
export function executeEnemyAbility(
  ctx: any,
  combatId: bigint,
  enemyId: bigint,
  abilityKey: string,
  targetCharacterId?: bigint,
  targetPetId?: bigint
)
```

Updated target resolution (replaces lines ~1908-1911):
```typescript
// If ability targets a pet, route to pet
if (targetPetId) {
  const pet = ctx.db.activePet.id.find(targetPetId);
  if (!pet || pet.currentHp === 0n) return;
  const owner = ctx.db.character.id.find(pet.characterId);
  if (!owner) return;

  // Apply damage to pet
  const enemyLevel = enemyTemplate?.level ?? 1n;
  const abilityPower = (ability as any).power ?? 3n;
  const enemyPower = ENEMY_BASE_POWER + (enemyLevel * ENEMY_LEVEL_POWER_SCALING);
  const totalPower = enemyPower + abilityPower * 5n;
  const damageType = (ability as any).damageType ?? 'physical';
  const rawDamage = totalPower;
  const newHp = pet.currentHp > rawDamage ? pet.currentHp - rawDamage : 0n;
  ctx.db.activePet.id.update({ ...pet, currentHp: newHp });

  // Log pet being targeted
  const privateMessage = `${enemyName} uses ${ability.name} on ${pet.name} for ${rawDamage}.`;
  appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'damage', privateMessage);
  if (owner.groupId) {
    appendGroupEvent(ctx, owner.groupId, owner.id, 'damage', `${enemyName} uses ${ability.name} on ${pet.name} for ${rawDamage}.`);
  }

  // Handle pet death
  if (newHp === 0n) {
    const deathMsg = `${pet.name} has been slain!`;
    appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'combat', deathMsg);
    if (owner.groupId) {
      appendGroupEvent(ctx, owner.groupId, owner.id, 'combat', deathMsg);
    }
    // Remove pet's aggro entries
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      if (entry.petId && entry.petId === pet.id) {
        ctx.db.aggroEntry.id.delete(entry.id);
      }
    }
    // Delete the pet
    ctx.db.activePet.id.delete(pet.id);
  }
  return;
}

// Existing character targeting path below (unchanged):
const targetId = targetCharacterId ?? getTopAggroId(ctx, combatId, enemy.id);
if (!targetId) return;
const target = ctx.db.character.id.find(targetId);
if (!target) return;
```

Note: Only the single-target damage path (dot, debuff, direct) needs pet routing since heal/buff/aoe don't target players directly. The early return after pet handling handles all ability kinds gracefully — pets just take raw damage for simplicity (they have no armor mitigation or character effects).

**Change C — `spacetimedb/src/helpers/combat.ts` (`executeAbilityAction`, around line 2185):**
The `enemy` actor branch calls `executeEnemyAbility`. Update it to also pass `targetPetId`:

```typescript
if (args.actorType === 'enemy') {
  executeEnemyAbility(
    ctx,
    args.combatId,
    args.actorId,
    args.abilityKey,
    args.targetCharacterId,
    (args as any).targetPetId   // pass through
  );
  return true;
}
```

Update the `enemy` variant of the union type to include `targetPetId?: bigint`:
```typescript
| {
    actorType: 'enemy';
    actorId: bigint;
    combatId: bigint;
    abilityKey: string;
    targetCharacterId?: bigint;
    targetPetId?: bigint;         // <-- add
  }
```

**Change D — `spacetimedb/src/reducers/combat.ts` (the call site at line ~2007):**
Thread `targetPetId` from the cast row through to `executeAbilityAction`:
```typescript
executeAbilityAction(ctx, {
  actorType: 'enemy',
  actorId: enemy.id,
  combatId: combat.id,
  abilityKey: existingCast.abilityKey,
  targetCharacterId: existingCast.targetCharacterId,
  targetPetId: existingCast.targetPetId,   // <-- add
});
```

After all changes, publish locally and regenerate bindings:
```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```
  </action>
  <verify>
1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds with no errors
2. `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` succeeds
3. Check `src/module_bindings/` contains updated `CombatEnemyCast` type with `targetPetId` field
4. `spacetime logs uwr` shows no panics during a summoner combat test
  </verify>
  <done>
Schema published with `targetPetId` on `CombatEnemyCast`. Client bindings regenerated. Enemy abilities that resolve when a pet holds top aggro now damage the pet. Pet death from abilities removes aggro entries and deletes the activePet row. Enemy auto-attacks and ability targeting now both respect pet aggro consistently.
  </done>
</task>

</tasks>

<verification>
Test sequence using a summoner character:
1. Enter combat as a summoner with an active taunt pet
2. Confirm pet builds and holds top aggro (verify via aggroEntry table in SpacetimeDB dashboard or combat log)
3. Observe enemy abilities: they should land on the pet, not the summoner
4. Observe enemy auto-attacks: already pet-targeted (no regression)
5. Kill the pet via ability damage: aggroEntry rows for the pet should disappear and activePet row should be deleted
6. After pet death, enemy should retarget to highest-aggro character
</verification>

<success_criteria>
- Enemy abilities target pets when the pet has top aggro (matches existing auto-attack behavior)
- Summoner's own auto-attack hits update only the summoner's non-pet aggro entry
- Pet death from ability damage is handled cleanly (aggro entries removed, activePet deleted)
- Module publishes and client bindings regenerate without errors
</success_criteria>

<output>
After completion, create `.planning/quick/237-fix-enemy-ability-targeting-to-respect-p/237-SUMMARY.md`
</output>
