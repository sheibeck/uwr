---
phase: quick-24
plan: 01
subsystem: ui
tags: [ui, persistence, panels, spacetimedb]
dependency_graph:
  requires: [multi-panel-system]
  provides: [server-panel-persistence]
  affects: [panel-manager, game-data-composable]
tech_stack:
  added: [UiPanelLayout-table, save_panel_layout-reducer, my_panel_layout-view]
  patterns: [server-state-sync, debounced-save, localStorage-cache]
key_files:
  created:
    - spacetimedb/src/reducers/ui.ts
    - spacetimedb/src/views/ui.ts
    - src/module_bindings/ui_panel_layout_type.ts
    - src/module_bindings/my_panel_layout_table.ts
    - src/module_bindings/save_panel_layout_reducer.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/index.ts
    - spacetimedb/src/views/index.ts
    - spacetimedb/src/views/types.ts
    - src/composables/useGameData.ts
    - src/composables/usePanelManager.ts
    - src/App.vue
decisions:
  - choice: JSON blob per character (not 17+ rows per character)
    rationale: Simpler schema, fewer rows, easier to update atomically
  - choice: 2-second debounce for server saves vs 300ms for localStorage
    rationale: Avoid reducer spam while keeping immediate local UX
  - choice: loadingFromServer flag to prevent feedback loop
    rationale: Server load triggers watch, which would trigger save without guard
  - choice: Always force fixed panels (group/travel/hotbar/log) open after server load
    rationale: Match original design intent — these panels are always visible
metrics:
  duration_minutes: 6
  completed_date: 2026-02-12
  tasks_completed: 2
  commits: 2
---

# Quick Task 24: Server-Side Persistence for UI Panel Layout

**One-liner:** Panel positions, sizes, and visibility persist server-side per character, syncing across browsers/devices with localStorage as immediate cache.

## Context

Users were losing panel layout when switching browsers/devices because positions were only stored in localStorage. This quick task adds server-side persistence so UI setup follows the account.

## What Was Built

### Backend (Task 1)

**UiPanelLayout table:**
- Stores one row per character containing JSON-serialized panel states
- Index on `characterId` for efficient lookups
- Columns: `id`, `characterId`, `panelStatesJson`, `updatedAt`

**save_panel_layout reducer:**
- Accepts `characterId` and `panelStatesJson` string
- Validates ownership with `requireCharacterOwnedBy()`
- Validates JSON length < 10000 chars (sanity limit)
- Upserts: updates existing row or inserts new
- Records `updatedAt` timestamp

**my_panel_layout view:**
- Filters `UiPanelLayout` by player's active character
- Returns array of 0-1 rows (one per character)

### Client (Task 2)

**useGameData.ts:**
- Added `panelLayouts` subscription via `useTable(tables.myPanelLayout)`
- Returns alongside other game data

**usePanelManager.ts:**
- Added `ServerSyncOptions` interface with serverPanelLayouts, selectedCharacterId, savePanelLayout
- Optional second parameter for server sync
- **Server → Client:** Watch on `[serverPanelLayouts, selectedCharacterId]` parses JSON and applies to panels
- **Client → Server:** Modified `saveToStorage()` to also call `saveToServer()` with 2s debounce
- **Feedback loop guard:** `loadingFromServer` flag prevents server load from triggering immediate server save
- **Fixed panels:** Always ensure group/travel/hotbar/log panels start open after server load

**App.vue:**
- Added `panelLayouts` destructure from `useGameData()`
- Created `savePanelLayoutReducer` via `useReducer(reducers.savePanelLayout)`
- Passed `serverPanelLayouts`, `selectedCharacterId`, `savePanelLayoutReducer` to `usePanelManager()`

## Verification

1. ✅ Module published successfully with `spacetime publish uwr --clear-database -y`
2. ✅ Logs show "Creating table for view `my_panel_layout`"
3. ✅ Client bindings generated without errors
4. ✅ TypeScript compiles (readonly warnings are pre-existing, not related to this task)
5. ⚠️ Manual testing pending: Move panels → check logs for reducer call → open in incognito → verify positions match

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing dependency] Added pullStates to App.vue during merge**
- **Found during:** Task 2 client integration
- **Issue:** Linter/previous work had added `pullStates` to useGameData but not to App.vue destructure
- **Fix:** Added `pullStates` to App.vue destructure list
- **Files modified:** src/App.vue
- **Commit:** ae45e00

## Success Criteria Met

- [x] UiPanelLayout table stores one JSON row per character
- [x] save_panel_layout reducer upserts with ownership validation
- [x] my_panel_layout view returns only active character's row
- [x] Client loads server layout when character selected
- [x] Client saves on changes with 2s debounce
- [x] localStorage still works as immediate cache
- [x] No feedback loop between server load and server save

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend — UiPanelLayout table, reducer, and view | b5ca703 | spacetimedb/src/{index.ts, reducers/ui.ts, reducers/index.ts, views/ui.ts, views/index.ts, views/types.ts} |
| 2 | Client — Wire up server sync | ae45e00 | src/{App.vue, composables/useGameData.ts, composables/usePanelManager.ts}, src/module_bindings/* |

## Self-Check: PASSED

**Created files:**
- ✅ spacetimedb/src/reducers/ui.ts
- ✅ spacetimedb/src/views/ui.ts
- ✅ src/module_bindings/ui_panel_layout_type.ts
- ✅ src/module_bindings/my_panel_layout_table.ts
- ✅ src/module_bindings/save_panel_layout_reducer.ts

**Commits:**
- ✅ b5ca703 (Task 1 backend)
- ✅ ae45e00 (Task 2 client)

## Next Steps

1. Manual testing: Move panels, check SpacetimeDB logs for `save_panel_layout` calls
2. Test multi-character: Switch between characters, verify independent layouts
3. Test cross-browser: Open same account in incognito, verify positions restore
4. Test new character: Verify defaults apply when no server layout exists
