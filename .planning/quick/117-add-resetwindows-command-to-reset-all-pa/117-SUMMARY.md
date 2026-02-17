---
quick: 117
title: Add /resetwindows command to reset all panel positions
completed: 2026-02-17
commit: 7d360fa
files_modified:
  - src/composables/usePanelManager.ts
  - src/composables/useCommands.ts
  - src/components/CommandBar.vue
  - src/App.vue
---

# Quick Task 117: Add /resetwindows command

## One-liner

Client-side `/resetwindows` slash command that centers all floating panels on screen and persists the reset positions via localStorage and server save.

## What was done

Added an emergency recovery command `/resetwindows` that resets all draggable panel positions to the center of the screen. Useful when a panel gets dragged off-screen.

### Changes

**`src/composables/usePanelManager.ts`**
- Added `resetAllPanels()` function that:
  - Calculates center position from `window.innerWidth / 2 - 160`, `window.innerHeight / 2 - 100`
  - Sets all panel x/y to that centered position
  - Calls `markDirty()` then `saveToStorage()` to persist immediately (localStorage + deferred server save via `savePanelLayout` reducer)
- Exported `resetAllPanels` from the composable return

**`src/composables/useCommands.ts`**
- Added optional `resetPanels?: () => void` and `addLocalEvent?: (kind, message) => void` to `UseCommandsArgs`
- Added `/resetwindows` handler in `submitCommand` that calls `resetPanels()` and logs "All windows reset to center." as a client event

**`src/components/CommandBar.vue`**
- Added `{ value: '/resetwindows', hint: 'Reset all panel positions to center of screen' }` to the commands suggestions list

**`src/App.vue`**
- Declared a forward ref `_resetPanelsCb` before the `useCommands` call (since `usePanelManager` is initialized later in the file)
- Passed `resetPanels: () => _resetPanelsCb.value?.()` and `addLocalEvent` to `useCommands`
- After `usePanelManager` is initialized, assigned `_resetPanelsCb.value = resetAllPanels`

## Persistence

The reset persists because `saveToStorage()` is called immediately in `resetAllPanels`, which:
1. Writes to `localStorage` (`uwr.panelStates`) after a 300ms debounce
2. Then calls `saveToServer()` which invokes `savePanelLayout` reducer after a 2000ms debounce

After reload, panels load positions from localStorage first, then server — both will have the centered positions.

## Deviations from Plan

None — plan executed exactly as written.
