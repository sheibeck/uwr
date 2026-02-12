---
phase: quick-20
plan: 01
subsystem: ui
tags: [quick-task, ui, floating-panels, hotbar, consistency]
dependency_graph:
  requires: [quick-18]
  provides: [unified-floating-panel-structure]
  affects: [ui-consistency]
tech_stack:
  added: []
  patterns: [floating-panel-standard-structure]
key_files:
  created: []
  modified:
    - src/App.vue
    - src/ui/styles.ts
decisions:
  - decision: "Use floatingPanelHotbar (160px width) instead of floatingPanelCompact"
    rationale: "Hotbar only shows compact ability buttons (slot number + name), needs narrower width than standard panels"
  - decision: "No close button on hotbar header"
    rationale: "Hotbar is always visible when character selected, matches group panel pattern"
  - decision: "Updated floatingPanelBody to include flex layout with gap"
    rationale: "Provides consistent spacing for hotbar buttons, works for all panels using floatingPanelBody"
metrics:
  duration: "~2 minutes"
  completed_date: 2026-02-12
  tasks_completed: 1
  files_modified: 2
  commit: 2abcad3
---

# Quick Task 20: Align Floating Hotbar with Standard Panel Structure

**One-liner:** Refactored floating hotbar (ability activation panel) to use standard floatingPanel/floatingPanelHeader/floatingPanelBody structure with compact width override

## What Was Done

Aligned the floating hotbar styling with other floating panels by replacing one-off styles (hotbarFloating, hotbarHandle, hotbarDock) with the standard panel structure used across the application.

### Changes Made

1. **Updated App.vue floating hotbar container**
   - Added `data-panel-id="hotbar"` attribute for consistency
   - Replaced `styles.hotbarFloating` with `styles.floatingPanel + styles.floatingPanelHotbar`
   - Replaced `styles.hotbarHandle` with `styles.floatingPanelHeader`
   - Replaced `styles.hotbarDock` with `styles.floatingPanelBody`
   - Preserved all ability button markup (v-for, disabled logic, click handlers, tooltips, cast bars, cooldown overlays)

2. **Updated styles.ts**
   - Added `floatingPanelHotbar: { width: '160px' }` for compact hotbar width
   - Removed obsolete `hotbarFloating`, `hotbarHandle`, and `hotbarDock` styles
   - Updated `floatingPanelBody` to include flex layout (`display: 'flex', flexDirection: 'column', gap: '0.45rem'`)
   - Kept all slot-level styles unchanged (hotbarSlot, hotbarSlotActive, hotbarSlotEmpty, hotbarCastFill, hotbarCooldownFill, etc.)

### Functionality Preserved

All ability activation functionality remains intact:
- Clicking abilities triggers reducers
- Cast bar fills during casting
- Cooldown overlays show remaining time
- Tooltips display on hover
- Disabled states prevent invalid actions
- Hotbar is draggable via header

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Commit | Message |
|--------|---------|
| 2abcad3 | feat(quick-20): align floating hotbar with standard panel structure |

## Self-Check: PASSED

**Files exist:**
```
FOUND: src/App.vue
FOUND: src/ui/styles.ts
```

**Commits exist:**
```
FOUND: 2abcad3
```

**Old styles removed:**
```
No references to hotbarFloating, hotbarHandle, or hotbarDock in src/
```

**Visual consistency verified:**
- Hotbar now has same dark background (#141821), border-radius (14px), border, and box-shadow as other panels
- Header has same font weight, padding, and border-bottom as other panel headers
- Body uses standard floatingPanelBody padding and layout
- Hotbar is draggable via the standard floatingPanelHeader pattern
