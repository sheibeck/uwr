---
phase: quick-156
plan: 01
subsystem: item-seeding
tags: [balance, armor, weapons, seeding, upsert]
key-files:
  modified:
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/seeding/ensure_items.ts
decisions:
  - "Starter weapons reduced to 3/5 base/dps, T1 world-drop to 4/6 — establishes clean 1-point gap per tier"
  - "T1 'other' slot AC uses per-armor-type value: cloth=2, leather=3, chain=3, plate=4"
  - "Wooden Shield AC 4n left unchanged — shield is armorType=none, not part of typed armor progression"
  - "T2 armor and T2 world-drop weapons out of scope — no changes applied"
metrics:
  duration: ~5min
  completed: 2026-02-18
  tasks: 2
  files: 2
---

# Quick Task 156: Realign Armor AC and Weapon Damage Across Starter and T1 Tiers

Reduced all starter and T1 item values by 1 point to establish a clean tier progression baseline. Starter armor is now the weakest tier, T1 world-drop is starter+1 on every slot, and T1 crafting base gear uses correct per-armor-type AC for "other" slots.

## Changes Applied

### STARTER_ARMOR (spacetimedb/src/helpers/items.ts)

| Armor Type | Chest (before→after) | Legs (before→after) | Boots (before→after) |
|------------|----------------------|---------------------|----------------------|
| cloth      | 3n → 2n              | 2n → 1n             | 1n (unchanged)       |
| leather    | 4n → 3n              | 3n → 2n             | 2n (unchanged)       |
| chain      | 5n → 4n              | 4n → 3n             | 3n → 2n              |
| plate      | 6n → 5n              | 5n → 4n             | 4n → 3n              |

### T1 World-Drop Armor (spacetimedb/src/seeding/ensure_items.ts)

Each T1 world-drop = starter+1 on every slot for same armor type.

| Item             | Slot  | Armor Type | Before | After |
|------------------|-------|------------|--------|-------|
| Worn Robe        | chest | cloth      | 4n     | 3n    |
| Worn Trousers    | legs  | cloth      | 3n     | 2n    |
| Worn Slippers    | boots | cloth      | 2n     | 2n    |
| Scuffed Jerkin   | chest | leather    | 5n     | 4n    |
| Scuffed Leggings | legs  | leather    | 4n     | 3n    |
| Scuffed Boots    | boots | leather    | 3n     | 3n    |
| Dented Hauberk   | chest | chain      | 6n     | 5n    |
| Dented Greaves   | legs  | chain      | 5n     | 4n    |
| Dented Sabatons  | boots | chain      | 4n     | 3n    |
| Battered Cuirass | chest | plate      | 7n     | 6n    |
| Battered Greaves | legs  | plate      | 6n     | 5n    |
| Battered Boots   | boots | plate      | 5n     | 4n    |

### T1 Crafting Base Gear (ensureCraftingBaseGearTemplates)

T1 "other" slot AC: cloth=2, leather=3, chain=3, plate=4.

| Item            | Slot    | Armor Type | Before | After |
|-----------------|---------|------------|--------|-------|
| Iron Helm       | head    | plate      | 3n     | 4n    |
| Leather Bracers | wrists  | leather    | 2n     | 3n    |
| Iron Gauntlets  | hands   | plate      | 2n     | 4n    |
| Rough Girdle    | belt    | leather    | 1n     | 3n    |
| Simple Cloak    | neck    | cloth      | 1n     | 2n    |
| Wooden Shield   | offHand | none       | 4n     | 4n    |

### T1 World-Drop Cloaks (ensureWorldDropJewelryTemplates)

| Item          | Before | After |
|---------------|--------|-------|
| Rough Cloak   | 1n     | 2n    |
| Wool Cloak    | 1n     | 2n    |
| Drifter Cloak | 1n     | 2n    |

### Starter Weapons (ensureStarterItemTemplates)

All 8 training weapons (Sword/Mace/Staff/Bow/Dagger/Axe/Blade/Rapier):
- weaponBaseDamage: 4n → 3n
- weaponDps: 6n → 5n

### T1 World-Drop Weapons (ensureWorldDropGearTemplates)

All 8 T1 weapons (Iron Shortsword/Hunting Bow/Gnarled Staff/Worn Mace/Rusty Axe/Notched Rapier/Chipped Dagger/Cracked Blade):
- weaponBaseDamage: 5n → 4n
- weaponDps: 7n → 6n

T2 weapons (Steel Longsword/Yew Bow/Oak Staff) left unchanged at 7-9/11-13.

## Deviations from Plan

None — plan executed exactly as written, plus additional weapon scope applied atomically.

## Verification

- TypeScript compilation: pre-existing errors in unrelated files (combat.ts, movement.ts, ensure_enemies.ts); no new errors in modified files
- Module published: `spacetime publish uwr` exited 0, "Database updated" in logs
- Upsert pattern updated all live ItemTemplate rows without database clear
- All T2 items confirmed unchanged

## Self-Check: PASSED

- `spacetimedb/src/helpers/items.ts` modified and committed in 8b2a41e
- `spacetimedb/src/seeding/ensure_items.ts` modified and committed in 8b2a41e
- Module published successfully, no seeding errors in logs
