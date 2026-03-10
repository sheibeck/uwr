---
phase: quick-396
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/helpers/combat.test.ts
autonomous: true
requirements: [FIX-DEBUFF-TARGET, FIX-HOT-DOUBLE-HEAL]
must_haves:
  truths:
    - "Player-cast debuff abilities apply their debuff effect to the enemy, not the caster"
    - "Player-cast buff abilities with debuff-type effectTypes (armor_down, stun, dot) are reclassified and target enemies"
    - "HoT abilities heal exactly once on application (direct heal only), not twice"
    - "HoT abilities respect targetCharacterId when targeting party members"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Fixed resolveAbility dispatch and addCharacterEffect"
    - path: "spacetimedb/src/helpers/combat.test.ts"
      provides: "Tests for debuff targeting and HoT single-tick behavior"
  key_links:
    - from: "resolveAbility buff handler"
      to: "resolveAbility debuff handler"
      via: "effectType reclassification guard"
      pattern: "DEBUFF_EFFECT_TYPES.*includes.*eType"
    - from: "resolveAbility hot handler"
      to: "addCharacterEffect"
      via: "regen immediate tick removal"
      pattern: "effectType === 'regen'"
---

<objective>
Fix two combat targeting bugs: (1) debuff abilities applying effects to the caster instead of the enemy, and (2) HoT abilities double-healing on application.

Purpose: Correct combat ability resolution so debuffs land on enemies and HoTs heal once.
Output: Patched combat.ts with defensive guards and unit tests.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat.ts
</context>

<interfaces>
<!-- Key functions being modified -->

From spacetimedb/src/helpers/combat.ts:

```typescript
// Lines 195-253: Applies effect to a CHARACTER (player). Has immediate tick for regen/dot.
export function addCharacterEffect(ctx, characterId, effectType, magnitude, roundsRemaining, sourceAbility)

// Lines 255-314: Applies effect to an ENEMY in combat. No immediate tick.
export function addEnemyEffect(ctx, combatId, enemyId, effectType, magnitude, roundsRemaining, sourceAbility, ownerCharacterId?)

// Lines 440-904: Main ability dispatch. Uses ability.kind to route.
export function resolveAbility(ctx, actor, ability, enemies, combatId, combat, targetCharacterId?, nowMicros?, actorGroupId?)
```

Bug 1 root cause: The `buff` handler (lines 623-649) applies addCharacterEffect to caster/target
regardless of effectType. If LLM generates an ability with kind='buff' but effectType='armor_down',
the debuff lands on the caster. The `debuff` handler (lines 652-683) correctly uses addEnemyEffect,
but never runs because kind is 'buff'.

Bug 2 root cause: resolveAbility hot handler (lines 599-621) does a direct heal at line 611-612,
then calls addCharacterEffect which does an IMMEDIATE first tick for regen at lines 238-244.
Result: double healing on cast.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix buff handler to reclassify debuff effectTypes and remove HoT double-heal</name>
  <files>spacetimedb/src/helpers/combat.ts, spacetimedb/src/helpers/combat.test.ts</files>
  <behavior>
    - Test 1: When resolveAbility is called with kind='buff' and effectType='armor_down', the effect is applied to the enemy via addEnemyEffect, NOT to the caster via addCharacterEffect
    - Test 2: When resolveAbility is called with kind='debuff', addEnemyEffect is called on the targeted enemy (existing behavior, regression guard)
    - Test 3: When addCharacterEffect is called with effectType='regen', NO immediate tick heal occurs (the regen block at lines 238-244 is removed or skipped for regen, kept for dot)
    - Test 4: When resolveAbility is called with kind='hot', the target is healed exactly once (direct heal only), and addCharacterEffect is called for the ongoing regen effect without double-healing
  </behavior>
  <action>
Two fixes in spacetimedb/src/helpers/combat.ts:

