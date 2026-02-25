---
phase: quick-317
plan: 01
subsystem: client
tags: [spacetimedb, query-builder, subscriptions, toSql, vue]

# Dependency graph
requires:
  - phase: 23
    provides: "Domain composable subscription architecture (batched subscriptions, location-scoped WHERE queries)"
provides:
  - "Typed query builder subscriptions replacing all raw SQL strings in domain composables"
  - "Location-scoped WHERE subscriptions via tables.X.where(r => r.locationId.eq(locId)).toSql()"
affects: [subscription-optimization, domain-composables]

# Tech tracking
tech-stack:
  added: []
  patterns: ["toSql(tables.X) for type-safe subscription SQL generation", "tables.X.where(r => r.col.eq(val)) for typed WHERE clauses"]

key-files:
  created: []
  modified:
    - src/composables/data/useCoreData.ts
    - src/composables/data/useCombatData.ts
    - src/composables/data/useWorldData.ts
    - src/composables/data/useSocialData.ts
    - src/composables/data/useCraftingData.ts
    - src/composables/data/useQuestData.ts
    - src/composables/data/useWorldEventData.ts

key-decisions:
  - "Used toSql(tables.X) pattern over passing query objects directly to subscribe() for explicit SQL generation"
  - "Left useGameData.ts event table subscriptions as raw SQL strings per plan (onInsert pattern is separate)"

patterns-established:
  - "toSql(tables.X) for SELECT * subscription queries — compile-time table name safety"
  - "toSql(tables.X.where(r => r.col.eq(val))) for WHERE-filtered subscription queries — compile-time column name safety"

requirements-completed: [QUICK-317]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Quick 317: Replace SQL String Subscriptions with Typed Query Builder Summary

**All 7 domain composable subscription queries replaced with toSql(tables.X) for compile-time table/column name safety, including location-scoped WHERE clauses via query builder**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T02:09:41Z
- **Completed:** 2026-02-25T02:12:41Z
- **Tasks:** 1
- **Files modified:** 7

## Accomplishments
- Replaced 57 raw SQL subscription strings across 7 domain composables with typed query builder calls
- Location-scoped WHERE queries in useWorldData now use `toSql(tables.X.where(r => r.locationId.eq(locId)))` for column-level type safety
- Zero type errors introduced; all pre-existing errors in other files unchanged
- Event table subscriptions in useGameData.ts intentionally preserved as raw SQL (4 strings)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace SQL strings with query builder in all 7 domain composables** - `f0c4e0b` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/composables/data/useCoreData.ts` - 25 SELECT * queries replaced with toSql(tables.X)
- `src/composables/data/useCombatData.ts` - 13 SELECT * queries replaced with toSql(tables.X)
- `src/composables/data/useWorldData.ts` - 7 SELECT * queries + 6 WHERE queries replaced with query builder
- `src/composables/data/useSocialData.ts` - 9 SELECT * queries replaced with toSql(tables.X)
- `src/composables/data/useCraftingData.ts` - 3 SELECT * queries replaced with toSql(tables.X)
- `src/composables/data/useQuestData.ts` - 4 SELECT * queries replaced with toSql(tables.X)
- `src/composables/data/useWorldEventData.ts` - 5 SELECT * queries replaced with toSql(tables.X)

## Decisions Made
- Used `toSql(tables.X)` wrapper function pattern rather than `tables.X.toSql()` method call — both work identically (toSql just delegates to .toSql()), but the function form matches the SDK's internal pattern used in useTable and subscriptionBuilder
- Kept `import type { SubscriptionHandle }` in useWorldData.ts alongside the new `tables` import from the same module_bindings source

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All domain composable subscriptions are now type-safe via the query builder
- Ready for further subscription optimization (conditional activation/deactivation, event table conversion)

## Self-Check: PASSED

- All 7 modified files exist on disk
- Commit f0c4e0b verified in git log
- Zero raw SQL strings in src/composables/data/ (grep confirmed)
- 4 raw SQL strings preserved in src/composables/useGameData.ts (grep confirmed)
- Zero type errors in modified files (vue-tsc --noEmit confirmed)

---
*Phase: quick-317*
*Completed: 2026-02-25*
