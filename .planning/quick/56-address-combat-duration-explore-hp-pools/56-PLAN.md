---
phase: quick-56
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/class_stats.ts
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/characters.ts
autonomous: false
must_haves:
  truths:
    - "Combat lasts noticeably longer than before (roughly 2-3x more rounds)"
    - "All tuning constants are centralized and easy to adjust"
    - "Both player and enemy HP pools are larger relative to damage output"
  artifacts:
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "GLOBAL_DAMAGE_MULTIPLIER constant"
      contains: "GLOBAL_DAMAGE_MULTIPLIER"
    - path: "spacetimedb/src/data/class_stats.ts"
      provides: "Updated BASE_HP and HP_STR_MULTIPLIER constants"
      contains: "HP_STR_MULTIPLIER"
    - path: "spacetimedb/src/index.ts"
      provides: "Updated computeEnemyStats and recomputeCharacterDerived with new HP scaling"
  key_links:
    - from: "spacetimedb/src/data/combat_scaling.ts"
      to: "spacetimedb/src/index.ts"
      via: "import of GLOBAL_DAMAGE_MULTIPLIER"
      pattern: "GLOBAL_DAMAGE_MULTIPLIER"
---

<objective>
Address combat duration feedback: battles are too short because both characters and enemies deal high damage relative to low HP pools. Increase survivability via HP pool scaling and add a global damage reduction lever for easy future tuning.

Purpose: Make combat feel more strategic with longer engagements, rather than 2-3 round burst fights.
Output: Updated balance constants and formulas in 4 files; republished module.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/class_stats.ts
@spacetimedb/src/index.ts (lines 3005-3065 recomputeCharacterDerived, lines 4519-4566 computeEnemyStats/ENEMY_ROLE_CONFIG)
@spacetimedb/src/reducers/characters.ts (line 138 maxHp formula)
@spacetimedb/src/reducers/combat.ts (lines 419-441 resolveAttack armor mitigation)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Increase HP pools and add global damage reduction constant</name>
  <files>
    spacetimedb/src/data/class_stats.ts
    spacetimedb/src/data/combat_scaling.ts
    spacetimedb/src/index.ts
    spacetimedb/src/reducers/characters.ts
  </files>
  <action>
The goal is to roughly double combat duration. There are three levers to pull:

**A) Increase character HP pools** (class_stats.ts + characters.ts + index.ts):

1. In `class_stats.ts`, change `BASE_HP` from `20n` to `50n`. This gives all characters a larger starting pool.

2. In `class_stats.ts`, add a new exported constant `HP_STR_MULTIPLIER = 8n` (was hardcoded as 5n). This controls how much each STR point contributes to HP.

3. In `reducers/characters.ts` line 138, change `const maxHp = BASE_HP + baseStats.str * 5n` to use the new constant: `const maxHp = BASE_HP + baseStats.str * HP_STR_MULTIPLIER`. Import `HP_STR_MULTIPLIER` from `../data/class_stats.js`.

4. In `index.ts` function `recomputeCharacterDerived` (~line 3023), change `const maxHp = BASE_HP + totalStats.str * 5n + gear.hpBonus` to `const maxHp = BASE_HP + totalStats.str * HP_STR_MULTIPLIER + gear.hpBonus`. Import `HP_STR_MULTIPLIER` from the class_stats import that already exists.

**Result:** Level 1 Warrior HP goes from ~80 to ~146. Level 1 Wizard HP goes from ~60 to ~114. Much more survivable.

**B) Increase enemy HP pools** (index.ts):

5. In `index.ts`, update the `ENEMY_ROLE_CONFIG` object (~line 4522-4527) to increase HP values:
```
tank:    { hpPerLevel: 40n, damagePerLevel: 5n, baseHp: 40n, baseDamage: 4n }
healer:  { hpPerLevel: 30n, damagePerLevel: 4n, baseHp: 30n, baseDamage: 3n }
dps:     { hpPerLevel: 35n, damagePerLevel: 6n, baseHp: 28n, baseDamage: 4n }
support: { hpPerLevel: 25n, damagePerLevel: 4n, baseHp: 24n, baseDamage: 3n }
```
Note: ONLY HP values change. Damage values stay the same. This makes enemies survive longer without hitting harder.

**Result:** Level 1 DPS enemy HP goes from 34 to 63. Level 1 Tank goes from 46 to 80.

**C) Add global damage reduction lever** (combat_scaling.ts):

