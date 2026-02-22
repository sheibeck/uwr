---
phase: quick
plan: 284
subsystem: ui
tags: [hotbar, keyboard-shortcuts, vue, input-handling]

# Dependency graph
requires: []
provides:
  - "Global keydown listener in App.vue wired to onHotbarClick for number keys 1-9 and 0"
affects: [hotbar, ability-input]

# Tech tracking
tech-stack:
  added: []
  patterns: [document-level keyboard listener registered in onMounted and cleaned up in onBeforeUnmount]

key-files:
  created: []
  modified:
    - src/App.vue

key-decisions:
  - "Reused onHotbarClick directly so all cooldown, cast, and resource guards apply automatically"
  - "Used document-level keydown listener rather than component-level to ensure global capture"
  - "Skips event when INPUT, TEXTAREA, or contentEditable elements are focused to avoid conflicts with command bar"

patterns-established:
  - "Keyboard shortcut handlers: define function, add in onMounted, remove in onBeforeUnmount"

requirements-completed: [QUICK-284]

# Metrics
duration: 5min
completed: 2026-02-21
---

# Quick Task 284: Hotbar Keyboard Shortcuts Summary

**Document-level keydown listener mapping number keys 1-9 and 0 to hotbar slots via the existing onHotbarClick path**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `handleHotbarKeydown` function in App.vue that maps keys 1-9 to hotbar slots 1-9 and key 0 to slot 10
- Handler guards against INPUT/TEXTAREA/contentEditable focus so the command bar is unaffected
- Wired into `onMounted` (addEventListener) and `onBeforeUnmount` (removeEventListener) for proper lifecycle management
- All existing onHotbarClick guards (cooldown checks, casting state, resource requirements) apply automatically since the same function is called

## Task Commits

1. **Task 1: Add global hotbar keyboard shortcut listener to App.vue** - `0d45c84` (feat)

## Files Created/Modified
- `src/App.vue` - Added `handleHotbarKeydown`, registered in onMounted, removed in onBeforeUnmount

## Decisions Made
- Reused `onHotbarClick(slot)` directly rather than duplicating guard logic — this ensures any future changes to onHotbarClick guards (e.g. new resource types, combat restrictions) apply to keyboard shortcuts automatically.
- Placed the handler function immediately before `onMounted` for proximity to its registration site.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Keyboard shortcuts are live. No follow-up work required.

---
*Phase: quick-284*
*Completed: 2026-02-21*
