---
phase: quick-186
plan: 01
subsystem: crafting
tags: [crafting, recipes, progression, research_recipes]
dependency_graph:
  requires: []
  provides: [gear-recipe-gating]
  affects: [research_recipes reducer]
tech_stack:
  added: []
  patterns: [recipeType guard in loop, same isGearRecipe pattern as craft_recipe]
key_files:
  modified:
    - spacetimedb/src/reducers/items.ts
decisions:
  - research_recipes skips recipeType != 'consumable' using same isGearRecipe pattern already established in craft_recipe at line 1100
metrics:
  duration: ~3min
  completed: 2026-02-18
---

# Phase quick-186 Plan 01: Filter Gear Recipes from Discover Recipes Summary

Filter gear recipes out of the Discover Recipes button using a recipeType guard that skips weapon/armor/accessory recipes, preserving only consumable auto-discovery.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Filter gear recipes from research_recipes reducer | 14ef3ac | spacetimedb/src/reducers/items.ts |

## What Was Built

Added a 4-line guard inside the `research_recipes` reducer loop that skips any recipe where `recipeType` is set and is not `'consumable'`. This reuses the exact `isGearRecipe` pattern already established in the `craft_recipe` reducer at line 1100:

```typescript
// Skip gear recipes — only consumables are auto-discoverable
// Gear recipes require salvaging or recipe scrolls
const isGearRecipe = recipe.recipeType && recipe.recipeType !== 'consumable';
if (isGearRecipe) continue;
```

**Guard placement:** After the `discovered.has()` check (so already-known recipes are still skipped first), before the material count checks. This is the earliest correct position in the loop.

**Effect:**
- 14 consumable recipes (Bandages, Simple Rations, Torch, foods, potions) remain auto-discoverable
- 15 gear recipes (weapons, armor, accessories) are skipped by Discover Recipes
- Gear recipe discovery via salvage (`learn_recipe_from_scroll`) is unchanged
- Gear recipe discovery via recipe scrolls is unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `spacetimedb/src/reducers/items.ts` modified with guard at correct position (line 985-988)
- [x] Commit 14ef3ac exists
- [x] Module published successfully to local SpacetimeDB (`Updated database with name: uwr`)
- [x] Pre-existing TypeScript errors in other files confirmed unrelated to this change
