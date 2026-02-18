---
phase: quick-168
plan: 01
subsystem: frontend/crafting
tags: [tooltip, crafting, UX, frontend-only]
dependency_graph:
  requires: []
  provides: [crafting-recipe-hover-tooltips]
  affects: [CraftingPanel, useCrafting, App.vue tooltip pipeline]
tech_stack:
  added: []
  patterns: [mouseenter/mousemove/mouseleave tooltip emit pattern (matches LootPanel/VendorPanel)]
key_files:
  created: []
  modified:
    - src/composables/useCrafting.ts
    - src/components/CraftingPanel.vue
    - src/App.vue
decisions:
  - outputItem.affixStats is empty array — base template stats only, no rolled affixes (affixes computed at craft time)
  - outputItem.qualityTier mirrors rarity field — tooltip renderer uses qualityTier for rarity color
  - Guards on recipe.outputItem before emitting to handle null case gracefully
metrics:
  duration: ~3min
  completed: 2026-02-18
---

# Quick Task 168: Add Recipe Hover Tooltip to Crafting Panel

Hovering a recipe card in the Crafting panel now shows the standard item tooltip with the output item's base stats, rarity color, description, allowed classes, and gear type — using the same tooltip pipeline as inventory, vendor, and loot panels.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add outputItem tooltip data to useCrafting recipe entries | a4bd7ee | src/composables/useCrafting.ts |
| 2 | Wire tooltip events on CraftingPanel recipe cards and App.vue | c9d119e | src/components/CraftingPanel.vue, src/App.vue |

## What Was Built

**useCrafting.ts:** Each recipe entry in the `recipes` computed array now includes an `outputItem` object built from the output `ItemTemplateRow`. The object contains:
- `name`, `rarity`, `qualityTier`, `slot`, `armorType`, `allowedClasses`, `requiredLevel`, `description`
- `stats` array: AC, weapon damage, weapon DPS, weapon type, STR/DEX/CHA/WIS/INT/HP/Mana/MagicResist bonuses, required level — all filtered to non-zero values
- `affixStats: []` — empty because crafted affixes are rolled at craft time, not on the template

**CraftingPanel.vue:** Updated `recipes` prop type to include `outputItem`. Added three new emits (`show-tooltip`, `move-tooltip`, `hide-tooltip`). Each recipe `<li>` now has `@mouseenter`, `@mousemove`, `@mouseleave` handlers that emit tooltip events when `outputItem` is non-null.

**App.vue:** Added `@show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip"` to the CraftingPanel element, connecting to the existing shared tooltip handlers.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/composables/useCrafting.ts
- FOUND: src/components/CraftingPanel.vue
- FOUND: c9d119e (feat(quick-168): wire tooltip events on CraftingPanel recipe cards and App.vue)
- FOUND: a4bd7ee (feat(quick-168): add outputItem tooltip data to useCrafting recipe entries)
