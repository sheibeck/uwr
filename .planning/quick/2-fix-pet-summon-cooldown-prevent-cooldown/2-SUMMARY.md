---
phase: quick
plan: 2
subsystem: ui
tags: [hotbar, cooldown, pet-summons, client-prediction]

# Dependency graph
requires:
  - phase: 01-races
    provides: Ability system with cooldown prediction
provides:
  - Pet summon combat guard on client preventing false cooldown display
affects: [combat, abilities, pet-system]

# Tech tracking
tech-stack:
  added: []
  patterns: [Client-side combat gate matching server-side validation]

key-files:
  created: []
  modified: [src/composables/useHotbar.ts]

key-decisions:
  - "Block entire click (prediction + reducer call) for pet summons outside combat - cleaner than split approach"
  - "No client-side toast on block - server error message sufficient for edge cases"

patterns-established:
  - "Client-side guards mirror server-side validation sets for UX optimization"

# Metrics
duration: 2min
completed: 2026-02-12
---

# Quick Task 2: Fix Pet Summon Cooldown Summary

**Client-side combat guard prevents false 20-second cooldown on pet summon abilities when clicked outside combat**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T14:13:58Z
- **Completed:** 2026-02-12T14:15:48Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added PET_SUMMON_KEYS constant matching server-side petSummons set (4 abilities)
- Implemented client-side guard in onHotbarClick blocking prediction + reducer call when not in combat
- Eliminated misleading cooldown timer on abilities that server rejects for combat requirement

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pet summon combat guard to onHotbarClick** - `a524111` (fix)

## Files Created/Modified
- `src/composables/useHotbar.ts` - Added PET_SUMMON_KEYS constant and combat guard before runPrediction

## Decisions Made

**1. Block entire click vs split approach**
- Chose to return early before both `runPrediction` and `useAbility` reducer call
- Alternative was to allow reducer call (showing server error) but skip prediction
- Rationale: Cleaner UX, avoids unnecessary network round-trip, server error message comes through anyway if user bypasses client (dev tools, etc.)

**2. No client-side toast notification**
- Did not add client-side feedback toast when guard triggers
- Rationale: Server already sends private event "Pets can only be summoned in combat" if reducer is called; client guard is silent UX optimization

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward client-side guard implementation mirroring server-side validation set.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Quick task complete. Client-side UX improvement prevents confusing false cooldown while maintaining server as authoritative combat gate.

---
*Phase: quick*
*Completed: 2026-02-12*

## Self-Check: PASSED

**Files verified:**
- FOUND: src/composables/useHotbar.ts

**Commits verified:**
- FOUND: a524111
