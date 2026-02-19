---
phase: quick-200
plan: 01
subsystem: ui
tags: [header, version, display, build-info]
dependency_graph:
  requires: [window.__client_version set by main.ts from __BUILD_VERSION__]
  provides: [visible build version in AppHeader]
  affects: [src/components/AppHeader.vue]
tech_stack:
  added: []
  patterns: [computed ref reading window global, inline style binding]
key_files:
  modified:
    - src/components/AppHeader.vue
decisions:
  - "Read window.__client_version via computed ref rather than prop — matches main.ts pattern, no new prop chain needed"
metrics:
  duration: ~2min
  completed: 2026-02-18
---

# Phase quick-200 Plan 01: Add Version Number to AppHeader Summary

Build version number now renders as small muted text inline after the Connected/Disconnected status span in AppHeader, reading from `window.__client_version` set at boot by main.ts.

## What Was Built

Added a `clientVersion` computed ref to `AppHeader.vue` that reads `(window as any).__client_version ?? 'dev'`. A `<span>` with `fontSize: '0.7rem'`, `opacity: 0.45`, and `marginLeft: '6px'` renders `v{{ clientVersion }}` immediately after the status span inside the `.subtle` div.

In production builds the value is a millisecond timestamp (e.g. `v1771431442578`) set by `__BUILD_VERSION__` via Vite define. In local dev without the define it shows `vdev`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add version display to AppHeader | afe213d | src/components/AppHeader.vue |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/components/AppHeader.vue` exists and contains `clientVersion` computed ref
- [x] `src/components/AppHeader.vue` contains version span with `__client_version`
- [x] Commit afe213d exists
