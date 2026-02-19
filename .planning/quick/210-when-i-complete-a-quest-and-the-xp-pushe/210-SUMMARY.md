---
phase: quick-210
plan: "01"
subsystem: quest-system
tags: [quest, xp, level-up, hailNpc, commands]
dependency_graph:
  requires: [quest-system, xp-system, combat-helpers]
  provides: [quest-xp-level-up]
  affects: [commands.ts, hailNpc, quest-completion]
tech_stack:
  added: []
  patterns: [awardCombatXp-via-deps, level-up-notification]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/commands.ts
decisions:
  - "Pass character.level as enemyLevel to awardCombatXp: diff=0 → 100% XP modifier, no scaling penalty"
  - "Both kill quest and delivery quest turn-ins now emit level-up system/location events when threshold crossed"
metrics:
  duration: ~5min
  completed: 2026-02-19
  tasks: 1
  files: 1
---

# Phase quick-210 Plan 01: Quest XP Level-Up Fix Summary

Quest completion now routes XP through `awardCombatXp`, triggering level-up when XP crosses a threshold.

## What Was Done

Fixed `hailNpc` in `spacetimedb/src/reducers/commands.ts` so both kill quest and delivery quest turn-ins use `awardCombatXp` instead of directly writing `character.xp`. The `awardCombatXp` function runs the while-loop level check, recomputes derived stats via `recomputeCharacterDerived`, and returns `{ xpGained, leveledUp, newLevel? }`. When `leveledUp` is true, a private system event ("You reached level N!") and a public location event ("{name} reached level N.") are emitted.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Replace raw XP updates in hailNpc with awardCombatXp calls | 3845054 | spacetimedb/src/reducers/commands.ts |

## Changes Made

**`spacetimedb/src/reducers/commands.ts`**
- Added `awardCombatXp` to the deps destructure at the top of `registerCommandReducers`
- Kill quest turn-in: replaced `character.xp + xpGained` + raw update with `awardCombatXp(ctx, character, character.level, quest.rewardXp)` + level-up event emissions
- Delivery quest turn-in: replaced `character.xp + qt.rewardXp` + raw update with `awardCombatXp(ctx, character, character.level, qt.rewardXp)` + level-up event emissions

## Verification

Module published with `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` — no TypeScript errors, no breaking schema changes.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/reducers/commands.ts` modified and committed at 3845054
- Module published cleanly: "Build finished successfully. Updated database with name: uwr"
