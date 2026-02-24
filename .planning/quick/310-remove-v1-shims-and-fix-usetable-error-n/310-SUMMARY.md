---
phase: quick-310
plan: 01
subsystem: client
tags: [vue, spacetimedb-v2, useTable, bindings]

# Dependency graph
requires:
  - phase: quick-307
    provides: "v2 client bindings generation and module_bindings"
provides:
  - "Working useGameData composable with correct v2 camelCase table keys"
  - "Accurate stdb-types.ts comment describing namespace disambiguation purpose"
affects: [client-composables, stdb-types]

# Tech tracking
tech-stack:
  added: []
  patterns: ["v2 bindings use camelCase table keys; views use snake_case"]

key-files:
  created: []
  modified:
    - "src/composables/useGameData.ts"
    - "src/stdb-types.ts"

key-decisions:
  - "Kept tables.my_bank_slots as-is since v2 views retain snake_case naming"

patterns-established:
  - "v2 table access: tables.camelCase for regular tables, tables.snake_case for views"

requirements-completed: [Q310-01, Q310-02]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Quick 310: Remove v1 Shims and Fix useTable Error Summary

**Converted 76 PascalCase table accesses to v2 camelCase keys in useGameData.ts, fixing runtime crash from undefined table references passed to useTable**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T18:48:33Z
- **Completed:** 2026-02-24T18:51:06Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All 76 PascalCase `tables.XxxYyy` references converted to camelCase `tables.xxxYyy` in useGameData.ts
- `tables.my_bank_slots` preserved as-is (views retain snake_case in v2 bindings)
- stdb-types.ts comment updated to accurately describe Row suffix aliases as namespace disambiguation, removing misleading v1 compatibility language

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix all PascalCase table accesses to camelCase** - `c5e3dfd` (fix)
2. **Task 2: Update stdb-types.ts comment to reflect disambiguation purpose** - `a8f51e8` (docs)

## Files Created/Modified
- `src/composables/useGameData.ts` - Converted all 76 PascalCase table accesses to v2 camelCase keys
- `src/stdb-types.ts` - Updated header comment from v1 compat language to namespace disambiguation description

## Decisions Made
- Kept `tables.my_bank_slots` unchanged since v2 views retain snake_case naming convention

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Client useGameData composable now correctly references all v2 table keys
- App should no longer crash on load from undefined table references
- Pre-existing type errors in App.vue and other components remain (unrelated to this task)

## Self-Check: PASSED

- FOUND: src/composables/useGameData.ts
- FOUND: src/stdb-types.ts
- FOUND: c5e3dfd (Task 1 commit)
- FOUND: a8f51e8 (Task 2 commit)

---
*Phase: quick-310*
*Completed: 2026-02-24*
