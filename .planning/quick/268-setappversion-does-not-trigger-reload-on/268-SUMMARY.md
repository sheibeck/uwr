---
phase: quick-268
plan: "01"
subsystem: client
tags: [vue, watcher, reactivity, version-check]
dependency_graph:
  requires: []
  provides: [app-version-reload-on-row-update]
  affects: [src/App.vue]
tech_stack:
  added: []
  patterns: [deep-watch-reactive-array]
key_files:
  created: []
  modified:
    - src/App.vue
decisions:
  - "Used { deep: true } on the watch call to detect in-place mutations from SpacetimeDB's reactive array"
  - "Clear sessionStorage guard on version match so subsequent deploys in the same session can still trigger a reload"
metrics:
  duration: "5 minutes"
  completed: "2026-02-21T23:28:00Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 268: Fix setappversion not triggering reload on row update

**One-liner:** Added `{ deep: true }` to the `appVersionRows` watcher and clear the sessionStorage guard on version match so `/setappversion` reliably triggers client reloads.

## What Was Done

The `watch(appVersionRows, callback)` call in `src/App.vue` used a shallow watch on the reactive array returned by `useTable`. SpacetimeDB mutates this array in-place when an existing row is updated (not replaced), so the shallow watcher never fired after `/setappversion` was called. The fix adds `{ deep: true }` to force Vue to observe nested mutations.

A second bug was also fixed: when versions matched (client already up to date), the `sessionStorage._version_reload_attempted` guard was left in place. This would block a legitimate reload if the admin ran `/setappversion` again later in the same session. The fix clears the guard when a version match is detected.

## Changes

**`src/App.vue` (lines 696-714)**

- Added `{ deep: true }` as the third argument to the `watch(appVersionRows, ...)` call
- Added `sessionStorage.removeItem('_version_reload_attempted')` in the version-match branch

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/App.vue` contains `}, { deep: true });` at the end of the appVersionRows watcher
- [x] `sessionStorage.removeItem('_version_reload_attempted')` is present in the version-match branch
- [x] Commit `359f149` exists: `fix(quick-268): add deep:true to appVersionRows watcher`
- [x] Pre-existing TypeScript build errors are unrelated to this change (out of scope, deferred)

## Self-Check: PASSED
