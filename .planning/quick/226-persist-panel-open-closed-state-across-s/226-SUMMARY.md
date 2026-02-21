---
phase: quick-226
plan: "01"
subsystem: ui/panel-manager
tags: [bug-fix, localStorage, race-condition, panel-state]
dependency_graph:
  requires: []
  provides: [panel-open-state-persistence]
  affects: [usePanelManager]
tech_stack:
  added: []
  patterns: [dirty-window-guard, localStorage-authority]
key_files:
  created: []
  modified:
    - src/composables/usePanelManager.ts
decisions:
  - "Call markDirty() after loadFromStorage() when localStorage has panel data, giving local state 3s authority over server sync"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-21"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase quick-226 Plan 01: Persist Panel Open/Closed State Summary

**One-liner:** Guard localStorage-restored panel open state from server sync overwrite using existing dirty window mechanism.

## What Was Built

After `loadFromStorage()` restores panel open/closed state from localStorage, a guard checks whether `uwr.panelStates` exists in localStorage. If it does, `markDirty()` is called to set `dirtyUntil.value = Date.now() + 3000`, blocking the server sync watcher for 3 seconds.

## Why This Fixes the Race Condition

The server sync watcher fires reactively when `selectedCharacterId` changes (character select screen). This can overwrite freshly-restored localStorage state with stale server data if the user camped out before the 2-second server save debounce completed. The 3-second dirty window (which already existed for user interactions) now also covers the login initialization path.

Fresh devices with no `uwr.panelStates` key skip the guard and receive server sync immediately — no regression.

## Files Modified

- `src/composables/usePanelManager.ts` — lines 504-509: added guard block after `loadFromStorage()`

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| d9fe57f | fix(quick-226): guard localStorage panel state from server sync overwrite |

## Self-Check: PASSED

- File modified: `src/composables/usePanelManager.ts` — confirmed contains `markDirty()` guard after `loadFromStorage()`
- Commit d9fe57f exists
- Pre-existing TypeScript errors in other files are unrelated to this change; no new errors introduced