6. In `combat_scaling.ts`, add a new constant at the top of the constants section:
```typescript
/**
 * Global damage reduction percentage (on 100n scale)
 * Applied to ALL damage after armor/resist mitigation
 * 85n = 85% of damage dealt (15% reduction)
 * Easy lever to tune overall combat duration
 * Set to 100n to disable (100% = no reduction)
 */
export const GLOBAL_DAMAGE_MULTIPLIER = 85n;
```

7. In `index.ts`, in the `applyArmorMitigation` function (~line 4543), apply the global multiplier AFTER armor calc:
```typescript
function applyArmorMitigation(damage: bigint, armorClass: bigint) {
  const armorReduced = (damage * 100n) / (100n + armorClass);
  const globalReduced = (armorReduced * GLOBAL_DAMAGE_MULTIPLIER) / 100n;
  return globalReduced > 0n ? globalReduced : 1n;
}
```
Import `GLOBAL_DAMAGE_MULTIPLIER` from `../data/combat_scaling.js` (already has imports from that file).

8. In `combat_scaling.ts`, in the `applyMagicResistMitigation` function, apply the same global multiplier:
```typescript
export function applyMagicResistMitigation(damage: bigint, magicResist: bigint): bigint {
  const resistReduced = (damage * 100n) / (100n + magicResist * MAGIC_RESIST_SCALING);
  const globalReduced = (resistReduced * GLOBAL_DAMAGE_MULTIPLIER) / 100n;
  return globalReduced > 0n ? globalReduced : 1n;
}
```

**Summary of changes:**
- BASE_HP: 20n -> 50n (+150%)
- HP per STR: 5n -> 8n (+60%)
- Enemy HP: ~80% increase across roles
- Global damage: 15% flat reduction on all damage
- Enemy damage: UNCHANGED
- All constants centralized and named for easy future tuning

This should roughly double combat duration:
- Player effective HP ~1.8x larger
- Enemy effective HP ~1.8x larger
- All damage 15% lower
- Combined: fights last roughly 2-2.5x longer
  </action>
  <verify>
Run `spacetime publish uwr --clear-database -y --project-path spacetimedb` to verify the module compiles and publishes successfully. Then run `spacetime generate --lang typescript --out-dir client/src/module_bindings --project-path spacetimedb` to regenerate bindings (though no schema changes, this confirms compatibility).
  </verify>
  <done>
Module publishes without errors. BASE_HP is 50n, HP_STR_MULTIPLIER is 8n, GLOBAL_DAMAGE_MULTIPLIER is 85n, enemy HP values are increased, and all four files are updated consistently. All damage paths (physical and magic) route through the global multiplier.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify combat duration improvement</name>
  <files>none</files>
  <action>Human verifies that combat feels longer and more strategic after the HP and damage changes.</action>
  <verify>Human plays through several combat encounters and confirms improved duration.</verify>
  <done>User approves combat duration or provides specific tuning feedback.</done>
  <what-built>Increased HP pools for both characters and enemies, added 15% global damage reduction. Combat should last roughly 2-2.5x longer than before.</what-built>
  <how-to-verify>
    1. Create a new character (or use /setlevel to reset)
    2. Check character HP in stats panel - should be noticeably higher than before (Level 1 Warrior ~146 HP instead of ~80)
    3. Engage enemies in combat
    4. Observe that fights take more rounds to complete (both you and enemies survive longer)
    5. Verify damage numbers look reasonable (slightly lower than before due to 15% global reduction)
    6. If combat is still too short, the GLOBAL_DAMAGE_MULTIPLIER in combat_scaling.ts can be lowered (e.g., 75n for 25% reduction)
    7. If combat is too long, raise it (e.g., 90n or 95n)
  </how-to-verify>
  <resume-signal>Type "approved" if combat duration feels better, or describe what needs adjustment (e.g., "still too short", "too long now", "enemies die too fast but players die too slow")</resume-signal>
</task>

</tasks>

<verification>
- Module compiles and publishes without errors
- No TypeScript compilation errors
- Character HP formula uses new constants (BASE_HP=50n, HP_STR_MULTIPLIER=8n)
- Enemy HP values increased in ENEMY_ROLE_CONFIG
- GLOBAL_DAMAGE_MULTIPLIER applied in both applyArmorMitigation and applyMagicResistMitigation
- All imports resolve correctly
</verification>

<success_criteria>
Combat engagements last approximately 2-2.5x longer than before the change. Both players and enemies survive more rounds. All tuning constants are centralized in class_stats.ts and combat_scaling.ts for easy future adjustment.
</success_criteria>

<output>
After completion, create `.planning/quick/56-address-combat-duration-explore-hp-pools/56-SUMMARY.md`
</output>
