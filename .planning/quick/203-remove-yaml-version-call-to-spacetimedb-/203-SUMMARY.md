---
phase: quick-203
plan: 01
subsystem: infra
tags: [github-actions, spacetimedb, commands, admin]

# Dependency graph
requires:
  - phase: quick-198
    provides: set_app_version reducer and AppVersion SpacetimeDB table
provides:
  - Deployment workflow free of SPACETIMEDB_ADMIN_TOKEN dependency
  - In-game /setappversion admin command calling set_app_version reducer
affects: [ci, admin-tools, useCommands]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Admin-guarded commands check window.__my_identity.toHexString() === ADMIN_IDENTITY_HEX before calling reducer

key-files:
  created: []
  modified:
    - .github/workflows/static.yml
    - src/composables/useCommands.ts
    - src/components/CommandBar.vue

key-decisions:
  - "Version notification moved from automated CI curl call to explicit admin in-game command — removes SPACETIMEDB_ADMIN_TOKEN secret dependency from CI"
  - "Admin identity check uses window.__my_identity?.toHexString() === ADMIN_IDENTITY_HEX (same pattern as WorldEventPanel admin tab)"
  - "/setappversion reads window.__client_version ?? 'dev' — uses existing global already set in main.ts"

patterns-established:
  - "Admin commands: check ADMIN_IDENTITY_HEX, return early with Permission denied for non-admins, then call reducer"

requirements-completed: [QUICK-203]

# Metrics
duration: 5min
completed: 2026-02-18
---

# Phase quick-203: Remove YAML Version Call to SpacetimeDB Summary

**Removed SPACETIMEDB_ADMIN_TOKEN curl step from CI and replaced with in-game /setappversion admin command wired to existing set_app_version reducer**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-18
- **Completed:** 2026-02-18
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- GitHub Actions workflow no longer calls the SpacetimeDB set_app_version curl endpoint — SPACETIMEDB_ADMIN_TOKEN secret no longer needed
- BUILD_VERSION env var generation step removed from workflow
- New /setappversion command in useCommands.ts calls setAppVersion reducer as admin with current client version
- /setappversion autocomplete entry added to CommandBar.vue
- Non-admin users receive "Permission denied." in log panel

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove version notification steps from GitHub Actions workflow** - `1bc4f9a` (chore)
2. **Task 2: Add /setappversion admin command to useCommands and CommandBar** - `211a3f5` (feat)

## Files Created/Modified
- `.github/workflows/static.yml` - Removed Generate build version step, env block from Build step, and Notify SpacetimeDB step
- `src/composables/useCommands.ts` - Added ADMIN_IDENTITY_HEX import, setAppVersionReducer, /setappversion handler with admin guard
- `src/components/CommandBar.vue` - Added /setappversion autocomplete entry after /endevent

## Decisions Made
- Version notification moved from automated CI curl call to explicit admin in-game command — removes fragile SPACETIMEDB_ADMIN_TOKEN secret dependency from CI
- Admin identity check uses window.__my_identity?.toHexString() === ADMIN_IDENTITY_HEX, consistent with WorldEventPanel admin tab pattern (quick-191)
- /setappversion reads window.__client_version ?? 'dev' — reuses global already set in main.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin can now push the deployed version to SpacetimeDB by typing /setappversion in-game after each deployment
- CI workflow no longer requires SPACETIMEDB_ADMIN_TOKEN secret (can be removed from GitHub repository secrets)

---
*Phase: quick-203*
*Completed: 2026-02-18*
