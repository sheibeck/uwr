---
phase: 13-crafting-system
plan: 02
subsystem: crafting
tags: [spacetimedb, typescript, crafting, salvage, recipe, affixes, deterministic]

# Dependency graph
requires:
  - phase: 13-01
    provides: "crafting_materials.ts with MATERIAL_DEFS, MATERIAL_AFFIX_MAP, getMaterialForSalvage, getCraftedAffixes, materialTierToQuality, SALVAGE_YIELD_BY_TIER; RecipeTemplate extended with recipeType/materialType; 10 material item templates and 15 gear recipes seeded"
  - phase: 14-03
    provides: "salvage_item reducer baseline (gold-only yield), ItemAffix table, take_loot affix pattern via buildDisplayName"
provides:
  - "Reworked salvage_item: yields 2-3 crafting materials based on gear slot/armorType/tier; no gold yield"
  - "Recipe discovery on salvage: 75% deterministic roll, inserts RecipeDiscovered, logs 'You have learned: [name]'"
  - "Extended craft_recipe: gear recipes get deterministic affixes (ItemAffix rows), qualityTier, and displayName from material type"
  - "New learn_recipe_scroll reducer: consumes 'Scroll: [name]' items to teach corresponding recipes"
affects: [frontend-crafting-ui, plan-13-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Material-to-quality mapping: MATERIAL_DEFS.tier -> materialTierToQuality -> qualityTier string"
    - "Deterministic craft affixes: getCraftedAffixes(materialKey, qualityTier) returns fixed affix list per material+tier combination"
    - "Scroll naming convention: 'Scroll: [RecipeName]' maps to recipe by name match"
    - "Recipe discovery deduplication: by_character filter + .some() check before insert"

key-files:
  created: []
  modified:
    - "spacetimedb/src/reducers/items.ts"

key-decisions:
  - "Salvage yields materials only (no gold) — gold-only yield from Phase 14 fully replaced by material system per plan specification"
  - "Recipe discovery 75% chance uses (timestamp.microsSinceUnixEpoch + character.id) % 100n — same deterministic RNG pattern as perk proc rolls"
  - "craft_recipe material key derived from req1 template name (lowercased, spaces→underscores) — avoids needing a new materialKey column on RecipeTemplate"
  - "Gear recipe detection: recipe.recipeType && recipe.recipeType !== 'consumable' — consumables skip affix logic"
  - "Scroll detection: template.name.startsWith('Scroll:') — matches ensureRecipeScrollTemplates seeding pattern"

patterns-established:
  - "Crafted item affix pipeline mirrors take_loot: addItemToInventory -> find new instance by templateId+!qualityTier -> insert ItemAffix rows -> buildDisplayName -> update instance"

# Metrics
duration: ~9min
completed: 2026-02-17
---

# Phase 13 Plan 02: Crafting Reducer Logic Summary

**Material-based salvage yielding 2-3 typed materials with 75% recipe discovery, deterministic gear affixes on craft (ItemAffix rows matching take_loot pattern), and learn_recipe_scroll reducer for scroll-based recipe learning**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-02-17T~09:50Z
- **Completed:** 2026-02-17T~10:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Reworked salvage_item to grant crafting materials (using getMaterialForSalvage + SALVAGE_YIELD_BY_TIER) instead of gold
- Added 75% deterministic recipe discovery on salvage with duplicate-check guard
- Extended craft_recipe to apply deterministic affixes for gear recipes using MATERIAL_DEFS + getCraftedAffixes, writing ItemAffix rows and updating ItemInstance with qualityTier/displayName
- Added learn_recipe_scroll reducer that extracts recipe name from "Scroll: [name]" items and teaches the matching recipe

## Task Commits

Each task was committed atomically:

1. **Task 1: Rework salvage_item reducer for material yield and recipe discovery** - `ce94d7b` (feat)
2. **Task 2: Extend craft_recipe for deterministic gear affixes and add learn_recipe_scroll reducer** - `3322d3e` (feat)

## Files Created/Modified

- `spacetimedb/src/reducers/items.ts` - Reworked salvage_item (material yield + recipe discovery), extended craft_recipe (gear affixes), new learn_recipe_scroll reducer

## Decisions Made

- Material key for affix lookup derived from req1 template name (lowercased, underscored) — this matches MATERIAL_DEFS.key convention set in Plan 01, avoiding a new field on RecipeTemplate
- Gear recipe detection checks `recipeType !== 'consumable'` — consumable recipes (Bandage, etc.) have `recipeType = 'consumable'` from Plan 01 seeding, so they correctly skip the affix path
- Salvage logs with 'reward' event type for material grant (matching buy_item pattern) and 'system' event type for recipe discovery (matching research_recipes pattern)

## Deviations from Plan

None - plan executed exactly as written. The `buildDisplayName` function in `helpers/items.ts` was verified compatible with `CraftedAffix` format (both have `affixType` and `affixName` fields), no adapter needed.

## Issues Encountered

None - all pre-existing TypeScript errors (implicit `any` in reducers, `+=` bigint in sell_all_junk) were confirmed pre-existing before the plan started and no new errors were introduced.

## User Setup Required

None - no external service configuration required. Backend changes only; frontend integration is Plan 03.

## Next Phase Readiness

- Backend crafting system is complete: salvage yields materials, crafting produces deterministic affixes, scrolls teach recipes
- Plan 03 (frontend crafting UI) can now proceed — all data is available via SpacetimeDB subscriptions
- learn_recipe_scroll reducer is ready for frontend to call when player right-clicks a Scroll item

---
*Phase: 13-crafting-system*
*Completed: 2026-02-17*
