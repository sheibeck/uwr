---
phase: 33-combat-improvements
plan: 05
subsystem: ui
tags: [vue, combat, narrative, clickNpcKeyword]

# Dependency graph
requires:
  - phase: 33-02
    provides: Mid-combat pull server logic via addEnemyToCombat
provides:
  - Mid-combat pull via enemy name click in narrative text during combat
affects: [33-combat-improvements, narrative-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [availableEnemies name-match checked after combatEnemiesList for pull routing during combat]

key-files:
  created: []
  modified:
    - src/App.vue

key-decisions:
  - "Combat enemy targeting takes priority over pull -- check combatEnemiesList first, then availableEnemies"

patterns-established:
  - "Pattern: In-combat narrative clicks first try to target existing combat enemies, then fall through to pull available enemies by name"

requirements-completed: [COMB-06]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 33 Plan 05: Mid-Combat Pull via Narrative Enemy Click Summary

**Clicking an enemy name in narrative text during combat now initiates a body pull if that enemy is not already in the fight, targeting it if it is.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-10T02:35:00Z
- **Completed:** 2026-03-10T02:39:27Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added available-enemy name check in `clickNpcKeyword` after the combatEnemiesList target match
- Clicking an enemy name already in combat still targets it (existing behavior preserved)
- Clicking an enemy name NOT in combat (available to pull) now calls `startPull(id, 'body')`
- Closes UAT gap 5: "Clicking on another enemy in the narrative just tries to target selected enemy instead of allowing me to pull it"

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mid-combat pull via enemy name click in clickNpcKeyword** - `a9d3a73` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/App.vue` - Added pullableSpawn check inside `if (isInCombat.value)` block after combatEnemiesList match

## Decisions Made
- Targeting in-fight enemies takes priority over pulling available enemies (combat enemy check comes first), since the most common intent when clicking a name already in your fight is targeting, not pulling another one

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Mid-combat pull via narrative click is complete and wired to server-side pull logic from 33-02
- No blockers for remaining phase 33 plans

---
*Phase: 33-combat-improvements*
*Completed: 2026-03-10*
