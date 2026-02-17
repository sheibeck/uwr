---
phase: quick-109
plan: 01
subsystem: ui
tags: [character-selection, navigation, ux, camp]
dependency_graph:
  requires: []
  provides: [character-select-screen, camp-button, deselect-character]
  affects: [src/App.vue, src/components/ActionBar.vue, src/composables/useCharacters.ts, src/ui/styles.ts]
tech_stack:
  added: []
  patterns: [conditional-rendering, emit-event, composable-extension]
key_files:
  created: []
  modified:
    - src/App.vue
    - src/components/ActionBar.vue
    - src/composables/useCharacters.ts
    - src/ui/styles.ts
decisions:
  - "Camp button replaces Characters button in action bar; Characters panel removed from game world"
  - "Character select screen shown as v-if/v-else inside State 3 shell based on selectedCharacter null check"
  - "goToCamp closes all panels and deselects character via deselectCharacter() in useCharacters"
  - "Auto-selection on login (via activeId watch) preserved — returning users go directly to game world"
metrics:
  duration: 3min
  completed: 2026-02-17
  tasks: 3
  files: 4
---

# Phase quick-109 Plan 01: Character Selection Screen Summary

Character select screen gates access to the game world — on login without an active character, users see a full-screen character creation/selection UI; after selecting a character they enter the game world; Camp button in action bar returns users to the select screen.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add character select screen state and Camp functionality to App.vue | a7428bc | src/App.vue, src/composables/useCharacters.ts |
| 2 | Replace Characters button with Camp button in ActionBar | 2664b45 | src/components/ActionBar.vue |
| 3 | Style the character select screen | c9bb2a1 | src/ui/styles.ts |

## What Was Built

### Character Select Screen (App.vue)
- Added `v-if="!selectedCharacter"` sub-state inside State 3 (logged in + loaded) that shows a full-screen character selection UI
- Renders `CharacterPanel` directly (not in a floating panel) with a "Select Your Character" title
- Footer (CommandBar + ActionBar) remains visible — ActionBar shows only Log and Help buttons when no character is active (hasActiveCharacter guard)
- Removed the floating Character Panel from the game world entirely

### deselectCharacter (useCharacters.ts)
- Added `deselectCharacter()` function that sets `selectedCharacterId.value = ''`
- Exported from composable return object
- The existing watch guard `if (!next)` prevents `setActiveCharacter` reducer from being called on deselect

### goToCamp (App.vue)
- Calls `deselectCharacter()` and closes all open panels
- Wired to ActionBar's `@camp` event

### Camp Button (ActionBar.vue)
- Replaced the "Characters" button (which toggled the floating character panel) with a "Camp" button
- Camp button only appears inside `<template v-if="hasActiveCharacter">` block
- Emits `('camp')` event (not a toggle event)
- Disabled during combat via `isLocked('camp')` which checks `combatLocked` prop

### Character Select Styles (styles.ts)
- `charSelectScreen`: full-screen flex container, `flex: 1`, centered, transparent background
- `charSelectTitle`: uppercase title text matching game aesthetic
- `charSelectContent`: max-width 900px card with dark background and subtle border

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] src/composables/useCharacters.ts modified (deselectCharacter added)
- [x] src/App.vue modified (character select screen, goToCamp, ActionBar @camp wired)
- [x] src/components/ActionBar.vue modified (Camp button replaces Characters)
- [x] src/ui/styles.ts modified (3 new style entries)
- [x] Build passes: `npx vite build` succeeds with 0 errors
- [x] Commits: a7428bc, 2664b45, c9bb2a1

## Self-Check: PASSED
