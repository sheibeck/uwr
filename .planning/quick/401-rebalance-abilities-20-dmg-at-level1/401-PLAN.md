---
phase: quick-401
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/data/combat_scaling.test.ts
autonomous: true
requirements: [QUICK-401]

must_haves:
  truths:
    - "A level 1 mana ability (e.g. wizard_magic_missile) deals approximately 20 damage before armor mitigation"
    - "A level 1 stamina melee DD ability deals approximately 20 damage before armor mitigation"
    - "A level 1 direct heal ability restores approximately 20 HP"
  artifacts:
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "Retuned ABILITY_DAMAGE_SCALER and HEALING_POWER_SCALER constants"
      contains: "ABILITY_DAMAGE_SCALER"
    - path: "spacetimedb/src/data/combat_scaling.test.ts"
      provides: "Updated tests verifying level 1 damage/heal targets"
  key_links:
    - from: "spacetimedb/src/data/combat_scaling.ts"
      to: "spacetimedb/src/helpers/combat.ts"
      via: "ABILITY_DAMAGE_SCALER and HEALING_POWER_SCALER imports in scaledPower() and heal handler"
      pattern: "ABILITY_DAMAGE_SCALER|HEALING_POWER_SCALER"
---

<objective>
Rebalance ability damage and healing so that level 1 characters deal and heal approximately 20 per ability use. Currently mana abilities deal ~40, melee DD ~31, and heals ~26 at level 1. All three should converge around ~20.

Purpose: Combat at level 1 is too bursty — abilities kill or heal too quickly relative to HP pools. Bringing all three to ~20 extends fights and makes tactical choices matter.
Output: Updated scaling constants and tests.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/combat_scaling.test.ts
@spacetimedb/src/helpers/skill_budget.ts

## Key Formulas

### scaledPower() in combat.ts (line 470-483):
```typescript
const statScale = getAbilityStatScaling(actor.stats, '', '', ability.scaling);
let effectiveCast = ability.castSeconds;
if (ability.resourceType === 'mana' && effectiveCast < MANA_MIN_CAST_SECONDS) {
  effectiveCast = MANA_MIN_CAST_SECONDS;
}
const abilityMult = getAbilityMultiplier(effectiveCast, ability.cooldownSeconds);
let power = ((ability.value1 * 3n + statScale) * abilityMult) / 100n;
power = (power * ABILITY_DAMAGE_SCALER) / 100n;  // <-- THIS LEVER
if (power < 1n) power = 1n;
```

### Heal handler in combat.ts (line 533-535):
```typescript
const power = scaledPower();  // Already has ABILITY_DAMAGE_SCALER applied
const healAmount = calculateHealingPower(power, actor.stats);  // Adds WIS * 1
const scaled = (healAmount * HEALING_POWER_SCALER) / 100n;  // <-- THIS LEVER
```

### Level 1 Character Stats (from STAT_FORMULAS):
- Primary stat: 8 + 4 = 12
- Secondary stat: 8 + 2 = 10
- Other stats: 8

### Skill Budget (value1 at level 1):
- damage: base=12, perLevel=5 -> midpoint=17, range [12, 22]
- heal: base=10, perLevel=4 -> midpoint=14, range [10, 18]

### Current Results (ABILITY_DAMAGE_SCALER=50, HEALING_POWER_SCALER=50):
- Mana damage (cast=3, cd=0, value1=17, INT=12): scaledPower = ~40
- Melee DD (cast=0, cd=0, value1=17, STR=12): scaledPower = ~31
- Direct heal (value1=14, WIS=12): scaledPower ~28, +WIS -> ~40, *50/100 = ~20

