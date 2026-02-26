---
phase: quick-329
plan: 01
subsystem: ui/panel-management
tags: [tab-persistence, panel-state, server-sync, localStorage]
dependency-graph:
  requires: []
  provides: [tab-persistence-all-panels]
  affects: [usePanelManager, WorldEventPanel, App.vue]
tech-stack:
  added: []
  patterns: [requestedTab-prop-pattern, tab-change-emit-pattern]
key-files:
  created: []
  modified:
    - src/composables/usePanelManager.ts
    - src/components/WorldEventPanel.vue
    - src/App.vue
decisions:
  - Followed existing RenownPanel pattern for WorldEventPanel tab persistence wiring
metrics:
  duration: 2m 16s
  completed: 2026-02-26T13:47:04Z
  tasks: 1/1
  files-modified: 3
---

# Quick Task 329: Persist Selected Tab State Across Logout Summary

Tab selections now persist across page refresh and logout/login for all four tabbed panels (CharacterInfoPanel, NpcDialogPanel/Journal, RenownPanel, WorldEventPanel) via both localStorage and server sync.

## Changes Made

### Task 1: Restore tab field in server sync and wire WorldEventPanel

**Commit:** `ca8dbe1`

**Fix 1 -- Server sync tab restoration (the core bug):**
The server sync watcher in `usePanelManager.ts` restored x, y, w, h, and open from server state but skipped `tab`. Added `if (typeof s.tab === 'string') panels[id].tab = s.tab;` after the open restoration line. localStorage already restored `tab` correctly via `Object.assign`, and the save path already included `tab`. Only the server restore path was missing it.

**Fix 2 -- WorldEventPanel tab persistence:**
WorldEventPanel was the only tabbed panel not wired to the tab persistence system. Added:
- `requestedTab` prop to the props interface
- `tab-change` emit declaration
- Initialize `activeTab` from `requestedTab` prop (matching RenownPanel pattern)
- Watcher to sync `requestedTab` changes from parent
- `setTab` helper function that updates local state and emits `tab-change`
- Updated all three tab buttons to use `setTab()` instead of direct assignment

**Fix 3 -- App.vue wiring:**
Added `:requested-tab="panels.worldEvents?.tab"` and `@tab-change="tab => setPanelTab('worldEvents', tab)"` to the WorldEventPanel element in App.vue.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npx vue-tsc --noEmit` shows no new errors (all errors are pre-existing)
- All four tabbed panels now persist their selected tab:
  - CharacterInfoPanel: already wired (pre-existing)
  - NpcDialogPanel/Journal: already wired (pre-existing)
  - RenownPanel: already wired (pre-existing)
  - WorldEventPanel: newly wired (this task)
- Server sync restore path now includes `tab` field for all panels

## Self-Check: PASSED
