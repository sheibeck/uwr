---
phase: 162-log-panel-always-visible
plan: 01
subsystem: ui
tags: [vue, panel-manager, log-panel, ux]

# Dependency graph
requires: []
provides:
  - Log panel always visible in game view (no v-if gate on panels.log.open)
affects: [log-panel, ux]

# Tech tracking
tech-stack:
  added: []
  patterns: [always-on panels have no v-if open condition]

key-files:
  created: []
  modified:
    - src/App.vue

key-decisions:
  - "Remove v-if=\"panels.log.open\" from Log panel div — panel is always rendered when game view is active"
  - "Group, Hotbar, and Location panels were already always visible (no v-if conditions, no close buttons)"
  - "usePanelManager.ts already forces panels.log.open = true; the v-if was the only failure point"

# Metrics
duration: 5min
completed: 2026-02-18
---

# Quick Task 162: Log Panel Always Visible

**Removed `v-if="panels.log.open"` from the Log panel in App.vue — it now renders unconditionally within the game view.**

## Root Cause

The Log panel had `v-if="panels.log.open"` which hid it when `panels.log.open` was falsy. On new character creation, if no server layout existed and localStorage had a stale closed state before the forced-open guard in `usePanelManager.ts` ran, the panel could appear hidden.

## Fix

- `src/App.vue`: Removed `v-if="panels.log.open"` from the Log panel `<div>`. The panel now always renders within `<main v-else>` (game view), which only shows when a character is selected.

## What Was Already Fine

- Group panel: no `v-if`, always visible in game view
- Hotbar panel: `v-if="selectedCharacter"` — always true inside game view
- Location panel: no `v-if`, always visible in game view

## Files Modified
- `src/App.vue` — removed v-if condition from Log panel

---
*Phase: 162-log-panel-always-visible*
*Completed: 2026-02-18*
