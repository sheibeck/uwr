---
phase: quick-328
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useItemTooltip.ts
  - src/composables/useInventory.ts
  - src/App.vue
  - src/composables/useCrafting.ts
  - src/composables/useCombat.ts
autonomous: true
requirements: [QUICK-328]
must_haves:
  truths:
    - "Weapon tooltip shows actual per-hit damage matching combat formula (5 + level + baseDamage + dps/2)"
    - "Weapon tooltip shows actual DPS (per-hit damage / attack speed in seconds)"
    - "Non-weapon items are unaffected (armor, accessories, consumables)"
    - "Vendor weapon tooltips show level-1 baseline damage when no character context"
  artifacts:
    - path: "src/composables/useItemTooltip.ts"
      provides: "Combat-accurate weapon damage calculation in tooltip builder"
  key_links:
    - from: "src/composables/useItemTooltip.ts"
      to: "combat formula in spacetimedb/src/reducers/combat.ts line 2337"
      via: "matching rawWeaponDamage = 5n + level + baseDamage + (dps / 2n)"
      pattern: "5n.*level.*baseDamage.*dps.*2n"
---

<objective>
Fix weapon tooltip Damage and DPS labels to show actual combat values instead of raw internal scaling fields.

Purpose: Currently, Training Bow shows "Weapon Damage: 7, Weapon DPS: 8" which are the raw `weaponBaseDamage` and `weaponDps` template fields -- internal scaling inputs, not the actual damage dealt. The combat formula is `rawWeaponDamage = 5 + level + baseDamage + (dps / 2)` and actual DPS = rawWeaponDamage / attackSpeedSeconds. A level-1 Ranger with Training Bow should see "Damage: 17, DPS: 3.4" (5+1+7+4=17, 17/5.0=3.4).

Output: Updated tooltip that displays combat-accurate damage values for weapons.
</objective>

<context>
@src/composables/useItemTooltip.ts (tooltip builder -- THE file to modify)
@src/composables/useInventory.ts (calls buildItemTooltipData, has selectedCharacter with .level)
@src/App.vue (calls buildItemTooltipData for vendor items)
@src/composables/useCrafting.ts (calls buildItemTooltipData for recipe outputs)
@src/composables/useCombat.ts (calls buildItemTooltipData for loot drops)
@spacetimedb/src/reducers/combat.ts:2337 (combat formula: rawWeaponDamage = 5n + character.level + weapon.baseDamage + (weapon.dps / 2n))
@spacetimedb/src/data/combat_constants.ts (WEAPON_SPEED_MICROS map and DEFAULT_WEAPON_SPEED_MICROS)
@spacetimedb/src/seeding/ensure_items.ts:186-199 (starter weapon stats and formula comment)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add combat damage calculation to buildItemTooltipData</name>
  <files>src/composables/useItemTooltip.ts</files>
  <action>
1. Add a `WEAPON_SPEED_MICROS` constant map and `DEFAULT_WEAPON_SPEED_MICROS` at the top of the file, mirroring the values from `spacetimedb/src/data/combat_constants.ts`. Per MEMORY.md, create a thin client-side copy (the server data dir cannot be directly imported by the client). Values:
   ```
   dagger: 3_000_000n, rapier: 3_000_000n, sword: 3_500_000n, blade: 3_500_000n,
   mace: 3_500_000n, axe: 4_000_000n, staff: 5_000_000n, bow: 5_000_000n,
   greatsword: 5_000_000n, default: 4_000_000n
   ```

2. Add an optional `characterLevel` field (type `bigint`) to the `BuildTooltipArgs` type. This allows callers to pass the current character's level for accurate tooltip damage. When omitted, default to `1n` (level 1 baseline -- reasonable for vendor/crafting contexts where no character is selected).

