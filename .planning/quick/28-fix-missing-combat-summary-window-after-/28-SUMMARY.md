---
phase: quick-28
plan: 1
subsystem: ui
tags: [vue, combat, ui-fix]

# Dependency graph
requires:
  - phase: combat-system
    provides: useCombat composable, activeResult state, dismissResults function
provides:
  - Combat summary window remains visible until manually dismissed
  - Fixed bug where solo victory with no loot auto-dismissed immediately
affects: [combat-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [Manual user dismissal for combat results]

key-files:
  created: []
  modified: [src/App.vue]

key-decisions:
  - "Removed auto-dismiss watcher that immediately hid combat summary for solo victories with no loot"
  - "Combat summary now always requires manual dismissal via Dismiss button"

patterns-established:
  - "Combat results are always explicitly dismissed by player, never auto-dismissed"

# Metrics
duration: 82s
completed: 2026-02-12
---

# Quick Task 28: Fix Missing Combat Summary Window

**Removed auto-dismiss watcher that immediately hid solo victory combat results when no loot dropped**

## Performance

- **Duration:** 82 seconds (~1.4 min)
- **Started:** 2026-02-12T19:48:48Z
- **Completed:** 2026-02-12T19:50:10Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed auto-dismiss watcher that was hiding combat summary for solo victories with no loot
- Removed `lastAutoDismissCombatId` ref (only used by removed watcher)
- Removed `hasAnyLootForResult` from useCombat destructure (unused after watcher removal)
- Combat summary window now stays visible until player manually clicks Dismiss button

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove auto-dismiss watcher for combat results** - `7032a86` (fix)

## Files Created/Modified
- `src/App.vue` - Removed auto-dismiss watcher (lines 911-926), removed lastAutoDismissCombatId ref, removed hasAnyLootForResult from destructure

## Decisions Made
- Removed auto-dismiss behavior entirely for solo combat results - players should always see their Victory/Defeat summary and manually dismiss it
- Group combat behavior unchanged (leader still dismisses for the group)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The watcher removal was straightforward - identified the problematic code block and removed it along with its supporting variables.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Combat summary window behavior now matches expected UX: players always see their combat results (Victory/Defeat, fallen members, loot) and must manually dismiss them. The Dismiss button in CombatPanel works correctly for manual dismissal.

---
*Phase: quick-28*
*Completed: 2026-02-12*