**Fix 1 — Buff handler reclassification guard (lines 623-649):**
Add a DEBUFF_EFFECT_TYPES constant at the top of resolveAbility (or near the buff handler):
```typescript
const DEBUFF_EFFECT_TYPES = ['armor_down', 'stun', 'dot', 'damage_down', 'slow', 'root', 'silence', 'mesmerize'];
```

In the `kind === 'buff'` block, BEFORE applying the effect, check if `eType` is a debuff-type effect. If so, redirect to the debuff/enemy targeting path:
```typescript
if (kind === 'buff') {
  const eType = ability.effectType ?? 'damage_up';
  const eMag = ability.effectMagnitude ?? 3n;
  const eDur = ability.effectDuration ?? 3n;

  // Guard: if the effectType is actually a debuff, redirect to enemy targeting
  if (DEBUFF_EFFECT_TYPES.includes(eType)) {
    if (actor.type === 'character') {
      const enemy = findEnemyTarget();
      if (!enemy || !combatId) { throw new SenderError('No target'); }
      addEnemyEffect(ctx, combatId, enemy.id, eType, eMag, eDur, ability.name, actor.id);
      const char = ctx.db.character.id.find(actor.id);
      if (char) logPrivate(char.id, char.ownerUserId, 'ability', `Your ${ability.name} afflicts ${getEnemyName(enemy)}.`);
      logGroup('ability', `${actor.name}'s ${ability.name} afflicts ${getEnemyName(enemy)}.`);
    } else if (actor.type === 'enemy') {
      // Enemy "buff" with debuff effectType targets a player
      if (!targetCharacterId) return;
      const target = ctx.db.character.id.find(targetCharacterId);
      if (!target || target.hp === 0n) return;
      addCharacterEffect(ctx, targetCharacterId, eType, eMag, eDur, ability.name);
      logPrivate(target.id, target.ownerUserId, 'ability', `${actor.name}'s ${ability.name} weakens you.`);
    }
    return;
  }

  // ... rest of existing buff logic unchanged ...
}
```

**Fix 2 — Remove immediate regen tick from addCharacterEffect (lines 236-252):**
In the `addCharacterEffect` function, change the immediate tick block so it ONLY fires for 'dot', NOT for 'regen'. The direct heal in resolveAbility's hot handler already covers round 1.

Change line 238 from:
```typescript
if (effectType === 'regen' || effectType === 'dot') {
```
to:
```typescript
if (effectType === 'dot') {
```

This removes the immediate regen tick entirely. The hot handler in resolveAbility already does a direct heal, and the scheduled tick_hot handles subsequent ticks.

**Write tests** in combat.test.ts (create or extend the file) using mock ctx objects that verify:
1. Buff with debuff effectType calls addEnemyEffect (mock/spy pattern)
2. addCharacterEffect with 'regen' does NOT modify character HP
3. addCharacterEffect with 'dot' still DOES apply immediate damage tick
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vitest run spacetimedb/src/helpers/combat.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - Buff handler redirects debuff-type effectTypes to enemy targeting
    - addCharacterEffect no longer double-heals on regen application
    - DoT immediate tick still works (no regression)
    - All tests pass
  </done>
</task>

</tasks>

<verification>
- Run full test suite: `cd C:/projects/uwr && npx vitest run --reporter=verbose 2>&1 | tail -50`
- Publish locally: `spacetime publish uwr -p spacetimedb` (only if schema unchanged, which it is -- code-only fix)
- Manual spot check: Cast a debuff ability in combat, verify the debuff appears on the enemy (combat_enemy_effect table), not on the caster (character_effect table)
</verification>

<success_criteria>
- Player-cast debuff abilities (including misclassified buff+debuff-effectType) apply effects to enemy
- HoT abilities heal exactly once on cast (no double heal from addCharacterEffect immediate tick)
- DoT immediate tick preserved (no regression)
- All existing and new tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/396-fix-combat-targeting-debuffs-hit-caster-/396-SUMMARY.md`
</output>
