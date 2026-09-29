---
phase: 18-world-events-system-expansion
plan: 02
subsystem: database
tags: [spacetimedb, world-events, reducers, combat-hooks, movement-hooks, typescript]

# Dependency graph
requires:
  - phase: 18-01
    provides: "WorldEvent, EventContribution, EventSpawnEnemy, EventSpawnItem, EventObjective, WorldStatTracker, EventDespawnTick tables, fireWorldEvent/resolveWorldEvent/incrementWorldStat helpers"
provides:
  - fire_world_event admin-only reducer with ADMIN_IDENTITIES guard
  - resolve_world_event admin-only reducer
  - collect_event_item player reducer incrementing EventContribution
  - increment_event_counter reducer for threshold_race auto-resolve
  - despawn_event_content scheduled reducer for event content cleanup
  - Combat kill loop hooks: event contribution tracking + REQ-032 incrementWorldStat
  - Quest completion hook: REQ-032 incrementWorldStat('total_quests_completed')
  - Movement hook: auto-register EventContribution (count=0) on region entry
  - Published module and regenerated client bindings with all 7 new tables
affects:
  - 18-03 (client UI that calls fire_world_event and subscribes to WorldEvent/EventContribution tables)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - spawnId pre-capture Map before spawn deletion block — avoids stale spawn references in post-deletion kill loop
    - incrementWorldStat called in kill loop per-template (not per-participant) — tracks global world stats, not per-character
    - EventContribution auto-created on region entry (count=0) — participation registered; rewards require count > 0
    - WorldStatTracker.statKey uses btree index only (not .unique()) to avoid 'name used for multiple entities' error

key-files:
  created:
    - spacetimedb/src/reducers/world_events.ts
  modified:
    - spacetimedb/src/reducers/index.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/movement.ts
    - spacetimedb/src/schema/tables.ts
    - src/module_bindings/ (all new table and reducer binding files)

key-decisions:
  - "WorldStatTracker.statKey .unique() removed — btree by_stat_key index alone is sufficient; using both caused 'name used for multiple entities' publish error"
  - "incrementWorldStat called once per template in kill loop (not per participant) — world stats are global counters, not per-character; calling once per character would over-count"
  - "EventContribution inserted with count=0 on region entry — region presence registered, zero-contribution guard in awardEventRewards still filters non-participants"
  - "despawn_event_content skips locked spawn deletion (lockedCombatId set) — lets in-progress combat resolve naturally before cleanup"
  - "collect_event_item creates EventContribution row if missing (count=1 insert) — handles edge case where player collects item before entering region normally"

patterns-established:
  - "Pre-capture map pattern: build Map<enemyId, spawnId> BEFORE deletion blocks when spawnId needed after deletion"
  - "World event reducer pattern: registerWorldEventReducers(deps) with deps.spacetimedb/t/SenderError destructured"

# Metrics
duration: ~20min
completed: 2026-02-17
---

# Phase 18 Plan 02: World Event Reducers and Hooks Summary

**5 world event reducers (fire/resolve/collect/counter/despawn), combat kill contribution tracking with pre-captured spawnId map, REQ-032 world stat increments on kills and quest completions, region entry auto-registration, module published and client bindings regenerated with all 7 new table types**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-02-17T18:56:21Z
- **Completed:** 2026-02-17T19:02:08Z
- **Tasks:** 2
- **Files modified:** 5 (+ 24 new binding files)

## Accomplishments
- Created `world_events.ts` reducer with 5 registered reducers: `fire_world_event` (admin-guarded via ADMIN_IDENTITIES), `resolve_world_event` (admin-guarded), `collect_event_item` (player-accessible), `increment_event_counter` (threshold_race auto-resolve), `despawn_event_content` (scheduled, safe deletion order)
- Hooked combat kill loop: pre-captured spawnId map before spawn deletion, EventSpawnEnemy lookup via `by_spawn`, EventContribution increment, kill_count objective increment, `incrementWorldStat('total_enemies_killed')` per template for REQ-032
- Hooked quest completion inside `updateQuestProgressForKill`: `incrementWorldStat('total_quests_completed')` fires on `isComplete` for REQ-032
- Hooked `move_character` `moveOne` function: EventContribution (count=0) auto-inserted for each active event in destination region
- Fixed `WorldStatTracker.statKey` index conflict (`.unique()` + btree both on same column → removed `.unique()`)
- Module published with `--clear-database`, client bindings regenerated with world_event, event_contribution, event_spawn_enemy, event_spawn_item, event_objective, world_stat_tracker, event_despawn_tick tables plus all 5 reducer bindings