3. In the stats construction section (around lines 117-130), replace the raw `effectiveDmg` and `effectiveDps` display with computed combat values **only for weapon items** (when `effectiveDmg > 0` or `effectiveDps > 0`, indicating it's a weapon):

   - Compute `rawWeaponDamage = 5n + level + effectiveDmg + (effectiveDps / 2n)` -- this matches the server formula exactly from combat.ts line 2337.
   - Look up weapon speed from `WEAPON_SPEED_MICROS` using `template?.weaponType`. Fall back to `DEFAULT_WEAPON_SPEED_MICROS`.
   - Compute `actualDps = Number(rawWeaponDamage) / (Number(speedMicros) / 1_000_000)` as a floating-point number.
   - Display: `{ label: 'Damage', value: String(rawWeaponDamage) }` for per-hit damage.
   - Display: `{ label: 'DPS', value: actualDps.toFixed(1) }` for DPS.
   - Remove the old `'Weapon Damage'` and `'Weapon DPS'` stat lines and replace with these two.

4. For non-weapon items (effectiveDmg === 0n AND effectiveDps === 0n), keep behavior unchanged (no damage stats shown).

5. Keep the `effectiveAc` armor class line completely unchanged.
  </action>
  <verify>Run `npx tsc --noEmit` from the project root. Verify no type errors. Visually inspect that the stat lines for weapons now show 'Damage' and 'DPS' labels instead of 'Weapon Damage' and 'Weapon DPS'.</verify>
  <done>buildItemTooltipData computes combat-accurate damage using the formula `5 + level + baseDamage + dps/2` and divides by weapon speed for DPS. Labels are "Damage" and "DPS".</done>
</task>

<task type="auto">
  <name>Task 2: Pass character level to all buildItemTooltipData call sites</name>
  <files>src/composables/useInventory.ts, src/App.vue, src/composables/useCrafting.ts, src/composables/useCombat.ts</files>
  <action>
Update every call site that invokes `buildItemTooltipData()` to pass `characterLevel` when a character is available:

1. **src/composables/useInventory.ts** -- Two call sites (bag items around line 86, equipped slots around line 176):
   - Both have access to `selectedCharacter` ref. Pass `characterLevel: selectedCharacter.value?.level ?? 1n` in the args object.

2. **src/App.vue** -- One call site (vendor items around line 817):
   - Has `selectedCharacter` ref. Pass `characterLevel: selectedCharacter.value?.level ?? 1n`.

3. **src/composables/useCrafting.ts** -- One call site (recipe output around line 210):
   - Check if `selectedCharacter` is available in the composable args. If yes, pass `characterLevel: selectedCharacter.value?.level ?? 1n`. If the composable doesn't have access to character, omit it (will default to 1n which is acceptable for crafting previews).

4. **src/composables/useCombat.ts** -- Check if it calls `buildItemTooltipData`. If so, pass `characterLevel` from the character context available in the combat composable.

Do NOT change any other behavior at these call sites. Only add the `characterLevel` field to the existing args object.
  </action>
  <verify>Run `npx tsc --noEmit` from the project root. Verify no type errors across all modified files. Grep for `buildItemTooltipData` to confirm all call sites pass characterLevel.</verify>
  <done>All buildItemTooltipData call sites pass characterLevel when a character reference is available. Vendor/crafting contexts without a character default to level 1.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors.
2. For a level-1 Training Bow (baseDamage=7, dps=8, bow speed=5.0s): tooltip shows "Damage: 17" (5+1+7+4=17) and "DPS: 3.4" (17/5.0).
3. For a level-1 Training Dagger (baseDamage=2, dps=3, dagger speed=3.0s): tooltip shows "Damage: 9" (5+1+2+1=9) and "DPS: 3.0" (9/3.0).
4. Armor items still show "Armor Class: +X" with no damage lines.
5. Vendor weapon tooltips show level-1 damage values.
</verification>

<success_criteria>
- Weapon tooltips display actual per-hit damage matching the combat formula
- Weapon tooltips display actual DPS (per-hit / speed in seconds) with one decimal place
- Labels read "Damage" and "DPS" (not "Weapon Damage" / "Weapon DPS")
- Non-weapon items unaffected
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/328-fix-weapon-damage-and-dps-tooltip-labels/328-SUMMARY.md`
</output>
