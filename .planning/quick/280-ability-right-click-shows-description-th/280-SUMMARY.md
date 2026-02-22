---
phase: 280-ability-right-click-shows-description-th
plan: "01"
subsystem: UI / Hotbar / CharacterInfoPanel
tags: [ui, context-menu, hotbar, abilities]
dependency_graph:
  requires: []
  provides: [inline-ability-description-context-menus]
  affects: [CharacterInfoPanel, App.vue hotbar]
tech_stack:
  added: []
  patterns: [inline-description-block, vue-context-menu]
key_files:
  created: []
  modified:
    - src/components/CharacterInfoPanel.vue
    - src/App.vue
decisions:
  - Removed show-ability-popup emit entirely since onShowDescription was its sole consumer
  - Used mouseleave to close hotbar context menu (consistent with CharacterInfoPanel pattern)
metrics:
  duration: ~15 minutes
  completed: 2026-02-21
---

# Phase 280 Plan 01: Ability Right-Click Shows Description Summary

Inline ability description display in context menus for abilities tab and hotbar slots, replacing the two-button "What does this do? / Add to Hotbar" pattern with description text at top and action button(s) below.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Overhaul Abilities tab context menu in CharacterInfoPanel | 366a0dd | src/components/CharacterInfoPanel.vue, src/App.vue |
| 2 | Overhaul hotbar slot right-click in App.vue | b42f1cb | src/App.vue |

## What Was Built

**CharacterInfoPanel.vue** — abilities tab context menu:
- Removed the "What does this do?" button
- Added a grey description block (`v-if="contextMenu.description"`) at the top of the popup, showing ability description text inline
- Kept only the "Add to Hotbar" button below the description
- Increased popup `minWidth` from 160px to 200px for readability
- Removed `onShowDescription` function and `show-ability-popup` emit (no longer needed)
- Renown perks (which pass empty string for description) correctly hide the description block via `v-if`

**App.vue** — hotbar slot right-click:
- Replaced `showAbilityPopup(...)` call on `@contextmenu.prevent` with `showHotbarContextMenu(slot, x, y)`
- Added `hotbarContextMenu` ref to track popup state (visible, position, slot number, name, description)
- Added `showHotbarContextMenu` and `hideHotbarContextMenu` helper functions
- Added hotbar context menu popup element in the template with:
  - Grey description block at top (hidden when empty via `v-if`)
  - "Remove from Hotbar" button that calls `setHotbarSlot(slot, '')` to clear the slot
  - `@mouseleave` to auto-dismiss
- Empty hotbar slots produce no menu (guarded by `slot.abilityKey &&` in the handler)
- Also removed `onShowAbilityPopupFromPanel` handler from App.vue (was wired to the now-deleted `show-ability-popup` emit)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed orphaned show-ability-popup handler in App.vue**
- **Found during:** Task 1
- **Issue:** After removing the `show-ability-popup` emit from CharacterInfoPanel, the `@show-ability-popup="onShowAbilityPopupFromPanel"` binding in App.vue and its handler function `onShowAbilityPopupFromPanel` became dead code
- **Fix:** Removed both the template binding and the handler function
- **Files modified:** src/App.vue
- **Commit:** 366a0dd

## Self-Check: PASSED

- `src/components/CharacterInfoPanel.vue` - FOUND
- `src/App.vue` - FOUND (hotbarContextMenu ref, showHotbarContextMenu function, context menu div in template)
- Commit 366a0dd - FOUND
- Commit b42f1cb - FOUND
- No TypeScript errors in modified files (pre-existing errors in other composables are out of scope)
