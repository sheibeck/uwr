---
phase: quick-202
plan: 01
subsystem: backend-seeding
tags: [refactor, dx, item-data, ensure-items, item-defs, crafting-materials]
dependency_graph:
  requires: []
  provides: [item_defs.ts data constants, Healer's Porridge in CONSUMABLE_RECIPES]
  affects: [spacetimedb/src/seeding/ensure_items.ts, spacetimedb/src/data/item_defs.ts, spacetimedb/src/data/crafting_materials.ts]
tech_stack:
  added: [spacetimedb/src/data/item_defs.ts]
  patterns: [data-file extraction, loop-over-constants seeding]
key_files:
  created:
    - spacetimedb/src/data/item_defs.ts
  modified:
    - spacetimedb/src/data/crafting_materials.ts
    - spacetimedb/src/seeding/ensure_items.ts
decisions:
  - "WORLD_DROP_GEAR_DEFS and WORLD_DROP_JEWELRY_DEFS use WorldDropItemDef interface with optional stat fields; the seeding loop provides isJunk:false and ?? 0n defaults for all optional numeric fields"
  - "Healer's Porridge added as 15th CONSUMABLE_RECIPES entry; extraFoodItems array in ensure_items.ts eliminated"
  - "CRAFTING_BASE_GEAR_DEFS uses CraftingBaseGearDef interface with all required fields including isJunk; the upsertByName helper in ensureCraftingBaseGearTemplates provides zero-value defaults via spread"
metrics:
  duration: ~12min
  completed: 2026-02-19
  tasks: 3
  files: 3
---

# Phase quick-202 Plan 01: Refactor ensure_items.ts — Extract All Inline Item Data Summary

Pure structural refactor: all item data extracted from ensure_items.ts into item_defs.ts and crafting_materials.ts, following the pattern already established by CONSUMABLE_RECIPES and MATERIAL_DEFS.

## What Was Built

Extracted all inline item data arrays and records from `ensure_items.ts` into typed constants in a new `spacetimedb/src/data/item_defs.ts` file. Added Healer's Porridge to `CONSUMABLE_RECIPES` in `crafting_materials.ts` so it joins the recipe-driven food pipeline. Replaced all inline data in `ensure_items.ts` with loops over imported constants.

**Result:** Adding a new item now requires editing only one data file (`item_defs.ts` or `crafting_materials.ts`), not hunting through `ensure_items.ts`.

## Tasks Completed

### Task 1: Create spacetimedb/src/data/item_defs.ts

Commit: `0e6e4fe`

Created `spacetimedb/src/data/item_defs.ts` (290 lines) exporting 9 typed constants:

- `ARMOR_ALLOWED_CLASSES` — `Record<string, string>` (4 armor types)
- `STARTER_ARMOR_DESCS` — `Record<string, string>` (4 descriptions)
- `StarterWeaponDef` interface + `STARTER_WEAPON_DEFS` — 8 starter weapons
- `StarterAccessoryDef` interface + `STARTER_ACCESSORY_DEFS` — 5 starter accessories with partial stat records
- `JunkDef` interface + `JUNK_DEFS` — 4 junk drop items
- `ResourceDef` interface + `RESOURCE_DEFS` — 20 resource items (Flax through Root Vegetable)
- `WorldDropItemDef` interface + `WORLD_DROP_GEAR_DEFS` — 41 world-drop gear items (T1/T2 weapons and all armor types)
- `WORLD_DROP_JEWELRY_DEFS` — 15 jewelry/cloak items (T1/T2 earrings, necks, cloaks)
- `CraftingBaseGearDef` interface + `CRAFTING_BASE_GEAR_DEFS` — 18 crafting base gear pieces (head/wrists/hands/belt/offHand/neck across armor types)

All data values copied exactly from source ensure_items.ts — no balance changes.

### Task 2: Add Healer's Porridge to CONSUMABLE_RECIPES

Commit: `810bdc0`

Appended `healers_porridge` entry to `CONSUMABLE_RECIPES` in `crafting_materials.ts`:
- `req1Name: 'Herbs', req1Count: 2n`
- `req2Name: 'Clear Water', req2Count: 1n`
- `outputVendorValue: 3n`
- `foodBuff: { buffType: 'health_regen', magnitude: 1n, durationMicros: 2_700_000_000n }`

CONSUMABLE_RECIPES now has 15 entries (was 14). Values match the inline `extraFoodItems` entry that was in ensure_items.ts.

### Task 3: Refactor ensure_items.ts

Commit: `51543ef`

Replaced all inline item data in `ensure_items.ts` with imports from `../data/item_defs` and loops:

- Added import block for all 9 constants from `item_defs`
- `ensureStarterItemTemplates`: removed `ARMOR_ALLOWED_CLASSES` Record, `STARTER_ARMOR_DESC` Record, `weaponTemplates` Record, `accessoryTemplates` array, `junkTemplates` array — now loops over imported constants
- `ensureWorldDropGearTemplates`: removed 41 individual `upsertByName(...)` calls — replaced with single loop over `WORLD_DROP_GEAR_DEFS` with `?? 0n` defaults
- `ensureWorldDropJewelryTemplates`: removed 15 individual `upsertByName(...)` calls — replaced with single loop over `WORLD_DROP_JEWELRY_DEFS`
- `ensureResourceItemTemplates`: removed inline `resources` array (20 items) — now loops over `RESOURCE_DEFS`
- `ensureFoodItemTemplates`: removed `extraFoodItems` array and `foodItems` merge — now loops over `recipeFoodItems` only (Healer's Porridge is in CONSUMABLE_RECIPES)
- `ensureCraftingBaseGearTemplates`: removed 18 individual `upsertByName(...)` calls — replaced with single loop over `CRAFTING_BASE_GEAR_DEFS`

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. `npx tsc --noEmit` — zero TypeScript errors (verified after each task)
2. `item_defs.ts` is 290 lines containing all extracted data
3. `grep -c "const.*= \[" ensure_items.ts` — returns 1 (only `[...ctx.db.recipeTemplate.iter()]` spread, not a data array declaration)
4. `grep "healers_porridge" crafting_materials.ts` — returns match at line 258
5. `grep "extraFoodItems" ensure_items.ts` — returns nothing

## Self-Check: PASSED

Files exist:
- `spacetimedb/src/data/item_defs.ts` — FOUND
- `spacetimedb/src/data/crafting_materials.ts` (modified) — FOUND
- `spacetimedb/src/seeding/ensure_items.ts` (modified) — FOUND

Commits exist:
- `0e6e4fe` — Task 1 (item_defs.ts creation) — FOUND
- `810bdc0` — Task 2 (Healer's Porridge in CONSUMABLE_RECIPES) — FOUND
- `51543ef` — Task 3 (ensure_items.ts refactor) — FOUND
