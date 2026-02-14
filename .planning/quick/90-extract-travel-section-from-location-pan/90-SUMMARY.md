---
phase: quick-90
plan: 01
subsystem: ui
tags: [ui-architecture, panel-management, travel-system]
dependency_graph:
  requires: [quick-84]
  provides: [standalone-travel-panel]
  affects: [location-panel, action-bar, panel-manager]
tech_stack:
  added: []
  patterns: [floating-panel-extraction, toggleable-panel]
key_files:
  created: []
  modified:
    - src/App.vue
    - src/components/ActionBar.vue
decisions: []
metrics:
  duration_seconds: 98
  tasks_completed: 1
  files_modified: 2
  commits: 1
  completed_at: "2026-02-14"
---

# Quick Task 90: Extract Travel Section from Location Panel

**One-liner:** TravelPanel extracted into independent floating panel with ActionBar toggle, reducing Location panel complexity

## Overview

The Location panel was growing too large with multiple sections (location info, travel destinations, combat, and LocationGrid). This task extracted the Travel section into its own standalone floating panel, giving users independent control over its visibility and position.

## Changes Made

### 1. Standalone Travel Panel (App.vue)

**Added new floating panel wrapper** (lines 268-272):
- Panel ID: `travelPanel`
- Toggle-able via ActionBar (not always-open like the Location panel)
- Standard floating panel features: draggable header, close button, resize handles
- Positioned at default `{ x: 600, y: 140 }` in usePanelManager defaults

**Removed TravelPanel from Location panel body** (lines 318-328 deleted):
- Location panel now renders only: combat (when active) OR LocationGrid (when not in combat)
- Travel destinations no longer appear inside Location panel

**Panel manager integration**:
- Added `travelPanel: { x: 600, y: 140 }` to usePanelManager defaults
- travelPanel is NOT in the always-open list (unlike `travel`, `group`, `hotbar`, `log`)
- This is intentional: `travel` = Location panel (always open), `travelPanel` = Travel-only panel (toggleable)

### 2. ActionBar Button (ActionBar.vue)

**Added Travel button** (between Renown and Loot):
```vue
<button
  @click="emit('toggle', 'travelPanel')"
  :style="actionStyle('travelPanel')"
  :disabled="isLocked('travelPanel')"
>
  Travel
</button>
```

**Updated PanelKey type**:
- Added `'travelPanel'` to type union alongside existing panel keys

## Technical Details

### Panel Naming Convention

- `travel` = Location panel (always visible, shows location name/region/time indicator)
- `travelPanel` = Travel-only panel (toggleable, shows travel destinations with stamina costs/cooldowns)

This naming preserves backward compatibility with existing panel layout persistence.

### Preserved Functionality

All existing travel features work identically from the standalone panel:

- Destination sorting by target level
- Stamina cost indicators (5 within-region, 10 cross-region)
- Cross-region visual distinction (amber region name)
- Cooldown countdown timer
- Unaffordable destination dimming (opacity: 0.5)
- Cross-region confirmation dialog
- All props and events unchanged

## Files Modified

### src/App.vue
- **Lines 268-272:** Added standalone Travel floating panel wrapper
- **Lines 318-328:** Removed TravelPanel from Location panel body
- **Line 1502:** Added `travelPanel: { x: 600, y: 140 }` to usePanelManager defaults

### src/components/ActionBar.vue
- **Lines 66-73:** Added Travel button to ActionBar
- **Line 97:** Added `'travelPanel'` to PanelKey type union

## Verification

**Location Panel:**
- ✓ Shows location name, region info, time indicator (header)
- ✓ Shows combat panel when in combat
- ✓ Shows LocationGrid when not in combat
- ✓ No longer shows travel destinations

**Travel Panel:**
- ✓ Appears as independent floating panel
- ✓ Toggle via "Travel" button in ActionBar
- ✓ Displays all travel destinations with costs/cooldowns
- ✓ Cross-region confirmation dialog still works
- ✓ Can be closed with X, dragged by header, resized by handles

**ActionBar:**
- ✓ Travel button highlights when Travel panel is open
- ✓ Button positioned between Renown and Loot

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

**Created files:** None (component already existed)

**Modified files:**
```bash
FOUND: src/App.vue
FOUND: src/components/ActionBar.vue
```

**Commits:**
```bash
FOUND: 09f41ee
```

All claimed files and commits verified successfully.

## Impact

### User Experience
- Users can now independently control Travel panel visibility/position
- Location panel is less cluttered, focusing on location context + combat/enemies/resources
- Travel destinations accessible on-demand via ActionBar toggle

### Code Quality
- Clear separation of concerns: Location panel = context, Travel panel = navigation
- Consistent with existing panel architecture (Inventory, Stats, Crafting all toggleable)
- No breaking changes to travel functionality

## Notes

The existing `travel` panel key (the Location panel) remains always-open as before. The new `travelPanel` key is the extracted travel-only panel that toggles like other action bar panels. This dual-panel approach preserves the persistent location context (always visible) while making travel destinations optional (toggleable).
