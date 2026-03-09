---
phase: quick-389
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
autonomous: true
requirements: [fix-enemy-ability-damage-routing]

must_haves:
  truths:
    - "Enemy 'damage' kind abilities reduce the player's HP, not another enemy's HP"
    - "Enemy 'dot' kind abilities apply initial damage and DoT effect to the player, not to enemies"
    - "Enemy 'debuff' kind abilities apply debuff to the player character, not to enemies"
    - "Player HP visibly decreases when enemies use abilities against them"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Actor-type-aware routing in resolveAbility for damage/dot/debuff kinds"
      contains: "applyDamageToCharacter"
  key_links:
    - from: "resolveAbility damage kind"
      to: "applyEnemyAbilityDamage"
      via: "actor.type === 'enemy' branch"
      pattern: "actor\\.type === 'enemy'.*applyDamageToCharacter"
---

<objective>
Fix enemy ability damage not being applied to player characters. The `resolveAbility` function's `damage`, `dot`, and `debuff` kind handlers always route damage to enemies via `findEnemyTarget()` + `applyDamageToEnemy()`, regardless of whether the actor is a player or an enemy. When an enemy uses a damage ability, it damages another enemy (or itself) instead of the player. The log message tells the player they got hit, but their HP never decreases.

Purpose: Combat is broken -- enemies that use abilities appear to hit the player but HP doesn't decrease because damage is applied to the wrong target.
Output: Fixed `resolveAbility` with proper actor-type routing for damage/dot/debuff kinds.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat.ts (resolveAbility, applyEnemyAbilityDamage, applyDamageToEnemy, applyDamageToCharacter)
@spacetimedb/src/reducers/combat.ts (processEnemyAutoAttackForRound, combat_loop)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix actor-type routing in resolveAbility for damage, dot, and debuff kinds</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In `resolveAbility()`, three ability kinds have the same bug -- they always route to enemies regardless of actor type. The `aoe_damage` kind at line 676 already shows the correct pattern (it checks `actor.type === 'character'` vs else for enemy AoE). Apply the same pattern to:

**1. `damage` kind (line 467-482):**
Currently calls `findEnemyTarget()` + `applyDamageToEnemy()` unconditionally.
Fix: When `actor.type === 'enemy'` and `targetCharacterId` is provided, call `applyDamageToCharacter()` on the target player character instead. Keep the existing player path (findEnemyTarget + applyDamageToEnemy) for `actor.type === 'character'`.

