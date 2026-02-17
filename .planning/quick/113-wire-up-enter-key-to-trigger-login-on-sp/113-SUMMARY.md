---
phase: quick-113
plan: 01
subsystem: ui
tags: [vue, keydown, accessibility, splash-screen]

# Dependency graph
requires: []
provides:
  - Enter key login trigger on splash screen with connActive guard
affects: [splash-screen, login-flow]

# Tech tracking
tech-stack:
  added: []
  patterns: [window keydown listener with onMounted/onUnmounted cleanup in Vue script setup]

key-files:
  created: []
  modified:
    - src/components/SplashScreen.vue

key-decisions:
  - "Window-level keydown listener instead of @keydown.enter on root div - splash div is not focusable by default"
  - "connActive guard matches button :disabled behavior exactly - Enter does nothing when connection is inactive"

patterns-established:
  - "Window keydown listeners registered in onMounted, cleaned up in onUnmounted to prevent memory leaks"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Quick 113: Wire Up Enter Key to Trigger Login on Splash Screen Summary

**Window-level keydown listener added to SplashScreen.vue that emits 'login' on Enter when connActive is true, with cleanup on unmount**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T00:00:00Z
- **Completed:** 2026-02-16T00:03:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `onMounted`/`onUnmounted` lifecycle hooks with `window.addEventListener('keydown', handleKeydown)` in SplashScreen.vue
- Handler emits `'login'` only when `e.key === 'Enter'` and `props.connActive === true`, matching button's `:disabled` guard
- Listener cleaned up on component unmount preventing memory leaks

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Enter key listener to SplashScreen.vue** - `815dac3` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified
- `src/components/SplashScreen.vue` - Added onMounted/onUnmounted with window keydown listener; assigned defineProps/defineEmits to const variables

## Decisions Made
- Window-level keydown listener chosen over `@keydown.enter` on the root div because the splash screen div is not focusable by default and the user may not have clicked into it
- connActive guard on Enter matches button's `:disabled` behavior exactly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Enter key login fully wired; existing button-click login path unchanged
- No blockers

---
*Phase: quick-113*
*Completed: 2026-02-16*

## Self-Check: PASSED
- FOUND: src/components/SplashScreen.vue
- FOUND commit: 815dac3
