---
phase: 13-crafting-system
plan: 03
subsystem: ui
tags: [vue, composable, crafting, inventory, recipe-scrolls]

# Dependency graph
requires:
  - phase: 13-01
    provides: recipeType/materialType columns on RecipeTemplate, recipe scroll item templates seeded
  - phase: 13-02
    provides: learn_recipe_scroll reducer, craft_recipe reducer using new material system

provides:
  - CraftingPanel with type filter chips (All/Weapon/Armor/Accessory/Consumable)
  - Show-only-craftable toggle in CraftingPanel
  - Red/green material requirement display per recipe
  - Recipe list uses filteredRecipes from composable
  - Research Recipes button removed from CraftingPanel
  - InventoryPanel salvage confirms "crafting materials" not "gold"
  - Learn Recipe context menu action for Scroll: items in InventoryPanel

affects: [crafting-ui, inventory-ui, recipe-discovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "activeFilter + showOnlyCraftable refs in composable, returned for v-model binding in parent"
    - "recipeType cast as (recipe as any).recipeType for pre-bindings-regeneration compatibility"
    - "window.__db_conn direct reducer call in InventoryPanel for scroll learning (avoids emit prop-drilling)"

key-files:
  created: []
  modified:
    - src/composables/useCrafting.ts
    - src/components/CraftingPanel.vue
    - src/components/InventoryPanel.vue
    - src/App.vue

key-decisions:
  - "Filter chips use update:activeFilter/update:showOnlyCraftable emit pattern (not v-model shorthand) for clear prop flow from App.vue through CraftingPanel"
  - "learnRecipeFromScroll calls window.__db_conn directly in InventoryPanel to avoid adding emit chain through CharacterInfoPanel"
  - "isRecipeScroll checks item.name.startsWith('Scroll:') — matches seeded scroll naming convention from Plan 01"
  - "recipeType field accessed as (recipe as any).recipeType for pre-bindings compatibility — will resolve when spacetime generate is rerun after Plan 01 publish"

patterns-established:
  - "Composable filter state: export activeFilter/showOnlyCraftable refs from useCrafting so parent can wire v-model"
  - "hasMaterial boolean per requirement: owned >= required, drives red/green coloring in template"

# Metrics
duration: ~10min
completed: 2026-02-17
---

# Phase 13 Plan 03: Crafting UI Extension Summary

**CraftingPanel extended with type filter chips, craftable toggle, and red/green material display; InventoryPanel gains Learn Recipe action for recipe scrolls completing the salvage-to-recipe-discovery loop**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-17T~T:00Z
- **Completed:** 2026-02-17
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- CraftingPanel has type filter chips (All + unique recipeTypes from known recipes) with active chip highlighted green
- Show-only-craftable checkbox toggle filters recipe list to only craftable items
- Material requirements display green (#4a6) when met, red (#c44) when insufficient — replaces plain text display
- Research Recipes button removed (salvage-to-recipe discovery replaces research mechanic)
- InventoryPanel salvage confirm updated from "gold" to "crafting materials"
- Learn Recipe context menu action added for items named "Scroll: *" — calls learnRecipeScroll reducer directly

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend useCrafting composable with recipeType filtering and craftable toggle** - `6b9044b` (feat)
2. **Task 2: Update CraftingPanel UI with filter chips, toggle, and material display; update InventoryPanel salvage text** - `2f16912` (feat)
3. **Task 3: Wire scroll-use UI in InventoryPanel for recipe scroll learning** - `0004e07` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/composables/useCrafting.ts` - Added activeFilter, showOnlyCraftable refs; recipeType/materialType on recipe objects; hasMaterial per requirement; recipeTypes computed; filteredRecipes computed
- `src/components/CraftingPanel.vue` - Full rewrite: filter chips, craftable toggle, red/green requirements, filteredRecipes, no Research button; updated prop types
- `src/components/InventoryPanel.vue` - Salvage text updated; isRecipeScroll helper; learnRecipeFromScroll handler; Learn Recipe context menu action
- `src/App.vue` - Extracts filteredRecipes/recipeTypes/activeFilter/showOnlyCraftable from useCrafting; passes to CraftingPanel with event handlers; removed @research handler

## Decisions Made
- Filter state (activeFilter, showOnlyCraftable) owned in composable and passed as props to CraftingPanel; updates emitted back via update:activeFilter/update:showOnlyCraftable — clean unidirectional data flow
- learnRecipeFromScroll uses window.__db_conn directly in InventoryPanel to avoid adding a new emit through CharacterInfoPanel for a single action
- recipeType accessed as `(recipe as any).recipeType` pending bindings regeneration after Plan 01 module publish

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 13 crafting system is fully wired end-to-end: Plan 01 (data/seeding), Plan 02 (reducers), Plan 03 (UI)
- Players can: gather materials, salvage gear for materials, learn recipes from scrolls, filter/browse recipes, craft gear
- Module must be published and bindings regenerated (from Plan 01/02) before live testing — recipeType/materialType bindings need to be current

## Self-Check: PASSED

- FOUND: src/composables/useCrafting.ts
- FOUND: src/components/CraftingPanel.vue
- FOUND: src/components/InventoryPanel.vue
- FOUND: .planning/phases/13-crafting-system-.../13-03-SUMMARY.md
- FOUND commits: 6b9044b, 2f16912, 0004e07

---
*Phase: 13-crafting-system*
*Completed: 2026-02-17*
