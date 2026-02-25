---
phase: quick-326
plan: 01
subsystem: ui, combat
tags: [boss-indicator, track-filter, gold-star]
dependency_graph:
  requires: [EnemyTemplate.isBoss field]
  provides: [visual boss indicator, track boss exclusion, server boss guard]
  affects: [LocationGrid, CombatPanel, App.vue, location.ts]
tech_stack:
  patterns: [conditional rendering, computed filter, server-side guard]
key_files:
  modified:
    - src/composables/useCombat.ts
    - src/components/LocationGrid.vue
    - src/components/CombatPanel.vue
    - src/App.vue
    - spacetimedb/src/helpers/location.ts
decisions:
  - "Used HTML entity &#9733; (filled star) for gold star rather than emoji for cross-platform consistency"
  - "Added isCasting to CombatPanel prop type as it was already missing (Rule 1 - Bug)"
metrics:
  duration: 228s
  completed: 2026-02-25
---

# Quick Task 326: Gold Star for Named Enemies and Exclude from Track

Gold star (&#9733;) indicator for boss/named enemies in all UI contexts, plus boss exclusion from Ranger Track with server-side defense-in-depth guard.

## Task Summary

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add gold star to named/boss enemies across UI | c7f31f8 | useCombat.ts, LocationGrid.vue, CombatPanel.vue |
| 2 | Exclude boss enemies from Ranger Track and add server guard | 7dc02ff | App.vue, location.ts |

## Changes Made

### Task 1: Gold Star Indicator
- Added `isBoss: boolean` field to `EnemySummary` type in `useCombat.ts`
- Populated `isBoss` from `template?.isBoss` in both `availableEnemies` and `combatEnemiesList` computed properties
- Added conditional gold star (`v-if="enemy.isBoss"`) before enemy names in LocationGrid spawn list
- Added unconditional gold star before names in the NAMED ENEMIES section (all are bosses by definition)
- Added conditional gold star before enemy names in CombatPanel combat roster
- Added `isBoss` to the `EnemySummary` type in LocationGrid.vue props

### Task 2: Track Exclusion
- Added `.filter((template) => !template.isBoss)` to `trackOptions` computed in App.vue, preventing boss templates from appearing in Ranger Track selection
- Added server-side guard `if (template.isBoss) throw new SenderError('Named enemies cannot be tracked')` in `spawnEnemyWithTemplate` as defense-in-depth

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing isCasting field in CombatPanel prop type**
- **Found during:** Task 1
- **Issue:** The `combatEnemies` prop type in CombatPanel.vue was missing the `isCasting` field that was being used in the template at line 73, causing a pre-existing TS error
- **Fix:** Added `isCasting: boolean` to the inline prop type definition
- **Files modified:** src/components/CombatPanel.vue
- **Commit:** c7f31f8

## Verification

- `npx vue-tsc --noEmit` passes with no new errors (pre-existing unrelated warnings only)
- Gold star character present in LocationGrid.vue and CombatPanel.vue
- `trackOptions` in App.vue includes `.filter((template) => !template.isBoss)`
- `spawnEnemyWithTemplate` in location.ts includes boss rejection guard

## Self-Check: PASSED

All 5 modified files verified on disk. Both commit hashes (c7f31f8, 7dc02ff) confirmed in git log.
