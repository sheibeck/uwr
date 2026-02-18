---
phase: quick-169
plan: "01"
subsystem: spawning
tags: [enemy-spawning, level-scaling, location, balance]
dependency_graph:
  requires: []
  provides: [exact-level-spawning-for-zero-offset-locations]
  affects: [spawnEnemy, ensureAvailableSpawn, starter-areas]
tech_stack:
  added: []
  patterns: [levelOffset-based-exact-match]
key_files:
  modified:
    - spacetimedb/src/helpers/location.ts
decisions:
  - "Zero-offset locations use exact match (minLevel===maxLevel===adjustedTarget) — no RNG variance for starter areas"
  - "ensureAvailableSpawn reuses location DB lookup with a new variable name (locationRow2) to avoid shadowing the loop variable"
metrics:
  duration: "~2min"
  completed: "2026-02-18"
  tasks: 2
  files: 1
---

# Phase quick-169 Plan 01: Zero-offset locations spawn enemies at exact target level Summary

Zero-offset locations (Lanternford, Ashfall Road, Bell Farm) now spawn enemies at exactly the computed target level with no +/- 1 variance, while non-zero levelOffset locations retain the existing variance window unchanged.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Narrow enemy level window to exact match when levelOffset is 0 | ea3e39e | spacetimedb/src/helpers/location.ts |
| 2 | Republish module | (no files changed) | — |

## What Was Done

### Task 1: location.ts — two surgical changes

**`spawnEnemy` (lines 346-350):** Added `levelOffset` read from the already-in-scope `locationRow`. When `offset === 0n`, `exactMatch = true` and both `minLevel` and `maxLevel` are set to `adjustedTarget`. When offset is non-zero, the original `+/- 1` window is preserved.

**`ensureAvailableSpawn` (lines 236-239):** Added a location lookup (`locationRow2`) after the loop. `maxDiff` is set to `0n` when `levelOffset === 0n` (exact match required) or `1n` otherwise. The existing `bestDiff <= maxDiff` guard now enforces the correct tolerance.

### Task 2: Module published successfully
`spacetime publish uwr --project-path spacetimedb` completed with no errors. Database updated at 2026-02-18T13:04:01Z.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `spacetimedb/src/helpers/location.ts` modified with correct changes
- [x] Commit `ea3e39e` exists: `feat(quick-169): narrow enemy level window to exact match when levelOffset is 0`
- [x] No new TypeScript errors introduced in location.ts (pre-existing RowBuilder type errors are unrelated)
- [x] Module published successfully, database updated
