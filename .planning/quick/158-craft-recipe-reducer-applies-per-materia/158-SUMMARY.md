---
phase: quick-158
plan: 01
subsystem: crafting
tags: [crafting, items, affixes, tooltips]
dependency_graph:
  requires: [craft_recipe reducer, ItemAffix table, getEquippedWeaponStats]
  provides: [getCraftQualityStatBonus, craft quality implicit affixes, effective stat tooltips]
  affects: [crafting, combat damage, inventory tooltips, equipped slot tooltips]
tech_stack:
  added: []
  patterns:
    - "implicit affixType for non-display craft quality bonuses"
    - "affix-summing stat display in client tooltips"
key_files:
  created: []
  modified:
    - spacetimedb/src/data/crafting_materials.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/helpers/items.ts
    - src/composables/useInventory.ts
decisions:
  - "affixType='implicit' used for craft quality bonus affixes to distinguish from visible prefix/suffix affixes"
  - "Implicit affixes excluded from tooltip affixStats label list but included in base stat numbers"
  - "getEquippedWeaponStats sums ALL weapon affixes (including implicit) over template base"
  - "Standard (tier 1) crafting unchanged: getCraftQualityStatBonus returns 0n, no implicit affixes inserted"
metrics:
  duration: ~10min
  completed: 2026-02-18T02:57:00Z
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 158: Craft Recipe Reducer Applies Per-Material Quality Stat Bonuses

## One-Liner

Crafted gear from tier 2+ materials now inserts implicit ItemAffix rows for AC/damage/DPS bonuses that flow through combat stats and are displayed as effective values in inventory tooltips.

## What Was Built

### Task 1: getCraftQualityStatBonus helper + craft_recipe reducer implicit affixes

Added `getCraftQualityStatBonus(craftQuality)` to `spacetimedb/src/data/crafting_materials.ts`:
- standard/dented: 0n (no bonus)
- reinforced: 1n
- exquisite: 2n
- mastercraft: 3n

Updated the `craft_recipe` reducer in `spacetimedb/src/reducers/items.ts` to insert implicit ItemAffix rows after the material-specific affix insertion block:
- Only runs when `statBonus > 0n` (standard/tier 1 unchanged)
- Armor items (armorClassBonus > 0n): inserts `craft_quality_ac` implicit affix
- Weapon items (weaponBaseDamage > 0n): inserts `craft_quality_dmg` AND `craft_quality_dps` implicit affixes
- Uses `affixType: 'implicit'` to distinguish from visible prefix/suffix affixes

Updated `getEquippedWeaponStats` in `spacetimedb/src/helpers/items.ts` to sum weaponBaseDamage and weaponDps affix magnitudes over template base values. Added `weaponDps: 0n` to `getEquippedBonuses` bonuses object and added `weaponDps` handling to the affix loop.

### Task 2: Client tooltip effective stat display

Updated `src/composables/useInventory.ts` in two locations:
1. **Inventory tooltip** (inventoryItems computed): Moved instanceAffixes computation before the stats array, added implicit bonus accumulation for armorClassBonus/weaponBaseDamage/weaponDps, and modified stats array to use effective values (template base + implicit bonus). Filtered `affixStats` to exclude `affixType === 'implicit'` entries.
2. **Equipped slot tooltip** (equippedSlots computed): Added instance affix lookup and same implicit bonus accumulation, updated stats array to use effective values.

## Commits

| Hash | Message |
|------|---------|
| 4b4cf41 | feat(quick-158): apply per-material craft quality stat bonuses to crafted gear |
| 321adcc | feat(quick-158): update client tooltips to show effective stats with craft quality bonus |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- getCraftQualityStatBonus exists and returns correct values (0n/1n/2n/3n per quality level)
- craft_recipe inserts implicit affix rows for reinforced/exquisite, not for standard
- getEquippedWeaponStats sums weaponBaseDamage+weaponDps affixes into base template values
- Client inventory and equipped slot tooltips show effective stats (template + implicit bonus)
- Implicit affixes excluded from visible affixStats label list
- Module published successfully to local server
- Client build: pre-existing TypeScript errors unrelated to this task (pre-existing before change)

## Self-Check: PASSED

| File | Status |
|------|--------|
| spacetimedb/src/data/crafting_materials.ts | FOUND - getCraftQualityStatBonus at line 387 |
| spacetimedb/src/reducers/items.ts | FOUND - getCraftQualityStatBonus imported and used at line 1027 |
| spacetimedb/src/helpers/items.ts | FOUND - getEquippedWeaponStats sums bonusDamage/bonusDps at line 271-275 |
| src/composables/useInventory.ts | FOUND - implicit bonus accumulation before stats arrays |
| Commit 4b4cf41 | FOUND |
| Commit 321adcc | FOUND |
