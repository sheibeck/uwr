---
phase: 22
plan: 01
subsystem: database
tags: [spacetimedb, schema, combat, movement, bard, stun, life-drain]

# Dependency graph
requires:
  - phase: 21
    provides: racial travel cost discount columns used by movement.ts
provides:
  - CombatEnemyEffect.ownerCharacterId column for life-drain DoT healing
  - ItemInstance.isTemporary column for Summoner Conjure Equipment
  - ActiveBardSong table for bard melody system
  - BardSongTick scheduled table (6s song ticks)
  - tick_bard_songs stub reducer
  - Stun effect recognized in combat enemy skip check
  - travel_discount CharacterEffect applied in move_character stamina calculation
affects: [Phase 22 ability plans, Bard abilities, Necromancer/Reaver abilities, Summoner abilities]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Scheduled table + stub reducer pattern for future ability mechanics (BardSongTick/tick_bard_songs)
    - ownerCharacterId on DoT effects enables life-drain heal-on-tick without separate table

key-files:
  created:
    - client/src/module_bindings/active_bard_song_table.ts
    - client/src/module_bindings/active_bard_song_type.ts
    - client/src/module_bindings/bard_song_tick_table.ts
    - client/src/module_bindings/bard_song_tick_type.ts
    - client/src/module_bindings/tick_bard_songs_reducer.ts
    - client/src/module_bindings/tick_bard_songs_type.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/movement.ts
    - spacetimedb/src/index.ts

key-decisions:
  - "tick_bard_songs stub reducer required at publish time because BardSongTick.scheduled references it — added to combat.ts with TODO for Phase 22 ability implementation"
  - "travel_discount applied in both stamina validation AND deduction loops in move_character to remain consistent"
  - "Life-drain heal capped at maxHp inline in the DoT tick, no separate healed-for event log (kept minimal)"

patterns-established:
  - "Stub reducers for scheduled tables: create the reducer skeleton immediately when the scheduled table is added so schema can publish"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-02-20
---

# Phase 22 Plan 01: Schema Changes and New Backend Systems Summary

**SpacetimeDB schema extended with life-drain DoT tracking, temporary item flag, bard song tables, stun/skip combat parity, and travel_discount stamina discount**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-20
- **Completed:** 2026-02-20
- **Tasks:** 4/4
- **Files modified:** 4 backend + 14 generated bindings

## Accomplishments

- Added `ownerCharacterId` (optional u64) to `CombatEnemyEffect` — enables life-drain DoTs to heal the casting character on each tick
- Added `isTemporary` (optional bool) to `ItemInstance` — marks Summoner Conjure Equipment items for cleanup on logout
- Added `ActiveBardSong` and `BardSongTick` tables for bard melody system (song per bard in combat, 6s tick scheduler)
- Extended combat loop skip check to also recognize `stun` effect type; added life-drain heal-on-tick logic using `ownerCharacterId`
- Extended `move_character` (both validate + deduct loops) to sum `travel_discount` CharacterEffects alongside racial discount
- Published module to local SpacetimeDB and regenerated all client TypeScript bindings successfully

## Task Commits

1. **Task 1: Extend CombatEnemyEffect and ItemInstance** - `939bde8` (feat)
2. **Task 2: Add ActiveBardSong and BardSongTick tables** - `291d918` (feat)
3. **Task 3: Stun in combat loop + travel_discount in movement** - `9ab6de3` (feat)
4. **Task 4: Publish module and regenerate bindings** - `fd52d62` (feat)

## Files Created/Modified

- `spacetimedb/src/schema/tables.ts` - Added ownerCharacterId, isTemporary, ActiveBardSong, BardSongTick
- `spacetimedb/src/reducers/combat.ts` - Stun in skip check, life-drain heal, tick_bard_songs stub reducer
- `spacetimedb/src/reducers/movement.ts` - travel_discount in both stamina calculation loops
- `spacetimedb/src/index.ts` - Import and dep wiring for ActiveBardSong, BardSongTick
- `client/src/module_bindings/` - Regenerated; 14 new files for bard tables + app_version, inactivity_tick

## Decisions Made

- Added `tick_bard_songs` stub reducer to `combat.ts` to satisfy SpacetimeDB's requirement that a scheduled table's `scheduled` field references an existing reducer. Full bard song logic deferred to Phase 22 ability plans.
- `travel_discount` calculation added to BOTH the validation loop and the deduction loop in `move_character` so the stamina check and actual deduction are consistent.
- Life-drain heal is capped at `maxHp` inline without a separate "healed" event log to keep the DoT tick concise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added tick_bard_songs stub reducer to enable module publish**
- **Found during:** Task 4 (Publish module and regenerate bindings)
- **Issue:** `spacetime publish` failed with "Schedule bard_song_tick_sched refers to a scheduled reducer or procedure tick_bard_songs that does not exist" — SpacetimeDB validates that the `scheduled` field on a table matches an existing reducer at publish time
- **Fix:** Added stub `tick_bard_songs` reducer to `combat.ts`, imported `ActiveBardSong`/`BardSongTick` in `index.ts`, added `BardSongTick` to `reducerDeps`
- **Files modified:** `spacetimedb/src/reducers/combat.ts`, `spacetimedb/src/index.ts`
- **Verification:** Republish succeeded: "Updated database with name: uwr"
- **Committed in:** `fd52d62` (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Required — scheduled tables cannot publish without their referenced reducer. The stub is minimal and correct.

## Issues Encountered

None beyond the blocking deviation above.

## Next Phase Readiness

- Schema foundation is complete for all Phase 22 ability mechanics
- `CombatEnemyEffect.ownerCharacterId` ready for Necromancer/Reaver life-drain ability implementations
- `ItemInstance.isTemporary` ready for Summoner Conjure Equipment ability implementation
- `ActiveBardSong`/`BardSongTick`/`tick_bard_songs` stub ready for Bard ability system implementation
- `stun` effect type recognized by combat loop (same as `skip` — enemy loses turn)
- `travel_discount` CharacterEffect wired into stamina cost calculation for Bard March of Wayfarers

---
*Phase: 22*
*Completed: 2026-02-20*