## Task Commits

Each task was committed atomically:

1. **Task 1: Create world event reducers with admin guard and despawn** - `b7c706d` (feat)
2. **Task 2: Hook combat kills and movement for event participation, wire incrementWorldStat, publish module** - `7f4b5a1` (feat)

## Files Created/Modified
- `spacetimedb/src/reducers/world_events.ts` - New file: 5 world event reducers (fire, resolve, collect, counter increment, despawn)
- `spacetimedb/src/reducers/index.ts` - Added registerWorldEventReducers import and call
- `spacetimedb/src/reducers/combat.ts` - Added incrementWorldStat import, pre-capture spawnId map, event contribution tracking, REQ-032 world stat increments
- `spacetimedb/src/reducers/movement.ts` - Added auto-registration for active events on region entry
- `spacetimedb/src/schema/tables.ts` - Fixed WorldStatTracker.statKey: removed .unique() to resolve index naming conflict
- `src/module_bindings/` - 24 new binding files for tables and reducers

## Decisions Made
- Removed `.unique()` from `WorldStatTracker.statKey` because the btree `by_stat_key` index already provides the needed lookup capability, and having both caused a publish error: "name `world_stat_tracker_statKey_idx_btree` is used for multiple entities"
- `incrementWorldStat` called once per template in kill loop, not once per participant — world stats are global counters, not per-character, calling once per character in group would over-count kills
- `collect_event_item` handles missing EventContribution row gracefully: inserts count=1 if no row exists (covers edge case where player collects item before entering region via move_character)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `.unique()` from WorldStatTracker.statKey to fix publish error**
- **Found during:** Task 2 (publish module step)
- **Issue:** `WorldStatTracker.statKey` had both `.unique()` column modifier and explicit `by_stat_key` btree index, both generating an index named `world_stat_tracker_statKey_idx_btree`. SpacetimeDB rejected with "name is used for multiple entities" error.
- **Fix:** Removed `.unique()` from `statKey` column definition. The btree index alone is sufficient — `by_stat_key.filter()` is the access pattern used in `incrementWorldStat`, and seeding ensures uniqueness at the application level.
- **Files modified:** `spacetimedb/src/schema/tables.ts`
- **Verification:** Module published successfully after fix
- **Committed in:** `7f4b5a1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required fix — module would not publish without it. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `helpers/combat.ts`, `reducers/combat.ts`, `reducers/auth.ts`, `reducers/movement.ts` were present before this plan and are not related to Phase 18 work. No new errors introduced by our changes.

## User Setup Required
None - no external service configuration required. Note: `ADMIN_IDENTITIES` set in `world_event_data.ts` is empty — admin needs to populate with their identity hex strings before using admin-only `fire_world_event` and `resolve_world_event` reducers.

## Next Phase Readiness
- All backend world event reducers functional — events can be fired (admin), participated in (auto on region entry), contributed to (combat kills + item collection), counter-incremented (threshold race), and resolved with tiered rewards
- REQ-032 threshold-triggered events wired via `incrementWorldStat` in combat kills and quest completions
- Despawn scheduled for 2-minute linger after resolve
- Ready for Plan 03 client UI: WorldEventPanel with active/history sections, event banner overlay, action bar button with badge

## Self-Check: PASSED

- spacetimedb/src/reducers/world_events.ts — FOUND
- src/module_bindings/fire_world_event_reducer.ts — FOUND
- src/module_bindings/world_event_table.ts — FOUND
- src/module_bindings/event_contribution_table.ts — FOUND
- src/module_bindings/world_stat_tracker_table.ts — FOUND
- commit b7c706d (Task 1) — FOUND
- commit 7f4b5a1 (Task 2) — FOUND

---
*Phase: 18-world-events-system-expansion*
*Completed: 2026-02-17*
