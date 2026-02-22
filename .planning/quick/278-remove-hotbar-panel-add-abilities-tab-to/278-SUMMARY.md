---
phase: quick-278
plan: 01
subsystem: ui
tags: [hotbar, character-panel, abilities, onboarding]
dependency_graph:
  requires: []
  provides: [CharacterInfoPanel-Abilities-tab, ActionBar-without-hotbar-button]
  affects: [App.vue, ActionBar.vue, CharacterInfoPanel.vue]
tech_stack:
  added: []
  patterns: [right-click-context-menu, tab-panel, prop-drilling]
key_files:
  created: []
  modified:
    - src/components/ActionBar.vue
    - src/components/CharacterInfoPanel.vue
    - src/App.vue
decisions:
  - "Used plain object type shape for availableAbilities and renownPerks props instead of importing AbilityTemplateRow/RenownPerkRow types, matching the HotbarPanel.vue pattern and avoiding pre-existing TS2749 import issues in SFC files"
  - "Onboarding simplified: opening Character panel while on inventory step now immediately dismisses onboarding (no intermediate abilities step) since the Abilities tab is in the same panel the user just opened"
metrics:
  duration: ~15 minutes
  completed: "2026-02-22T02:54:04Z"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 278: Remove Hotbar Panel, Add Abilities Tab to Character Panel - Summary

**One-liner:** Consolidated ability management into Character panel by removing the dedicated Hotbar button/panel and adding an Abilities tab with right-click context menus for description viewing and hotbar slot assignment.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Remove Hotbar button from ActionBar and HotbarPanel from App.vue | ba2b80e | ActionBar.vue, App.vue |
| 2 | Add Abilities tab to CharacterInfoPanel and wire up in App.vue | d4e4622 | CharacterInfoPanel.vue, App.vue |

## What Was Built

**Task 1 - Hotbar button/panel removal:**
- Removed the "Hotbar" button from `ActionBar.vue` template
- Removed `'hotbarPanel'` from the `PanelKey` union type
- Removed `highlightHotbar` prop and its highlight branch from `actionStyle()`
- Removed the `<!-- Hotbar Panel -->` floating div from `App.vue`
- Removed `HotbarPanel` import from `App.vue`
- Removed `:highlight-hotbar` binding from the `<ActionBar>` usage
- Updated onboarding: type narrowed to `'inventory' | 'abilities' | null`, hint now says "Open Character > Abilities tab"
- Simplified onboarding watcher: opening characterInfo panel while on inventory step now dismisses onboarding completely

**Task 2 - Abilities tab in CharacterInfoPanel:**
- Added "Abilities" as 4th tab in the tab bar (after Race)
- Added `availableAbilities` and `renownPerks` props (plain object shapes)
- Added `add-ability-to-hotbar` and `show-ability-popup` emits
- Abilities tab renders class abilities with name, level, resource, and kind info
- Active renown perks section renders below abilities (hidden if empty)
- Right-click context menu on each row: "What does this do?" and "Add to Hotbar"
- "What does this do?" emits `show-ability-popup` which App.vue forwards to `showAbilityPopup`
- "Add to Hotbar" emits `add-ability-to-hotbar` which App.vue handles via `window.prompt` + `setHotbarSlot`
- Added `onAddAbilityToHotbar` and `onShowAbilityPopupFromPanel` handlers in App.vue
- Passed `:available-abilities="availableAbilities"` and `:renown-perks="characterRenownPerks"` to CharacterInfoPanel

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written with one minor clarification:

**Type imports:** The plan specified `import type { AbilityTemplateRow, RenownPerkRow }` but these are runtime values in module_bindings (not TypeScript type exports), causing TS2749 errors in SFC context. Used plain object type shapes instead, matching the pattern already established in HotbarPanel.vue. This is not a functional change.

**Onboarding watcher simplification:** The plan outlined two possible approaches for the watcher (advance to 'abilities' step vs immediately dismiss). Implemented the "simplest correct behavior" path specified at the end of the plan description: when inventory step completes and characterInfo opens, dismiss immediately (set null) since Abilities tab is in the same panel.

## Self-Check

### Files Exist
- src/components/ActionBar.vue - FOUND (modified)
- src/components/CharacterInfoPanel.vue - FOUND (modified)
- src/App.vue - FOUND (modified)

### Commits Exist
- ba2b80e - Task 1 commit - FOUND
- d4e4622 - Task 2 commit - FOUND

### No New TypeScript Errors
- `npx vue-tsc --noEmit` produces no new errors related to our changes
- Pre-existing errors (TS4104, TS2322, etc.) in other files remain unchanged

## Self-Check: PASSED
