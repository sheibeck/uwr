---
phase: quick-315
plan: 01
subsystem: client
tags: [spacetimedb, vue, subscriptions, websocket, composables, performance]

# Dependency graph
requires:
  - phase: 23-v2-subscription-optimization
    provides: "Event tables converted to event:true with onInsert pattern (Plans 01-02)"
provides:
  - "7 domain data composables with batched subscriptionBuilder().subscribe() calls"
  - "Thin useGameData facade preserving App.vue API contract"
  - "76 individual Subscribe messages reduced to ~8 batched messages"
affects: [23-v2-subscription-optimization, future-conditional-subscriptions]

# Tech tracking
tech-stack:
  added: []
  patterns: [domain-scoped subscription composables, batched subscriptionBuilder pattern, shallowRef + onInsert/onUpdate/onDelete reactivity]

key-files:
  created:
    - src/composables/data/useCoreData.ts
    - src/composables/data/useCombatData.ts
    - src/composables/data/useWorldData.ts
    - src/composables/data/useSocialData.ts
    - src/composables/data/useCraftingData.ts
    - src/composables/data/useQuestData.ts
    - src/composables/data/useWorldEventData.ts
  modified:
    - src/composables/useGameData.ts

key-decisions:
  - "Used ReturnType<typeof useSpacetimeDB> instead of ConnectionState import since ConnectionState is not re-exported from spacetimedb/vue public API"
  - "Used shallowRef for all table data arrays (consistent with v2 useTable behavior) and regular ref for aggroEntries (private/non-subscribable table)"
  - "Kept event table onInsert handling in useGameData facade (not moved to domain composable) per Phase 23 Plan 02 design"

patterns-established:
  - "Domain subscription pattern: each composable accepts conn, creates shallowRefs, uses watch(conn.isActive) to batch-subscribe and register onInsert/onUpdate/onDelete callbacks"
  - "rebind helper pattern: inline function to DRY table-to-ref reactive binding (table, ref, iter) => onInsert/onUpdate/onDelete"

requirements-completed: [QUICK-315]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Quick 315: Replace subscribeToAllTables with Scoped Domain Subscriptions Summary

**76 individual useTable() WebSocket subscriptions replaced by ~8 batched subscriptionBuilder().subscribe() calls across 7 domain composables, with useGameData preserved as thin facade**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T01:31:48Z
- **Completed:** 2026-02-25T01:36:39Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created 7 domain data composables (core 25 tables, combat 13, world 13, social 9, crafting 3, quest 4, world-event 5) each batching subscriptions into a single subscriptionBuilder().subscribe() call
- Refactored useGameData.ts from 209 lines with 76 useTable() calls into a 76-line thin facade that delegates to domain composables
- Preserved exact return shape — App.vue destructuring unchanged, zero consumer modifications needed
- Event table onInsert pattern from Phase 23 Plan 02 preserved intact in the facade

## Task Commits

Each task was committed atomically:

1. **Task 1: Create domain data composables with batched subscriptions** - `5e3613c` (feat)
2. **Task 2: Refactor useGameData into thin facade over domain composables** - `a8463b3` (refactor)

## Files Created/Modified
- `src/composables/data/useCoreData.ts` - 25 always-on tables (player, character, race, location, item, renown, etc.)
- `src/composables/data/useCombatData.ts` - 13 combat tables + aggroEntries placeholder ref
- `src/composables/data/useWorldData.ts` - 13 world/location tables (enemies, NPCs, corpses, resources)
- `src/composables/data/useSocialData.ts` - 9 social tables (friends, groups, trade, NPC affinity)
- `src/composables/data/useCraftingData.ts` - 3 crafting tables (recipes, pending spell casts)
- `src/composables/data/useQuestData.ts` - 4 quest tables (templates, instances, items, dialogs)
- `src/composables/data/useWorldEventData.ts` - 5 world event tables with loading state refs
- `src/composables/useGameData.ts` - Thin facade importing and spreading all domain composables

## Decisions Made
- Used `ReturnType<typeof useSpacetimeDB>` for ConnectionState typing since the `ConnectionState` interface is not part of the `spacetimedb/vue` public export surface
- Kept `aggroEntries` as `ref([] as any[])` (not shallowRef) since aggro_entry is private/non-subscribable and uses a different reactivity pattern
- Maintained `worldEventRowsLoading` and `eventContributionsLoading` as `shallowRef<boolean>(true)` set to false in onApplied, matching the loading state behavior of the old useTable second return value

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ConnectionState type not exported from spacetimedb/vue**
- **Found during:** Task 1 (creating domain composables)
- **Issue:** Plan specified `import type { ConnectionState } from 'spacetimedb/vue'` but ConnectionState is not in the public exports of the vue subpackage
- **Fix:** Used `ReturnType<typeof useSpacetimeDB>` as a local type alias instead
- **Files modified:** All 7 domain composables
- **Verification:** TypeScript compiles without errors
- **Committed in:** 5e3613c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor type import adjustment. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Domain composables are now in place for future conditional subscription activation (subscribe/unsubscribe based on UI state)
- Pattern established for adding new tables: add to the appropriate domain composable's subscribe array, refresh function, and rebind calls
- Ready to continue Phase 23 optimization if desired (WHERE-clause filtering, conditional activation)

## Self-Check: PASSED

All 8 files verified present. Both task commits (5e3613c, a8463b3) verified in git log.

---
*Phase: quick-315*
*Completed: 2026-02-25*
