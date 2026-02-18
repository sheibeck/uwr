---
phase: quick-184
plan: 01
subsystem: crafting-ui
tags: [crafting, ui, vue, emit]
dependency_graph:
  requires: []
  provides: [discover-recipes-button]
  affects: [CraftingPanel, App.vue, useCrafting]
tech_stack:
  added: []
  patterns: [vue-emit, ghostButton-disabled-pattern]
key_files:
  created: []
  modified:
    - src/components/CraftingPanel.vue
    - src/App.vue
decisions:
  - Placed button above filter chips so it's immediately visible when crafting panel opens
  - Used styles.ghostButton (pre-existing style) with styles.disabledButton spread when disabled, matching InventoryPanel pattern
  - No changes to useCrafting.ts or backend — entire research chain was already intact
metrics:
  duration: ~3min
  completed: 2026-02-18T16:18:15Z
  tasks: 1
  files: 2
---

# Phase quick-184: Restore Discover Recipes Button in CraftingPanel Summary

Restored missing "Discover Recipes" button to CraftingPanel that was dropped during the Phase 13 Plan 03 UI refactor, re-wiring the existing research_recipes reducer chain through the emit system.

## What Was Done

### Task 1: Restore Discover Recipes button and wire emit

Added "Discover Recipes" button to CraftingPanel.vue above the type filter chips. The button:
- Uses `styles.ghostButton` styling with `styles.disabledButton` spread when disabled
- Is disabled when `!craftingAvailable || combatLocked`
- Emits `$emit('research')` on click

Added `(e: 'research'): void` to the `defineEmits` type signature in CraftingPanel.vue.

Added `@research="onResearchRecipes"` to the CraftingPanel component binding in App.vue (line 185). The `onResearchRecipes` handler was already fully implemented at line 1698 — it calls `researchRecipes()` from `useCrafting`, which calls the `research_recipes` reducer.

**Commit:** e7bb5e7

## Verification

- `grep -n "Discover Recipes" src/components/CraftingPanel.vue` returns line 21 (button text)
- `grep -n "@research" src/App.vue` returns line 185 (CraftingPanel binding)
- `npx vue-tsc --noEmit` — no new errors in CraftingPanel.vue or App.vue

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- src/components/CraftingPanel.vue — modified, contains "Discover Recipes" button
- src/App.vue — modified, contains `@research="onResearchRecipes"`
- Commit e7bb5e7 — verified present in git log
