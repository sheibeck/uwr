---
phase: quick-369
plan: 01
subsystem: client-ui
tags: [bugfix, gathering, deduplication]
dependency_graph:
  requires: []
  provides: [clean-gathering-messages]
  affects: [src/App.vue]
tech_stack:
  added: []
  patterns: [server-authoritative-events]
key_files:
  modified: [src/App.vue]
decisions:
  - Server messages are authoritative for gathering events (include quantity and perk bonus)
metrics:
  duration: 1min
  completed: "2026-03-08T19:56:00Z"
---

# Quick 369: Fix Double Gathering Messages Summary

Removed 3 duplicate client-side addLocalEvent calls for gathering start/completion. Server logPrivateAndGroup messages are authoritative and include quantity and perk bonus text.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Remove duplicate client-side gathering events | 264eea2 | src/App.vue |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- grep for "begin gathering" and "You gathered" in App.vue returns zero matches
- Server items_gathering.ts logPrivateAndGroup calls remain intact (lines 122, 194)
- localGather state preserved (16 references) for progress bar functionality

## Self-Check: PASSED
