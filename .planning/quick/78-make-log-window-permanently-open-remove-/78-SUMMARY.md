---
phase: quick-78
plan: 1
subsystem: ui-panels
tags: [ui, log-panel, permanent-ui, user-experience]
requires: []
provides: [always-visible-log-panel]
affects: [action-bar, panel-manager]
tech-stack:
  added: []
  patterns: [permanent-panel-pattern, open-only-button]
key-files:
  created: []
  modified:
    - src/App.vue
    - src/composables/usePanelManager.ts
    - src/components/ActionBar.vue
decisions:
  - Remove log panel close button to prevent accidental closure
  - Force log panel open in all state restore paths (localStorage and server sync)
  - Convert Log action bar button from toggle to open-only behavior
  - Always show Log button as active since panel is permanently open
metrics:
  duration: "~2min"
  completed_date: "2026-02-14T03:19:36Z"
---

# Phase quick-78 Plan 1: Make Log Window Permanently Open Summary

Log panel made permanently open by removing close button, forcing open state on all restore paths, and converting action bar toggle to open-only behavior.

## Overview

The Log window is central to game communication and should always be visible. This change prevents users from closing it by removing the close button from the panel header, ensuring the panel is forced open on both localStorage and server sync restore paths, and converting the action bar Log button from toggle to open-only (bring-to-front) behavior.

This matches the existing pattern used for other permanent panels like group, travel, and hotbar.

## Implementation Details

### Changes Made

**1. src/App.vue (line 52-55)**
- Removed close button from log panel header
- Panel now only shows "Log" title text without × button

**2. src/composables/usePanelManager.ts (lines 119-123, 397-402)**
- Added `if (panels.log) panels.log.open = true;` to `loadFromStorage()` function
- Added same enforcement to server sync watcher
- Log panel now forced open alongside group, travel, and hotbar panels

**3. src/components/ActionBar.vue**
- Changed Log button click handler from `emit('toggle', 'log')` to `emit('open', 'log')`
- Added `open` event to emit types
- Updated `actionStyle()` to always show Log button as active (`panel === 'log' || props.openPanels.has(panel)`)
- Added `@open` listener in App.vue to handle the new event

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification checks passed:

1. ✅ `closePanelById('log')` - zero results in App.vue (close button removed)
2. ✅ `toggle.*log` - zero results in ActionBar.vue (now uses 'open')
3. ✅ `panels.log` - found in both enforcement blocks in usePanelManager.ts

## User Impact

- Log panel cannot be accidentally closed
- Log panel persists across page refreshes
- Log panel persists across character switches
- Clicking "Log" button in action bar brings panel to front but never closes it
- Log button always appears in active state (visual consistency)

## Technical Notes

This change follows the established permanent-panel pattern used for group, travel, and hotbar panels. The same three-pronged enforcement approach ensures consistency:

1. No close button in panel header
2. Force open in localStorage restore path
3. Force open in server sync restore path

## Self-Check: PASSED

Files verified:
```
FOUND: src/App.vue
FOUND: src/composables/usePanelManager.ts
FOUND: src/components/ActionBar.vue
```

Commits verified:
```
FOUND: 298b1fa
```
