---
phase: quick-339
plan: 01
subsystem: intent-handler
tags: [bind, command, narrative-console]
dependency_graph:
  requires: [bind_location reducer in characters.ts]
  provides: [bind text command in narrative console]
  affects: [player respawn location]
tech_stack:
  patterns: [intent handler command block, combat-check guard]
key_files:
  modified:
    - spacetimedb/src/reducers/intent.ts
decisions:
  - Mirrors bind_location reducer logic but adds combat check, already-bound check, and richer sardonic messaging
metrics:
  duration: 1min
  completed: "2026-03-07T23:31:00Z"
---

# Quick Task 339: Add Bind Command Summary

Bind command in narrative intent handler so players can type "bind" at bindstone locations to set their respawn point.

## What Was Done

### Task 1: Add bind command and update help text

- Added `[bind]` entry to help text between `camp` and `time`
- Added bind command handler block between camp/rest and explore handlers
- Handler checks: combat guard, location has bindstone, already-bound short-circuit
- Successful bind updates `boundLocationId` and shows sardonic confirmation message

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 005b5e7 | feat(339-01): add bind command to narrative intent handler |

## Self-Check: PASSED
