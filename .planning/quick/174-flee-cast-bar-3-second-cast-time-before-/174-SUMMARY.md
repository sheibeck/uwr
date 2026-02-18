---
phase: quick-174
plan: 01
subsystem: ui
tags: [vue, combat, cast-bar, flee]

# Dependency graph
requires:
  - phase: quick-123
    provides: flee_combat reducer with chance-based flee mechanic
provides:
  - 3-second client-side cast bar for Flee action in combat panel
  - Cancellable flee cast (click again to cancel)
  - Auto-cancel when combat ends
affects: [combat, CombatPanel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - localFlee ref + handleFlee wrapper pattern mirrors localGather pattern for client-side cast bars
    - isFleeCasting/fleeProgress computed properties drive cast bar UI from single timer ref

key-files:
  created: []
  modified:
    - src/App.vue
    - src/components/CombatPanel.vue

key-decisions:
  - "Flee cast bar uses amber gradient (rgba 255,180,60 to rgba 255,120,30) to distinguish from blue enemy cast bars"
  - "Clicking Flee during cast cancels it (same emit, handleFlee checks localFlee to toggle cancel)"
  - "Button stays enabled during flee cast so cancel is always accessible"
  - "Combat-end watcher auto-clears localFlee timer to prevent phantom reducers firing after combat"

patterns-established:
  - "Client-side cast bar pattern: localX ref + handleX wrapper + iXCasting/xProgress computed + combat-end watcher"

# Metrics
duration: ~2min
completed: 2026-02-18
---

# Quick Task 174: Flee Cast Bar Summary

**3-second amber cast bar added to Flee button in combat — reducer fires only after cast completes, combat-end auto-cancels**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-18T00:52:27Z
- **Completed:** 2026-02-18T00:54:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `localFlee` ref, `handleFlee()` wrapper, `isFleeCasting` and `fleeProgress` computed properties in App.vue
- Added watcher to auto-cancel flee cast timer when combat ends (prevents orphan reducer calls)
- CombatPanel shows amber cast bar filling left-to-right over 3 seconds with "Fleeing..." label
- Flee button text toggles between "Flee" and "Cancel" during cast; clicking cancel aborts the cast

## Task Commits

Each task was committed atomically:

1. **Task 1: Add localFlee ref, handleFlee wrapper, and watchers in App.vue** - `20918b3` (feat)
2. **Task 2: Show flee cast bar in CombatPanel with progress fill** - `35ba79b` (feat)

## Files Created/Modified
- `src/App.vue` - localFlee ref, isFleeCasting/fleeProgress computed, handleFlee wrapper, combat-end watcher, isFleeCasting/fleeProgress props passed to CombatPanel
- `src/components/CombatPanel.vue` - isFleeCasting/fleeProgress props added, button text conditional, amber cast bar block rendered below button

## Decisions Made
- Amber gradient distinguishes player flee bar from blue enemy cast bars visually
- Button left enabled during flee cast to preserve cancel UX (plan spec: do NOT disable during flee cast)
- handleFlee checks `localFlee.value` to toggle cancel vs start — same emit event ('flee') serves both purposes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Flee cast bar is fully functional; no follow-up needed
- Pattern established for any future client-side cast bars (gather, pull, flee all use same localX + handleX pattern)

## Self-Check: PASSED
- `src/App.vue` - FOUND
- `src/components/CombatPanel.vue` - FOUND
- Commit `20918b3` - FOUND (Task 1)
- Commit `35ba79b` - FOUND (Task 2)

---
*Phase: quick-174*
*Completed: 2026-02-18*
