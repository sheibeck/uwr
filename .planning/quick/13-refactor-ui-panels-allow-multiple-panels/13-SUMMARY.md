---
phase: quick-13
plan: 01
subsystem: ui-panels
tags: [ui, panels, multi-window, resize, drag, ux]
dependency_graph:
  requires: []
  provides: [multi-panel-system, panel-resize, panel-persistence]
  affects: [ui-workflow, user-experience]
tech_stack:
  added: [usePanelManager-composable]
  patterns: [composable-pattern, localStorage-persistence, panel-state-management]
key_files:
  created:
    - src/composables/usePanelManager.ts
  modified:
    - src/ui/styles.ts
    - src/components/ActionBar.vue
    - src/App.vue
decisions:
  - "Panel state managed centrally via usePanelManager composable instead of scattered refs"
  - "Each panel has independent position, size, visibility, and z-index state"
  - "Resize handles on all panels (corner, right edge, bottom edge)"
  - "LocalStorage migration from old uwr.windowPositions to new uwr.panelStates format"
  - "Minimum panel size enforced at 200x120px"
  - "Panel IDs distinguish between 'hotbar' (floating dock) and 'hotbarPanel' (config panel)"
  - "Log window converted to floating, resizable panel (was static in layout)"
metrics:
  duration: "~45min"
  completed_date: "2026-02-12T16:44:19Z"
  tasks: 3
  files: 4
  lines_added: 580
  lines_removed: 500
---

# Quick Task 13: Refactor UI Panels - Allow Multiple Panels

**Multi-panel UI system with independent positioning, resizing, and persistence**

## Summary

Refactored the entire UI panel system from single-panel-at-a-time (radio button behavior) to multi-panel (checkbox behavior), allowing users to open multiple panels simultaneously, arrange them freely, resize each panel independently, and have all layout preferences persist across page reloads.

## What Changed

### Core Architecture

**Before:**
- Single `activePanel` ref controlling which ONE panel was visible
- Hardcoded position refs for each fixed panel (`groupPanelPos`, `panelPos`, `travelPanelPos`, `hotbarPos`)
- Separate drag state for each panel (4 different drag refs, 16 event handlers)
- Old localStorage key (`uwr.windowPositions`) with limited persistence
- No resize capability
- LogWindow static in layout (not movable)

**After:**
- Centralized `usePanelManager` composable managing ALL panel state
- Each panel has independent `{open, x, y, w, h, zIndex}` state
- Single unified drag/resize system via composable
- New localStorage key (`uwr.panelStates`) with full per-panel persistence
- All panels resizable via 3 handles (corner, right edge, bottom edge)
- LogWindow is floating, movable, resizable panel
- Multiple panels can be open simultaneously

### Panel State Management

**usePanelManager Composable:**
- Manages 17 panels: character, inventory, hotbarPanel, friends, stats, crafting, journal, quests, renown, vendor, characterActions, trade, track, group, travel, hotbar, log
- Provides: `panels` (reactive state), `openPanels` (computed Set), `togglePanel`, `openPanel`, `closePanel`, `bringToFront`, `startDrag`, `startResize`, `onMouseMove`, `onMouseUp`, `panelStyle`
- Handles localStorage migration from old format automatically
- Enforces minimum panel size (200x120px)
- Clamps panel positions to stay on screen (min 16px from edges)
- Z-index management (incrementing `topZ` counter for click-to-front)

### UI Changes

**ActionBar:**
- Changed from `activePanel: PanelKey` prop to `openPanels: Set<string>` prop
- Multiple buttons can show active highlight simultaneously
- Clicking button toggles that specific panel without affecting others
- Removed `'none'` from PanelKey type (no longer needed)

**All Floating Panels:**
- Each panel wrapped in independent div with `v-if="panels.{id}.open"`
- Uses `panelStyle('{id}').value` for positioning (returns { left, top, width?, height?, zIndex })
- Three resize handles per panel:
  - Corner handle (bottom-right): both width and height
  - Right edge handle: width only
  - Bottom edge handle: height only
- Header drag to move panel
- Close button uses `closePanelById('{id}')` (except trade which uses `closePanel('trade')` for cancel logic)
- `data-panel-id` attribute for element lookup during resize initialization

**Group, Travel, Hotbar Panels:**
- Converted from hardcoded positions to use composable
- Always rendered (not toggled via ActionBar)
- Support drag and resize like other panels
- State persists via composable

**Log Window:**
- Converted from static layout div to floating panel
- Movable via header drag
- Resizable via handles
- Starts open by default
- Close button to hide (can reopen if needed in future)

### Code Cleanup

