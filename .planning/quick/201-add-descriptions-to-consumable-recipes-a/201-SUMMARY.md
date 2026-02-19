---
phase: quick-201
plan: 01
subsystem: crafting
tags: [data-consolidation, consumables, seeding, single-source-of-truth]
dependency_graph:
  requires: []
  provides: [ConsumableRecipeDef-full-metadata, CONSUMABLE_RECIPES-single-source-of-truth]
  affects: [crafting_materials.ts, ensure_items.ts]
tech_stack:
  added: []
  patterns: [single-source-of-truth data definition, loop-over-constants seeding]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/crafting_materials.ts
    - spacetimedb/src/seeding/ensure_items.ts
decisions:
  - "foodBuff optional field on ConsumableRecipeDef discriminates food items from non-food consumables in seeding loops"
  - "ensureFoodItemTemplates keeps Healer's Porridge inline since it has no CONSUMABLE_RECIPES entry"
metrics:
  duration: ~8min
  completed: 2026-02-18
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-201 Plan 01: Add Descriptions to Consumable Recipes Summary

Extended ConsumableRecipeDef with description/outputSlot/outputVendorValue/foodBuff and replaced three separate seeding paths in ensure_items.ts with single loops over CONSUMABLE_RECIPES.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend ConsumableRecipeDef and populate all 14 CONSUMABLE_RECIPES entries | 3efa4fb | spacetimedb/src/data/crafting_materials.ts |
| 2 | Replace three separate seeding paths with single CONSUMABLE_RECIPES loop | 6258787 | spacetimedb/src/seeding/ensure_items.ts |

## What Was Built

ConsumableRecipeDef interface now carries four new fields:
- `description: string` — item tooltip text
- `outputSlot: string` — inventory slot (consumable/utility/resource/food)
- `outputVendorValue: bigint` — base sell price
- `foodBuff?: { buffType, magnitude, durationMicros }` — food-only buff data (4 of 14 recipes)

All 14 CONSUMABLE_RECIPES entries populated with correct values matching the existing ensure_items.ts data they replace.

In `ensureResourceItemTemplates`, the standalone `upsertResourceByName` call for Bandage and the 9-item `craftItems` array are replaced with a single loop over `CONSUMABLE_RECIPES` that skips entries with `foodBuff` defined. In `ensureFoodItemTemplates`, the 4 hard-coded food entries (Herb Broth, Roasted Roots, Traveler's Stew, Forager's Salad) are replaced with a loop over `CONSUMABLE_RECIPES.filter(r => r.foodBuff)`. Healer's Porridge remains inline as an extra food item with no CONSUMABLE_RECIPES entry.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `outputSlot` count in crafting_materials.ts: 15 (1 interface + 14 array entries) - PASSED
- `craftItems` in ensure_items.ts: 0 matches - PASSED
- `name: 'Bandage'` in ensure_items.ts: 0 matches (Bandage now from CONSUMABLE_RECIPES loop) - PASSED
- Healer's Porridge still present in ensure_items.ts line 511 - PASSED
- No TypeScript errors in crafting_materials.ts or ensure_items.ts - PASSED

## Self-Check: PASSED

- FOUND: spacetimedb/src/data/crafting_materials.ts (modified)
- FOUND: spacetimedb/src/seeding/ensure_items.ts (modified)
- FOUND: commit 3efa4fb (Task 1 - extend ConsumableRecipeDef)
- FOUND: commit 6258787 (Task 2 - replace three seeding paths)
