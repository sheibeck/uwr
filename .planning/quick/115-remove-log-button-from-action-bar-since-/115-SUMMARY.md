---
quick_task: 115
title: Remove log button from action bar
status: complete
date_completed: 2026-02-16
commit: 54cfd3a
files_modified:
  - src/components/ActionBar.vue
  - src/App.vue
---

# Quick Task 115: Remove log button from action bar

## One-liner

Removed the Log button and all related dead code from ActionBar since the log panel was made permanently open in quick-78.

## What was done

Removed the Log toggle button from the action bar UI since the log window is permanently open and cannot be closed (established in quick-78). Cleaned up all dead code that existed solely to support that button.

## Changes

### `src/components/ActionBar.vue`
- Removed the `<button @click="emit('open', 'log')">Log</button>` element from the template
- Removed `'log'` from the `PanelKey` type union (no longer toggled from the action bar)
- Removed the `panel === 'log' ||` condition from `actionStyle`'s `isActive` computation — this was always-true dead code left over from when the log could be closed
- Removed `(e: 'open', panel: string): void` from `defineEmits` — the `open` event was only ever emitted by the log button

### `src/App.vue`
- Removed `@open="openPanel"` binding from the `<ActionBar>` usage — this listener is no longer needed since the `open` emit no longer exists in the component

## What was NOT changed

- The log panel itself (`LogWindow.vue`) — remains untouched and permanently visible
- The `panels.log` state in App.vue — still initializes with `open: true`
- The `openPanel` function in App.vue — still used by other callers (loot, vendor, etc.)

## Deviations from plan

None — executed exactly as specified.
