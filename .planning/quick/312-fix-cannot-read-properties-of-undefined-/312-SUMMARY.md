---
phase: quick-312
plan: 01
subsystem: client
tags: [spacetimedb, v2-bindings, module-bindings, vite]

# Dependency graph
requires:
  - phase: quick-311
    provides: v1 shim removal and bare v2 type imports
provides:
  - v2-compatible module bindings with camelCase tablesSchema keys
  - Clean package.json without stale v1 generate script
affects: [client-connection, spacetimedb-sdk]

# Tech tracking
tech-stack:
  added: []
  patterns: [camelCase tablesSchema keys for v2 SDK compatibility]

key-files:
  created: []
  modified:
    - src/module_bindings/index.ts
    - package.json

key-decisions:
  - "Committed working tree v2 bindings as-is rather than regenerating -- already correct from v2 CLI"

patterns-established:
  - "v2 tablesSchema keys are camelCase (e.g., abilityCooldown), not PascalCase"

requirements-completed: [FIX-312]

# Metrics
duration: 2min
completed: 2026-02-24
---

# Quick 312: Fix Cannot Read Properties of Undefined Summary

**Committed v2 module bindings with 98 camelCase tablesSchema keys, fixing sourceNameToTableDef lookup failure on client connect**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T19:31:49Z
- **Completed:** 2026-02-24T19:33:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All 98 tablesSchema keys converted from PascalCase to camelCase, matching v2 server data tags
- Removed stale v1 generate script from package.json
- Vite cache cleared and dev server verified starting cleanly with v2 bindings

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit v2 module bindings and clean package.json** - `54d78bc` (fix)
2. **Task 2: Clear Vite cache and verify dev server starts** - no file changes (verification only)

## Files Created/Modified
- `src/module_bindings/index.ts` - 98 tablesSchema keys changed from PascalCase to camelCase; My* view imports reordered alphabetically
- `package.json` - Removed stale v1 `generate` script

## Decisions Made
- Committed the existing working tree changes rather than regenerating, since `spacetime generate` with v2 CLI had already produced correct output

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Client should now connect to v2 SpacetimeDB server without the "Cannot read properties of undefined (reading 'columns')" error
- All table subscriptions should resolve successfully with matching camelCase keys

## Self-Check: PASSED

- FOUND: src/module_bindings/index.ts
- FOUND: package.json
- FOUND: 312-SUMMARY.md
- FOUND: commit 54d78bc

---
*Phase: quick-312*
*Completed: 2026-02-24*
