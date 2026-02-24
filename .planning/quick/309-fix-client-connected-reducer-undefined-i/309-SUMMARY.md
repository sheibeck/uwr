---
phase: quick-309
plan: 01
subsystem: schema
tags: [spacetimedb, v2-migration, schema-keys, ctx-db]

# Dependency graph
requires:
  - phase: quick-307
    provides: "v2 client migration with regenerated bindings"
provides:
  - "Correct camelCase ctx.db accessor resolution for all 80+ tables"
  - "Module publishes and runs without undefined accessor crash"
affects: [all-reducers, client-connected, init-reducer]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Explicit camelCase keys in schema() call to match ctx.db convention"]

key-files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts

key-decisions:
  - "Used explicit camelCase key mapping (player: Player) instead of shorthand (Player) to match all existing ctx.db.camelCase reducer usage"

patterns-established:
  - "schema() keys must be explicit camelCase: schema({ player: Player }) not schema({ Player })"

requirements-completed: [FIX-SCHEMA-KEYS]

# Metrics
duration: 1min
completed: 2026-02-24
---

# Quick 309: Fix client_connected Reducer Undefined Identity Crash Summary

**Explicit camelCase keys in schema() call fixing ctx.db accessor mismatch that caused "Cannot read properties of undefined (reading 'id')" at runtime**

## Performance

- **Duration:** 1 min 14 sec
- **Started:** 2026-02-24T16:50:19Z
- **Completed:** 2026-02-24T16:51:33Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced all 80+ shorthand PascalCase keys in schema() with explicit camelCase key mappings
- Module publishes and initializes without any errors
- All ctx.db.camelCase accessors (player, user, character, etc.) now resolve correctly at runtime

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace PascalCase schema keys with explicit camelCase keys** - `735d1da` (fix)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - Changed schema() call from shorthand `{ Player }` to explicit `{ player: Player }` for all 80+ tables

## Decisions Made
- Used explicit camelCase key mapping (player: Player) instead of shorthand (Player) to match all existing ctx.db.camelCase reducer usage throughout the codebase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema keys now correctly produce camelCase ctx.db accessors
- All reducers using ctx.db.player, ctx.db.user, etc. will work at runtime
- Client connections should no longer crash the module

## Self-Check: PASSED

- FOUND: spacetimedb/src/schema/tables.ts
- FOUND: commit 735d1da
- FOUND: 309-SUMMARY.md

---
*Phase: quick-309*
*Completed: 2026-02-24*