```typescript
if (kind === 'damage') {
  if (actor.type === 'enemy') {
    // Enemy damage ability targets a player character
    if (!targetCharacterId) return;
    const target = ctx.db.character.id.find(targetCharacterId);
    if (!target || target.hp === 0n) return;
    const power = scaledPower();
    const dealt = applyDamageToCharacter(target, power, dmgType);
    logPrivate(target.id, target.ownerUserId, 'damage', `${actor.name}'s ${ability.name} hits you for ${dealt} damage.`);
    if (target.groupId) appendGroupEvent(ctx, target.groupId, target.id, 'damage', `${actor.name}'s ${ability.name} hits ${target.name} for ${dealt} damage.`);
    // Check death
    const updated = ctx.db.character.id.find(targetCharacterId);
    if (updated && updated.hp === 0n && combatId) {
      const participant = [...ctx.db.combat_participant.by_combat.filter(combatId)]
        .find((p: any) => p.characterId === targetCharacterId);
      if (participant) markParticipantDead(ctx, participant, updated, actor.name);
    }
  } else {
    // Player/pet damage ability targets an enemy
    const enemy = findEnemyTarget();
    if (!enemy || !combatId) { throw new SenderError('No target'); }
    const power = scaledPower();
    const dealt = applyDamageToEnemy(enemy, power, dmgType);
    const char = ctx.db.character.id.find(actor.id);
    if (char) logPrivate(char.id, char.ownerUserId, 'damage', `Your ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`);
    logGroup('damage', `${actor.name}'s ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`);
  }
  return;
}
```

**2. `dot` kind (line 521-543):**
Same fix. When `actor.type === 'enemy'`, apply direct damage to character via `applyDamageToCharacter()` and add a character DoT effect via `addCharacterEffect()` instead of `addEnemyEffect()`.

```typescript
if (kind === 'dot') {
  const power = scaledPower();
  const directDamage = power / 2n;
  const dotTotal = power - directDamage;
  const duration = ability.effectDuration ?? 3n;
  const dotPerTick = duration > 0n ? dotTotal / duration : dotTotal;

  if (actor.type === 'enemy') {
    if (!targetCharacterId) return;
    const target = ctx.db.character.id.find(targetCharacterId);
    if (!target || target.hp === 0n) return;
    const dealt = applyDamageToCharacter(target, directDamage, dmgType);
    if (dotPerTick > 0n) {
      addCharacterEffect(ctx, targetCharacterId, 'dot', dotPerTick, duration, ability.name);
    }
    logPrivate(target.id, target.ownerUserId, 'damage', `${actor.name}'s ${ability.name} hits you for ${dealt} damage and applies a burning effect.`);
    if (target.groupId) appendGroupEvent(ctx, target.groupId, target.id, 'damage', `${actor.name}'s ${ability.name} hits ${target.name} for ${dealt}.`);
    const updated = ctx.db.character.id.find(targetCharacterId);
    if (updated && updated.hp === 0n && combatId) {
      const participant = [...ctx.db.combat_participant.by_combat.filter(combatId)]
        .find((p: any) => p.characterId === targetCharacterId);
      if (participant) markParticipantDead(ctx, participant, updated, actor.name);
    }
  } else {
    const enemy = findEnemyTarget();
    if (!enemy || !combatId) { throw new SenderError('No target'); }
    const dealt = applyDamageToEnemy(enemy, directDamage, dmgType);
    if (dotPerTick > 0n) {
      addEnemyEffect(ctx, combatId, enemy.id, 'dot', dotPerTick, duration, ability.name, actor.id);
    }
    const char = ctx.db.character.id.find(actor.id);
    if (char) logPrivate(char.id, char.ownerUserId, 'damage', `Your ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`);
    logGroup('damage', `${actor.name}'s ${ability.name} hits ${getEnemyName(enemy)} for ${dealt} damage.`);
  }
  return;
}
```

**3. `debuff` kind (line 598-621):**
When `actor.type === 'enemy'`, apply damage to the player character and add a character debuff effect instead of enemy effect.

```typescript
if (kind === 'debuff') {
  const eType = ability.effectType ?? 'armor_down';
  const eMag = ability.effectMagnitude ?? 3n;
  const eDur = ability.effectDuration ?? 3n;
  const power = scaledPower();
  const directDamage = (power * 75n) / 100n;

  if (actor.type === 'enemy') {
    if (!targetCharacterId) return;
    const target = ctx.db.character.id.find(targetCharacterId);
    if (!target || target.hp === 0n) return;
    if (directDamage > 0n) {
      applyDamageToCharacter(target, directDamage, dmgType);
    }
    addCharacterEffect(ctx, targetCharacterId, eType, eMag, eDur, ability.name);
    logPrivate(target.id, target.ownerUserId, 'ability', `${actor.name}'s ${ability.name} weakens you.`);
    if (target.groupId) appendGroupEvent(ctx, target.groupId, target.id, 'ability', `${actor.name}'s ${ability.name} weakens ${target.name}.`);
  } else {
    const enemy = findEnemyTarget();
    if (!enemy || !combatId) { throw new SenderError('No target'); }
    if (directDamage > 0n) {
      applyDamageToEnemy(enemy, directDamage, dmgType);
    }
    addEnemyEffect(ctx, combatId, enemy.id, eType, eMag, eDur, ability.name, actor.id);
    const char = ctx.db.character.id.find(actor.id);
    if (char) logPrivate(char.id, char.ownerUserId, 'ability', `Your ${ability.name} afflicts ${getEnemyName(enemy)}.`);
    logGroup('ability', `${actor.name}'s ${ability.name} afflicts ${getEnemyName(enemy)}.`);
  }
  return;
}
```

Note: `markParticipantDead` is imported/available in combat.ts reducers but may need to be imported or accessible in combat.ts helpers. Check if it's already available; if not, import it or re-fetch and check death inline.

Also check `addCharacterEffect` is imported/available in this file (it should be -- used by heal/hot/buff kinds already).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - Enemy 'damage' kind abilities apply damage to the targeted player character via applyDamageToCharacter, not to enemies
    - Enemy 'dot' kind abilities apply initial damage + DoT effect to the player character, not to enemies
    - Enemy 'debuff' kind abilities apply debuff + direct damage to the player character, not to enemies
    - Player damage/dot/debuff abilities continue targeting enemies as before (no regression)
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish and verify via server logs</name>
  <files></files>
  <action>
Publish the module locally to verify no runtime errors:

```bash
cd C:/projects/uwr && spacetime publish uwr -p spacetimedb
```

If schema changes are needed (unlikely -- this is code-only), use `--clear-database -y`.
Check logs for any immediate errors:

```bash
spacetime logs uwr 2>&1 | tail -20
```
  </action>
  <verify>
    <automated>cd C:/projects/uwr && spacetime publish uwr -p spacetimedb 2>&1 | tail -5</automated>
  </verify>
  <done>Module publishes successfully without errors</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Module publishes to local SpacetimeDB
- No runtime errors in server logs
</verification>

<success_criteria>
Enemy abilities (damage, dot, debuff kinds) correctly reduce the targeted player character's HP instead of damaging other enemies. The combat log messages match the actual HP changes.
</success_criteria>

<output>
After completion, create `.planning/quick/389-fix-combat-hp-tracking-damage-not-reduci/389-SUMMARY.md`
</output>
