---
phase: quick-166
plan: 01
subsystem: crafting-data
tags: [crafting, refactor, data-centralization, materials, recipes, essence]
dependency_graph:
  requires: [crafting system (Phase 13), dual-axis gear (Phase 13.1)]
  provides: [single source of truth for all crafting metadata]
  affects: [ensure_items.ts, location.ts, combat.ts]
tech_stack:
  added: []
  patterns: [data-driven seeding, centralized constants]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/crafting_materials.ts
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/helpers/location.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "vendorValue added as optional field on MaterialDef (nullable with ?? 1n fallback) to avoid breaking existing code"
  - "gatherEntries is a separate field from gatherTerrains on MaterialDef for per-terrain weight flexibility"
  - "ESSENCE_TIER_THRESHOLDS ordered highest-first for early-return matching in the for loop"
  - "essenceTemplateMap built once per victory using ESSENCE_TIER_THRESHOLDS (not per participant)"
metrics:
  duration: "~5min"
  completed: "2026-02-18"
  tasks: 2
  files: 4
---

# Quick Task 166: Crafting System Metadata Centralization Summary

**One-liner:** Consolidated all recipe definitions (14 consumable + 15 gear), material metadata (vendorValues, gatherEntries), and essence tier thresholds from inline/scattered code into a single source of truth in `crafting_materials.ts`.

## Objective

Eliminate metadata fragmentation in the crafting system so future changes (new recipes, material rebalancing, new essences) only require edits in one file (`crafting_materials.ts`).

## What Was Done

### Task 1: Centralize all recipe and material metadata in crafting_materials.ts

Extended `crafting_materials.ts` with:

1. **`vendorValue?: bigint` on `MaterialDef`** - populated for all 14 materials (T1=2n, T2=4-5n, T3=8-10n, Essences=3-24n)

2. **`gatherEntries?: { terrain: string; weight: bigint; timeOfDay: string }[]` on `MaterialDef`** - per-terrain gather pool entries for all gatherable materials:
   - Copper Ore: mountains(3n/any) + plains(2n/any)
   - Iron Ore: mountains(2n/any)
   - Darksteel Ore: mountains(1n/any) + dungeon(2n/any)
   - Moonweave Cloth: swamp(1n/night) + woods(1n/night)

3. **`CONSUMABLE_RECIPES: ConsumableRecipeDef[]`** - 14 consumable recipe definitions moved from `ensureRecipeTemplates()` inline code

4. **`GEAR_RECIPES: GearRecipeDef[]`** - 15 gear recipe definitions moved from `ensureGearRecipeTemplates()` inline code

5. **`GEAR_RECIPE_NAMES`** - derived from `GEAR_RECIPES.map(r => r.name)` (no more local array)

6. **`ESSENCE_TIER_THRESHOLDS`** - 4-entry ordered array for combat essence drop logic (highest-first)

### Task 2: Refactor consumer files to import centralized data

**ensure_items.ts:**
- `ensureGearMaterialItemTemplates`: now a 1-loop over `MATERIAL_DEFS` - reads `mat.name`, `mat.tier`, `mat.vendorValue` directly
- `ensureRecipeTemplates`: now a 1-loop over `CONSUMABLE_RECIPES` - zero inline recipe definitions
- `ensureGearRecipeTemplates`: now a 1-loop over `GEAR_RECIPES` - zero inline recipe definitions
- Local `GEAR_RECIPE_NAMES` constant deleted; imported from `crafting_materials.ts`
- Import updated: `import { MATERIAL_DEFS, CONSUMABLE_RECIPES, GEAR_RECIPES, GEAR_RECIPE_NAMES }`

**location.ts:**
- `getGatherableResourceTemplates`: hardcoded material entries (Copper Ore, Iron Ore, Darksteel Ore, Moonweave Cloth) removed from all terrain pools
- Injection loop appended after `baseEntries`: iterates `MATERIAL_DEFS`, reads `gatherEntries`, pushes matching terrain entries
- Import added: `import { MATERIAL_DEFS } from '../data/crafting_materials'`

**combat.ts:**
- 4 hardcoded template lookups (`essenceITemplate`, `essenceIITemplate`, `essenceIIITemplate`, `essenceIVTemplate`) replaced with `essenceTemplateMap` built from `ESSENCE_TIER_THRESHOLDS`
- `if/else` level chain replaced with a for loop over `ESSENCE_TIER_THRESHOLDS`
- Import added: `import { ESSENCE_TIER_THRESHOLDS } from '../data/crafting_materials'`

## Verification Results

- `npx tsc --noEmit`: zero new errors introduced (all existing errors are pre-existing)
- `spacetime publish uwr --project-path spacetimedb`: published successfully, "Database updated"
- `grep "Copper Ore" spacetimedb/src/seeding/ensure_items.ts`: zero matches (no hardcoded vendor values)
- `grep "Essence I" spacetimedb/src/reducers/combat.ts`: zero matches (no hardcoded name literals)
- `grep "GEAR_RECIPE_NAMES" spacetimedb/src/seeding/ensure_items.ts`: import only, no declaration

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 758d82d | feat(quick-166): centralize all recipe and material metadata in crafting_materials.ts |
| Task 2 | 4014ea0 | feat(quick-166): refactor seeding, location, and combat to consume centralized crafting data |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `spacetimedb/src/data/crafting_materials.ts` - FOUND (modified)
- [x] `spacetimedb/src/seeding/ensure_items.ts` - FOUND (modified)
- [x] `spacetimedb/src/helpers/location.ts` - FOUND (modified)
- [x] `spacetimedb/src/reducers/combat.ts` - FOUND (modified)
- [x] Commit 758d82d - FOUND
- [x] Commit 4014ea0 - FOUND
- [x] CONSUMABLE_RECIPES.length === 14 - verified (14 entries in array)
- [x] GEAR_RECIPES.length === 15 - verified (15 entries in array)
- [x] GEAR_RECIPE_NAMES derived from GEAR_RECIPES - verified
- [x] ESSENCE_TIER_THRESHOLDS.length === 4 - verified