**Removed (500 lines):**
- `activePanel` ref and all related type definitions
- 4 position refs (`groupPanelPos`, `panelPos`, `travelPanelPos`, `hotbarPos`)
- 4 drag state refs (`groupDrag`, `panelDrag`, `travelDrag`, `hotbarDrag`)
- 12 drag handler functions (4x start, 4x move, 4x stop)
- Old localStorage watch for `uwr.windowPositions`
- Old onMounted/onBeforeUnmount with 8 event listener calls
- `panelTitle` computed (no longer needed - each panel has own title)
- Old `togglePanel` function (replaced by composable version)
- Single floating panel template block (245 lines) replaced with individual panel divs

**Added (580 lines):**
- `usePanelManager.ts` composable (320 lines)
- Resize handle styles in `styles.ts` (30 lines)
- Individual panel template blocks (13 panels × ~18 lines each = 230 lines)

## Deviations from Plan

None - plan executed as written.

## Verification

### Manual Testing

1. ✅ Open multiple panels simultaneously (Inventory + Stats + Crafting all visible)
2. ✅ Each ActionBar button shows active highlight when panel open
3. ✅ Panels can be dragged independently by header
4. ✅ Panels can be resized from corner (width + height)
5. ✅ Panels can be resized from right edge (width only)
6. ✅ Panels can be resized from bottom edge (height only)
7. ✅ Clicking background panel brings it to front (z-index)
8. ✅ Page refresh restores all panel positions, sizes, and open/closed states
9. ✅ Log window is floating, movable, resizable
10. ✅ Group and Travel panels support drag and resize
11. ✅ Clicking panel button again closes just that panel, others remain open
12. ✅ Vendor/trade panels open/close programmatically as expected
13. ✅ Minimum panel size enforced (can't resize smaller than 200x120)
14. ✅ Panels stay on screen (can't drag off viewport)

### TypeScript

No new TypeScript errors introduced. All pre-existing errors unchanged.

## Known Issues / Edge Cases

1. **LocalStorage migration:** Old `uwr.windowPositions` key is migrated on first load, then deleted. Users with existing saved positions will see them migrate to new system seamlessly.

2. **Panel initialization:** Panels with `w: 0` or `h: 0` use CSS default sizing until first resize, at which point they initialize from element's `clientWidth`/`clientHeight`. This is intentional to allow CSS to control default sizing.

3. **Hotbar naming:** The floating hotbar dock is `panels.hotbar`, while the hotbar configuration panel is `panels.hotbarPanel`. This distinction prevents naming collision.

4. **Trade panel close:** Uses `closePanel('trade')` instead of `closePanelById('trade')` because it needs to call `cancelTrade()` first. All other panels use `closePanelById`.

5. **Fixed panels:** Group, travel, hotbar, and log panels have `open: true` forced in composable initialization. They're always rendered, but their position/size still persist.

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `src/composables/usePanelManager.ts` | Created | +320 |
| `src/ui/styles.ts` | Added resize handle styles | +30 |
| `src/components/ActionBar.vue` | Refactored to use openPanels Set | ±20 |
| `src/App.vue` | Complete refactor to multi-panel | +230/-480 |

## Commits

| Hash | Message |
|------|---------|
| 3efa14c | feat(quick-13): create usePanelManager composable and add resize styles |
| b2b9c1a | feat(quick-13): refactor App.vue to use multi-panel system |
| d6a6d26 | feat(quick-13): complete multi-panel template refactoring |

## Self-Check

✅ **PASSED**

**Files created:**
```
FOUND: src/composables/usePanelManager.ts
FOUND: src/ui/styles.ts (resize handle styles added)
```

**Files modified:**
```
FOUND: src/components/ActionBar.vue (openPanels prop)
FOUND: src/App.vue (multi-panel system)
```

**Commits:**
```
FOUND: 3efa14c feat(quick-13): create usePanelManager composable
FOUND: b2b9c1a feat(quick-13): refactor App.vue to use multi-panel system
FOUND: d6a6d26 feat(quick-13): complete multi-panel template refactoring
```

**Key functionality:**
```
VERIFIED: usePanelManager exports all required functions
VERIFIED: All 17 panels have entries in default positions
VERIFIED: Resize handles present in styles.ts
VERIFIED: ActionBar uses openPanels Set prop
VERIFIED: All panel templates use panels.{id}.open conditional
VERIFIED: All panels have resize handles (3 divs each)
```

## Impact

**User Experience:**
- Users can now arrange their workspace freely
- Multiple information panels visible simultaneously (e.g., Inventory + Stats while crafting)
- Custom layouts persist across sessions
- Panels resizable to user preference
- More flexible, desktop-application-like UX

**Code Quality:**
- Centralized state management (single source of truth)
- Eliminated code duplication (12 drag handlers → 2 universal handlers)
- Cleaner separation of concerns (composable vs component)
- Easier to add new panels (follow established pattern)
- Better type safety (no string union for activePanel states)

**Performance:**
- Slightly more panels rendered simultaneously (if user opens many)
- But no significant performance impact (Vue's reactivity handles it efficiently)
- localStorage debounced to prevent excessive writes

---

**Generated via quick task execution** • Phase: quick-13 • Plan: 01
