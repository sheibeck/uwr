---
phase: quick-33
plan: 1
subsystem: combat, ui, loot
tags: [spacetimedb, vue, combat-results, loot-system, multiplayer]

# Dependency graph
requires:
  - phase: quick-29
    provides: "LootPanel and combat result event logging system"
provides:
  - "Per-character loot management without auto-dismiss race conditions"
  - "Server-side auto-cleanup for no-loot combat results"
  - "Independent group member loot claiming"
affects: [combat, loot, group-play]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Event-driven sound triggers from combinedEvents instead of ephemeral database rows"
    - "Per-character server-side cleanup scoped to individual loot ownership"

key-files:
  created: []
  modified:
    - src/App.vue
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts

key-decisions:
  - "Victory/defeat sounds trigger from combinedEvents (persistent log) not activeResult (ephemeral row)"
  - "Server auto-deletes CombatResult rows for no-loot victories and all defeats (already logged as events)"
  - "Each group member independently manages own loot; no leader-gating on dismiss_combat_results"
  - "take_loot cleanup scoped to character's own remaining loot, not global combat loot"

patterns-established:
  - "Client watchers should use persistent event log data (combinedEvents) not ephemeral result rows for UI feedback"
  - "Server-side cleanup operations should be scoped per-character using by_owner_user and by_character indexes"

# Metrics
duration: 3min
completed: 2026-02-12
---

# Quick Task 33: Remove Legacy Auto-Dismiss Loot System

**Per-character loot management with server-side auto-cleanup eliminates race condition that prevented loot from displaying in LootPanel**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T20:31:06Z
- **Completed:** 2026-02-12T20:34:20Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Fixed primary bug: loot items now appear in LootPanel after victory (no auto-dismiss race)
- Group members independently see and claim their own loot without leader permission
- Victory/defeat sounds moved to combinedEvents watcher (reliable event log) from activeResult (ephemeral row)
- Server auto-cleanup prevents lingering CombatResult rows for no-loot victories and defeats

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove client-side auto-dismiss and fix server-side per-character loot management** - `a8aec03` (fix)

## Files Created/Modified
- `src/App.vue` - Removed activeResult auto-dismiss watcher, moved victory/defeat sounds to combinedEvents, removed dismissResults destructure
- `spacetimedb/src/reducers/combat.ts` - dismiss_combat_results now per-character (no leader check), victory/defeat auto-delete CombatResult if no loot
- `spacetimedb/src/reducers/items.ts` - take_loot cleanup scoped to character's own loot only

## Decisions Made

**1. Victory/defeat sounds from combinedEvents not activeResult**
- Rationale: CombatResult rows may be ephemeral (inserted+deleted same transaction), but events persist in log. Sounds need reliable trigger.

**2. Server auto-deletes no-loot CombatResult rows immediately**
- Rationale: Victory/defeat messages already logged server-side as private/group events. CombatResult row was only for client watcher, but ephemeral rows unreliable. Log events are source of truth.

**3. Per-character dismiss and loot cleanup**
- Rationale: Group play requires each member to manage own loot independently. Leader-gating prevented this. Global cleanup in take_loot deleted other players' results prematurely.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all changes applied cleanly and published successfully.

## Self-Check: PASSED

**Files exist:**
- FOUND: src/App.vue
- FOUND: spacetimedb/src/reducers/combat.ts
- FOUND: spacetimedb/src/reducers/items.ts

**Commits exist:**
- FOUND: a8aec03

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Loot system now fully functional for solo and group play
- Each group member independently sees and claims own loot
- No race conditions blocking loot display
- Victory/defeat feedback (sounds, log messages) reliable via event log

---
*Phase: quick-33*
*Completed: 2026-02-12*
