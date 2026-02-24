---
phase: 23-v2-subscription-optimization
plan: 02
subsystem: ui
tags: [spacetimedb, event-tables, v2-sdk, onInsert, vue, shallowRef]

# Dependency graph
requires:
  - phase: 23-01
    provides: "Event tables converted to event:true with auto-deletion after broadcast"
provides:
  - "Client-side event consumption via onInsert callbacks instead of useTable"
  - "Event refs (worldEvents, locationEvents, privateEvents, groupEvents) populated by onInsert with 200-entry cap"
  - "Explicit subscriptions registered for 4 event tables on connection active"
affects: [subscription-optimization, event-log, client-performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Event tables consumed via onInsert callbacks + shallowRef arrays instead of useTable/iter"
    - "Explicit subscriptionBuilder().subscribe() for event tables excluded from subscribeToAllTables"
    - "watch(conn.isActive) pattern for registering callbacks after connection established"

key-files:
  created: []
  modified:
    - "src/composables/useGameData.ts"

key-decisions:
  - "shallowRef<any[]> used for event refs to avoid deep reactivity overhead on high-frequency inserts"
  - "200-entry cap (MAX_CLIENT_EVENTS) prevents unbounded memory growth from onInsert accumulation"
  - "useEvents.ts left unchanged — fully compatible with onInsert-driven refs (same row shape, same .value access pattern)"
  - "No changes needed to App.vue event filtering — client-side computed filters already handle scoping"

patterns-established:
  - "Event table pattern: shallowRef + onInsert callback + explicit subscription (not useTable)"
  - "watch(conn.isActive) for deferred callback registration on connection state"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 23 Plan 02: Client Event Handling Summary

**Event log consumption switched from useTable (always empty for event:true tables) to onInsert callback-driven shallowRef arrays with 200-entry cap**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T21:30:04Z
- **Completed:** 2026-02-24T21:33:00Z
- **Tasks:** 2 (1 code change + 1 verification-only)
- **Files modified:** 1

## Accomplishments
- Replaced 4 useTable calls for event tables with onInsert-driven shallowRef arrays in useGameData
- Added explicit subscriptions for event_world, event_location, event_private, event_group via subscriptionBuilder
- Verified useEvents composable and App.vue event filtering are fully compatible with new refs (no changes needed)
- Confirmed no references to removed views (my_private_events, my_location_events) remain in client code

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace useTable with onInsert for event tables in useGameData** - `6c02ee7` (feat)
2. **Task 2: Update useEvents composable and verify event log wiring** - no code changes needed (verification-only task confirmed full compatibility)

## Files Created/Modified
- `src/composables/useGameData.ts` - Replaced 4 useTable calls with shallowRef + onInsert callbacks, added explicit event table subscriptions via watch(conn.isActive)

## Decisions Made
- Used `shallowRef<any[]>` instead of deeply typed refs to avoid deep reactivity overhead on high-frequency event inserts while maintaining type compatibility with downstream consumers (useEvents accepts `Ref<EventWorld[]>` etc, and `any[]` satisfies that)
- Set MAX_CLIENT_EVENTS to 200 to prevent unbounded memory growth from onInsert accumulation (useEvents already trims to 80 in combinedEvents)
- Left useEvents.ts unchanged since it accesses the same row properties (id, createdAt, kind, message) that onInsert rows provide
- Left App.vue unchanged since client-side computed filters (userPrivateEvents, userLocationEvents, userGroupEvents) already handle event scoping correctly

## Deviations from Plan

None - plan executed exactly as written. Task 2 confirmed that useEvents.ts and App.vue required no modifications.

## Issues Encountered
- Pre-existing TypeScript errors (unused variables in useCommands/useHotbar/usePanelManager, missing .vue type declarations) unrelated to event table changes, did not block execution

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Event tables fully wired end-to-end: server event:true tables -> client onInsert callbacks -> useEvents composable -> App.vue event log display
- Phase 23 subscription optimization plan 02 complete; remaining optimization plans can proceed
- Real-time event log should display new events immediately as they are inserted server-side

## Self-Check: PASSED

All modified files verified. Task commit (6c02ee7) confirmed in git log. SUMMARY file created successfully.

---
*Phase: 23-v2-subscription-optimization*
*Completed: 2026-02-24*
