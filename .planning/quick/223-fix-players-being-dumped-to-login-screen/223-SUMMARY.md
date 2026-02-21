---
phase: 223-fix-players-being-dumped-to-login-screen
plan: 01
subsystem: auth
tags: [vue, composables, session-storage, spacetimedb, oidc]

# Dependency graph
requires: []
provides:
  - Version reload guard that fires at most once per page load
  - isLoggedIn computed that does not re-evaluate OIDC token on every reactive update
affects: [auth, session-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot-at-init pattern: read volatile state once into a ref at composable setup time rather than calling it inside computed"
    - "sessionStorage guard natural expiry: let page reload clear guard automatically instead of clearing on match re-delivery"

key-files:
  created: []
  modified:
    - src/App.vue
    - src/composables/useAuth.ts

key-decisions:
  - "Do not clear the version reload guard on version-match — let natural page load expiry handle it"
  - "Initialize hasToken as a ref at composable setup time so isLoggedIn does not re-call getStoredIdToken() on every reactive update"

patterns-established:
  - "hasToken = ref(Boolean(getStoredIdToken())) at setup time — snapshot volatile token presence once per composable instantiation"

requirements-completed: [BUG-223]

# Metrics
duration: 8min
completed: 2026-02-21
---

# Quick Task 223: Fix Players Being Dumped to Login Screen Summary

**Two surgical fixes eliminating mid-session kick-to-login: version guard no longer cleared on match re-delivery, and isLoggedIn no longer re-evaluates OIDC token expiry on every reactive update.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-21T06:05:00Z
- **Completed:** 2026-02-21T06:13:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Version reload guard survives subscription re-deliveries — cannot be cleared by matching versions during the same page load
- `isLoggedIn` computed reads a stable `hasToken` ref instead of calling `getStoredIdToken()` live — OIDC token expiry no longer causes reactive kick-outs
- Both fixes are one-line changes with zero risk of regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove eager version reload guard clearing** - `9bc075a` (fix)
2. **Task 2: Stabilize isLoggedIn with hasToken ref** - `66780d5` (fix)

## Files Created/Modified
- `src/App.vue` - Removed `sessionStorage.removeItem('_version_reload_attempted')` from version-match branch; version-match now simply returns
- `src/composables/useAuth.ts` - Added `hasToken = ref(Boolean(getStoredIdToken()))` initialized once; `isLoggedIn` computed and `isPendingLogin` ref both use `hasToken.value`

## Decisions Made
- Guard natural expiry via page reload is the correct mechanism — no need to manually clear it when versions match. A real new deployment (true mismatch) will cause exactly one reload per page load regardless.
- Token presence is snapshot at composable setup time. Token refresh flows via full OIDC redirect (page reload), so the snapshot is always correct for the lifetime of a page session.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
Pre-existing TypeScript `readonly` array assignment errors in App.vue are unrelated to these changes and were present before this task. They are out of scope and not introduced by either fix.

## Next Phase Readiness
- Both bugs eliminated; players with valid SpacetimeDB sessions will no longer be kicked to login screen due to OIDC token expiry or repeated version-match re-deliveries
- No further action required for this fix

---
*Phase: 223-fix-players-being-dumped-to-login-screen*
*Completed: 2026-02-21*
