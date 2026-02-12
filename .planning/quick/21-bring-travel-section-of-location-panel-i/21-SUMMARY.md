---
phase: quick-21
plan: 01
subsystem: client-ui
tags: [refactor, visual-consistency, grid-layout]
dependency_graph:
  requires: []
  provides: [grid-travel-ui]
  affects: [location-panel, travel-ux]
tech_stack:
  added: [gridTileTravel, gridTileGoButton]
  patterns: [grid-tile-layout, always-visible-sections]
key_files:
  created: []
  modified:
    - src/components/TravelPanel.vue
    - src/App.vue
    - src/ui/styles.ts
decisions:
  - Travel section uses teal-accented grid tiles (gridTileTravel) distinct from blue enemy tiles and green NPC tiles
  - AccordionKey type reduced to just 'enemies' after removing 'travel'
  - Go buttons remain on tiles (no context menu needed since travel has only one action)
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 3
  commits: 2
  completed_date: 2026-02-12
---

# Quick Task 21: Bring Travel Section to Location Panel Grid Consistency

**One-liner:** Travel section refactored to grid tile layout with teal-accented tiles, compact Go buttons, and TRAVEL section label—accordion wrapper removed for always-visible consistency with enemies/resources sections.

---

## Objective

Replace the Travel section's accordion + row-based miniMap layout with a grid tile layout matching the Enemies/Resources sections in LocationGrid. Keep Go buttons on each tile (no context menu needed since travel has a single action). Remove the `<details>` accordion wrapper so Travel is always visible like the other sections.

---

## What Was Built

### Task 1: Refactor TravelPanel to grid tile layout with Go buttons
**Commit:** c95f795

**In `src/ui/styles.ts`:**
- Added `gridTileTravel` style with teal/cyan accent (`rgba(100, 180, 220, ...)`) to differentiate from blue enemy tiles and green NPC tiles
- Added `gridTileGoButton` style for compact inline Go buttons on each tile

**In `src/components/TravelPanel.vue`:**
- Removed entire `miniMap` container and `miniMapRow` structure
- Replaced with `gridSectionLabel` ("TRAVEL") + `gridWrap` container pattern matching LocationGrid
- Each destination rendered as a `gridTileTravel` tile showing:
  - Con-colored location name
  - Level badge (L{level})
  - Region name (muted)
  - Compact "Go" button on the right
- Removed direction arrows (arbitrary visual dressing)
- Kept all existing logic: `sortedLocations` computed, `conStyleForDiff`, region lookup, sort by level
- Go button emits `move` event with location ID, disabled when not connected or already at that location

**Files modified:** src/components/TravelPanel.vue, src/ui/styles.ts

---

### Task 2: Remove accordion wrapper from Travel section in App.vue
**Commit:** 95957ed

**In `src/App.vue`:**
- Removed `<details>` and `<summary>` accordion wrapper around TravelPanel
- TravelPanel now renders directly (always visible)
- TRAVEL section label rendered inside TravelPanel itself (from Task 1)
- Removed `'travel'` from `AccordionKey` type union (now just `'enemies'`)
- Removed `travel: true` from `accordionState` reactive object initialization
- Removed `onTravelAccordionToggle` function entirely
- No localStorage references to 'travel' accordion state (handled by generic accordion persistence logic)

**Files modified:** src/App.vue

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification Results

- TravelPanel displays grid tiles matching the visual pattern of enemies/resources in LocationGrid ✓
- Each tile shows con-colored destination name, region, level, and a Go button ✓
- Go buttons work (emit move event with location ID) ✓
- No accordion around the travel section ✓
- No TypeScript errors introduced ✓
- Other sections (enemies, resources, NPCs, characters) are unaffected ✓

---

## Self-Check

Verifying key files and commits exist:

- src/components/TravelPanel.vue: FOUND
- src/App.vue: FOUND
- src/ui/styles.ts: FOUND
- Commit c95f795: FOUND
- Commit 95957ed: FOUND

## Self-Check: PASSED

---

## Success Criteria Met

✓ Travel section visually consistent with other location panel sections
✓ Uses gridSectionLabel for the TRAVEL header
✓ Uses gridWrap for the tile container
✓ Uses gridTileTravel for each destination tile
✓ Go buttons functional
✓ Accordion removed entirely

---

## Technical Notes

### Visual Consistency Achieved
- **TRAVEL** section label uses same uppercase style as **ENEMIES**, **RESOURCES**, **NPCS**, **CHARACTERS**
- Grid tile layout with teal accent distinguishes travel from other section types while maintaining visual harmony
- Compact Go buttons on each tile eliminate need for context menus (travel has single action vs. enemies/resources with multiple actions)

### State Management Simplification
- Removed travel accordion toggle state and handler
- AccordionKey type now only includes 'enemies' (simpler type union)
- One less UI state to persist and manage

### Code Cleanup
- Removed directionArrows logic (cycled through arrow chars with no semantic meaning)
- Removed mappedConnections computed (just sortedLocations now)
- Simpler template structure aligned with LocationGrid patterns