### Target: ~20 for all three ability types at level 1
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Tune ABILITY_DAMAGE_SCALER and HEALING_POWER_SCALER for ~20 at level 1</name>
  <files>spacetimedb/src/data/combat_scaling.ts, spacetimedb/src/data/combat_scaling.test.ts</files>
  <behavior>
    - Test: Level 1 mana damage ability (value1=17, INT stat=12, castSeconds=3, cd=0) produces scaledPower in range [15, 25]
    - Test: Level 1 melee DD ability (value1=17, STR stat=12, castSeconds=0, cd=0) produces scaledPower in range [15, 25]
    - Test: Level 1 direct heal (value1=14, WIS=12, castSeconds=3, cd=0) produces final heal in range [15, 25]
    - Test: ABILITY_DAMAGE_SCALER constant has expected new value
    - Test: HEALING_POWER_SCALER constant has expected new value
  </behavior>
  <action>
    1. Calculate exact new constant values working backward from target ~20:

    **For ABILITY_DAMAGE_SCALER** — the primary lever:
    - Mana ability: ((17*3 + 12) * 130) / 100 = 81. Need 81 * X / 100 ~ 20. X ~ 25.
    - Melee DD: ((17*3 + 12) * 100) / 100 = 63. Need 63 * X / 100 ~ 20. X ~ 32.
    - Compromise: Try ABILITY_DAMAGE_SCALER = 28n (mana: 22, melee: 17) or 30n (mana: 24, melee: 18).
    - Pick value that gets both types closest to 20. Likely 25n-30n range.

    **For HEALING_POWER_SCALER** — adjust so heals also land ~20:
    - With new ABILITY_DAMAGE_SCALER at ~28n: scaledPower for heal (value1=14, cast=3, cd=0, WIS=12):
      ((14*3 + 12) * 130) / 100 = 70. * 28 / 100 = 19. Then calculateHealingPower(19, {wis:12}) = 19+12 = 31.
      Then 31 * HEALING_POWER_SCALER / 100 needs to be ~20. So HEALING_POWER_SCALER ~ 65n.
    - Adjust HEALING_POWER_SCALER accordingly. Likely increase from 50n to 60n-70n range.

    2. Update combat_scaling.ts:
    - Change `ABILITY_DAMAGE_SCALER` from 50n to new value
    - Change `HEALING_POWER_SCALER` from 50n to new value
    - Update JSDoc comments to reflect new values and rationale

    3. Update combat_scaling.test.ts:
    - Update the `ABILITY_DAMAGE_SCALER` describe block to test new value
    - Update the `MANA_COST_MULTIPLIER` test if needed (should be unaffected)
    - Add a new describe block: "Level 1 ability balance targets" that traces through the full formula for mana damage, melee DD, and direct heal, asserting all land in [15, 25] range
    - Update "getAbilityMultiplier with ABILITY_DAMAGE_SCALER" test expectations

    IMPORTANT: Do NOT change any other constants or formulas. Only ABILITY_DAMAGE_SCALER and HEALING_POWER_SCALER.
    Do NOT modify combat.ts or skill_budget.ts — only combat_scaling.ts and its test file.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vitest run spacetimedb/src/data/combat_scaling.test.ts</automated>
  </verify>
  <done>
    - ABILITY_DAMAGE_SCALER tuned so level 1 mana and melee DD abilities produce damage in [15, 25] range
    - HEALING_POWER_SCALER tuned so level 1 direct heals produce healing in [15, 25] range
    - All existing tests updated to match new constant values
    - New "Level 1 ability balance targets" test block validates the full formula chain
  </done>
</task>

</tasks>

<verification>
- `npx vitest run spacetimedb/src/data/combat_scaling.test.ts` passes
- `npx vitest run spacetimedb/src/helpers/combat.test.ts` passes (no changes, but verify no breakage)
- New balance target tests confirm level 1 damage/heal in [15, 25] range
</verification>

<success_criteria>
- ABILITY_DAMAGE_SCALER and HEALING_POWER_SCALER constants are updated
- Level 1 mana abilities deal approximately 20 damage (before armor)
- Level 1 melee DD abilities deal approximately 20 damage (before armor)
- Level 1 direct heals restore approximately 20 HP
- All tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/401-rebalance-abilities-20-dmg-at-level1/401-SUMMARY.md`
</output>
