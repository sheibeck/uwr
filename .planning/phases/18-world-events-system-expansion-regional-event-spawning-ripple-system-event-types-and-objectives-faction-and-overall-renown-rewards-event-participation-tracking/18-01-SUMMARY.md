---
phase: 18-world-events-system-expansion
plan: 01
subsystem: database
tags: [spacetimedb, world-events, tables, helpers, typescript]

# Dependency graph
requires: []
provides:
  - WorldEvent table with dual success/failure consequence types and two failure condition types (time/threshold_race)
  - EventContribution table for Bronze/Silver/Gold tier reward tracking per character
  - EventSpawnEnemy and EventSpawnItem tables for event-exclusive self-contained content
  - EventObjective table for protect_npc/explore/kill_count objectives
  - WorldStatTracker table for REQ-032 threshold-triggered world event firing
  - EventDespawnTick scheduled table for 2-minute post-resolve content linger
  - WORLD_EVENT_DEFINITIONS data constants with 2 event definitions (time-based and threshold_race)
  - world_events.ts helper module with 7 lifecycle functions (fireWorldEvent, spawnEventContent, resolveWorldEvent, applyConsequence, awardEventRewards, checkTimeBasedExpiry, incrementWorldStat)
affects:
  - 18-02 (reducers and hooks that call these helpers)
  - 18-03 (client UI that subscribes to WorldEvent table)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - WorldEventDeps injection pattern for helper functions (avoids circular imports, enables overriding in tests)
    - Consequence type switch pattern (race_unlock/faction_standing_bonus/enemy_composition_change/system_unlock/none)
    - REQ-034: consequenceTextStub written to WorldEvent.consequenceText at fire time (not at resolve time)
    - REQ-032: WorldStatTracker + incrementWorldStat for threshold-triggered events without reducer wiring
    - Zero-contribution guard: count === 0n contributors receive no rewards

key-files:
  created:
    - spacetimedb/src/data/world_event_data.ts
    - spacetimedb/src/helpers/world_events.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/schema/scheduled_tables.ts

key-decisions:
  - "WorldEvent table has both successConsequenceType AND failureConsequenceType (dual-consequence locked design from 18-CONTEXT.md)"
  - "EventDespawnTick is defined in tables.ts and re-exported from scheduled_tables.ts (follows existing pattern for scheduled tables)"
  - "WorldEventDeps type for dependency injection allows helpers to be called with or without overrides"
  - "consequenceText field on WorldEvent is written at fire time from eventDef.consequenceTextStub (REQ-034)"
  - "WorldStatTracker.statKey uses .unique() column modifier in addition to btree index for fast lookup"
  - "spawnEventContent creates EnemySpawn + EnemySpawnMember rows directly to integrate with existing combat spawn system"

patterns-established:
  - "WorldEvent lifecycle: fireWorldEvent → spawnEventContent → [active period] → resolveWorldEvent → applyConsequence + awardEventRewards → EventDespawnTick"
  - "Tier determination: count >= gold.threshold → gold, >= silver.threshold → silver, else bronze"
  - "One-time event guard: check by_status.filter('success') and by_status.filter('failed') for same eventKey"

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 18 Plan 01: World Event System Backend Foundation Summary

**7-table world event data layer with Bronze/Silver/Gold tiered rewards, dual success/failure consequences, threshold-triggered firing (REQ-032), and full lifecycle helpers including consequenceText written at fire time (REQ-034)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-17T18:48:46Z
- **Completed:** 2026-02-17T18:52:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Defined 7 new database tables: WorldEvent (with dual consequence types, dual failure conditions), EventContribution (tiered reward tracking), EventSpawnEnemy, EventSpawnItem, EventObjective, WorldStatTracker (REQ-032), EventDespawnTick (scheduled for 2-minute linger)
- Created world_event_data.ts with type definitions and 2 event definitions: ashen_awakening (time-based, race_unlock consequence) and hollowmere_siege (threshold_race, faction_standing_bonus consequence), both with consequenceTextStub
- Implemented world_events.ts with 7 exported lifecycle helpers: fireWorldEvent (one-time guard, REQ-034 consequenceText write), spawnEventContent (EnemySpawn integration), resolveWorldEvent (2-minute despawn schedule), applyConsequence (5-type switch), awardEventRewards (zero-contribution guard, tier determination), checkTimeBasedExpiry, incrementWorldStat (REQ-032 threshold crossing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define 7 new tables and create event data constants** - `1e5d1ff` (feat)
2. **Task 2: Create world event helper functions for full lifecycle** - `6b1ceed` (feat)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - Added WorldEvent, EventContribution, EventSpawnEnemy, EventSpawnItem, EventObjective, WorldStatTracker, EventDespawnTick table definitions + all in schema() export
- `spacetimedb/src/schema/scheduled_tables.ts` - Added EventDespawnTick to re-export list
- `spacetimedb/src/data/world_event_data.ts` - New file: RewardSpec, TierSpec, WorldEventDefinition types; ADMIN_IDENTITIES set; WORLD_EVENT_DEFINITIONS with 2 events
- `spacetimedb/src/helpers/world_events.ts` - New file: 7 exported lifecycle helper functions

## Decisions Made
- EventDespawnTick defined in tables.ts alongside other scheduled tables (not a separate file) — consistent with existing pattern where PullTick, CombatLoopTick etc. live in tables.ts and are re-exported from scheduled_tables.ts
- WorldEventDeps injection type for all helpers — avoids circular imports and enables future testing/overriding without refactoring
- spawnEventContent creates actual EnemySpawn + EnemySpawnMember rows so event enemies integrate naturally with the existing pull/combat system
- WorldStatTracker.statKey uses both `.unique()` column modifier AND btree index — unique for fast O(1) lookup via `.find()` in the future if needed, btree for the `.filter()` pattern used in incrementWorldStat

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in `combat.ts`, `corpse.ts`, `location.ts`, `auth.ts`, `characters.ts` were detected but are not related to Phase 18 work. No new errors were introduced by our changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tables and helpers complete — Plan 02 can wire reducers (`fire_world_event`, `resolve_world_event`, `increment_event_contribution`, `despawn_event_content`) and hook into combat kill loop and quest completion for `incrementWorldStat`
- ADMIN_IDENTITIES set in world_event_data.ts is empty — admin needs to populate with their identity hex strings before using admin-only fire_world_event reducer

---
*Phase: 18-world-events-system-expansion*
*Completed: 2026-02-17*
