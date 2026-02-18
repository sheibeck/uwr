---
phase: quick-149
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/renown_data.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true

must_haves:
  truths:
    - "undying_fury proc fires and grants a +50% damage_boost CharacterEffect for 10 seconds"
    - "damage_boost CharacterEffect is read during auto-attack damage calculation and applied as a percentage multiplier"
  artifacts:
    - path: "spacetimedb/src/data/renown_data.ts"
      provides: "undying_fury perk effect with buffType/buffMagnitude/buffDurationSeconds"
      contains: "buffType: 'damage_boost'"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "buffType branch in applyPerkProcs"
      contains: "addCharacterEffect.*damage_boost"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "damage_boost multiplier applied to auto-attack baseDamage"
      contains: "sumCharacterEffect.*damage_boost"
  key_links:
    - from: "spacetimedb/src/data/renown_data.ts"
      to: "spacetimedb/src/helpers/combat.ts (applyPerkProcs)"
      via: "effect.buffType field read in proc loop"
    - from: "spacetimedb/src/helpers/combat.ts (addCharacterEffect)"
      to: "spacetimedb/src/reducers/combat.ts (auto-attack path)"
      via: "sumCharacterEffect reads damage_boost row and applies multiplier to baseDamage"
---

<objective>
Fix two Phase 20 verification gaps related to the undying_fury perk and damage_boost CharacterEffect.

Purpose: undying_fury (rank 11 passive perk) fires its proc but applies nothing because its effect definition lacks buff fields and applyPerkProcs has no buff branch. Wrath of the Fallen correctly stores a damage_boost CharacterEffect, but auto-attack damage calculation never reads it.

Output: undying_fury proc applies a damage_boost CharacterEffect; damage_boost CharacterEffect multiplies auto-attack outgoing damage.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/renown_data.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/reducers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add buff fields to undying_fury and add buffType branch in applyPerkProcs</name>
  <files>spacetimedb/src/data/renown_data.ts, spacetimedb/src/helpers/combat.ts</files>
  <action>
**renown_data.ts** — at rank 11, find the `undying_fury` perk (key: 'undying_fury'). Replace its `effect` object:

Current:
```
effect: { procType: 'on_damage_taken', procChance: 3, description: '+50% damage for 10s on proc' }
```

Replace with:
```
effect: { procType: 'on_damage_taken', procChance: 3, buffType: 'damage_boost', buffMagnitude: 50n, buffDurationSeconds: 10 }
```

**helpers/combat.ts** — inside `applyPerkProcs`, after the existing `procHealPercent` block (around line 2039) and before the closing `}` of the `for` loop (before the AoE on_kill block at line 2041), add a new branch:

```typescript
// buffType: apply a CharacterEffect buff on proc
if (effect.buffType) {
  const buffDuration = effect.buffDurationSeconds ?? 10;
  const roundsRemaining = BigInt(Math.max(1, Math.ceil(buffDuration / 3)));
  const buffMagnitude = effect.buffMagnitude ?? 1n;
  addCharacterEffect(ctx, character.id, effect.buffType, buffMagnitude, roundsRemaining, perkName);
  appendPrivateEvent(
    ctx,
    character.id,
    character.ownerUserId,
    'ability',
    `Your ${perkName} triggered! +${buffMagnitude}% damage for ${buffDuration}s.`
  );
}
```

Place this block AFTER the `procHealPercent` block and BEFORE the `on_kill` AoE block so on_kill procs with buffType also work.
  </action>
  <verify>Run `spacetime publish uwr --project-path /c/projects/uwr/spacetimedb 2>&1 | tail -5` — should compile with no errors. Confirm `buffType` field appears in the undying_fury effect and the addCharacterEffect call is present in the applyPerkProcs loop.</verify>
  <done>undying_fury perk definition has buffType/buffMagnitude/buffDurationSeconds; applyPerkProcs applies addCharacterEffect when effect.buffType is set.</done>
</task>

<task type="auto">
  <name>Task 2: Apply damage_boost CharacterEffect multiplier to auto-attack damage</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
In `reducers/combat.ts`, find the auto-attack damage computation block around lines 1952-1958:

```typescript
const rawWeaponDamage = 5n + character.level + weapon.baseDamage + (weapon.dps / 2n);
const perkBonuses = calculatePerkBonuses(ctx, character.id);
const effectiveStr = character.str + perkBonuses.str;
const statScaledDamage = calculateStatScaledAutoAttack(rawWeaponDamage, effectiveStr);
const baseDamage = statScaledDamage + sumEnemyEffect(ctx, combat.id, 'damage_taken', currentEnemy.id);
const damage = baseDamage;
```

Replace `const damage = baseDamage;` with:

```typescript
const damageBoostPercent = sumCharacterEffect(ctx, character.id, 'damage_boost');
const damage = damageBoostPercent > 0n
  ? (baseDamage * (100n + damageBoostPercent)) / 100n
  : baseDamage;
```

`sumCharacterEffect` is already imported at the top of combat.ts (line 200). The `damage_boost` CharacterEffect stores its magnitude as a percentage (50 = +50%), so `(baseDamage * (100 + 50)) / 100` gives 1.5x damage when active.
  </action>
  <verify>Run `spacetime publish uwr --project-path /c/projects/uwr/spacetimedb 2>&1 | tail -5` — should compile with no TypeScript errors. Grep `grep -n "damage_boost" /c/projects/uwr/spacetimedb/src/reducers/combat.ts` should return the new line.</verify>
  <done>Auto-attack damage path reads the damage_boost CharacterEffect and applies it as a percentage multiplier. Wrath of the Fallen active perk and undying_fury on_damage_taken proc both produce visible combat damage increase.</done>
</task>

</tasks>

<verification>
After both tasks, regenerate bindings and verify compilation:
```bash
spacetime publish uwr --project-path /c/projects/uwr/spacetimedb
spacetime generate --lang typescript --out-dir /c/projects/uwr/src/module_bindings --project-path /c/projects/uwr/spacetimedb
```
Both commands must succeed with no errors.
</verification>

<success_criteria>
- `undying_fury` perk effect has buffType: 'damage_boost', buffMagnitude: 50n, buffDurationSeconds: 10
- `applyPerkProcs` has a buffType branch that calls addCharacterEffect
- Auto-attack damage calculation in combat.ts applies damage_boost CharacterEffect as a percentage multiplier
- Module publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/149-fix-undying-fury-buff-proc-and-damage-bo/149-SUMMARY.md`
</output>
