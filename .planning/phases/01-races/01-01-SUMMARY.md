---
phase: 01-races
plan: 01
subsystem: database
tags: [spacetimedb, typescript, races, character-creation]

# Dependency graph
requires: []
provides:
  - Race table in SpacetimeDB schema (public, with 4 unlocked starter races)
  - RACE_DATA seed data with Human, Eldrin, Ironclad, Wyldfang
  - ensureRaces upsert function wired into syncAllContent
  - create_character reducer accepts raceId:u64, validates race/class combo, applies racial stat bonuses
  - Generated TypeScript bindings with race_type.ts, race_table.ts, updated createCharacter reducer type
affects: [02-races-frontend, character-creation, class-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Race as data rows with unlocked:bool — enables World Event unlocks later"
    - "ensureRaces upsert pattern (same as ensureAbilityTemplates) — find-by-name, update or insert"
    - "Racial bonuses baked into baseStats before deriving maxHp/hitChance/etc — single stat object flows through"

key-files:
  created:
    - spacetimedb/src/data/races.ts
    - src/module_bindings/race_type.ts
    - src/module_bindings/race_table.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/characters.ts
    - src/composables/useCharacterCreation.ts
    - src/module_bindings/create_character_reducer.ts
    - src/module_bindings/create_character_type.ts
    - src/module_bindings/index.ts

key-decisions:
  - "Human availableClasses is '' (empty string) not 'all' — isClassAllowed returns true for empty string, false for 'all' since it would match as a class name"
  - "Racial bonuses baked into baseStats at creation (not a separate layer) — simpler model, bonuses automatically flow into all derived stats"
  - "Race stored as display name string on Character row, not raceId — character snapshot is self-contained"

patterns-established:
  - "Data seed pattern: RACE_DATA array in data/races.ts + ensureRaces(ctx) called from syncAllContent"
  - "Race class restriction: availableClasses is comma-separated class names, empty string means all classes allowed"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 1 Plan 1: Race Backend — SpacetimeDB Table, Seed Data, and Validated Character Creation

**Race table with 4 starter races seeded via syncAllContent; create_character reducer validates raceId, enforces class restrictions, and applies racial stat bonuses before deriving all character stats**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-12T01:38:57Z
- **Completed:** 2026-02-12T01:43:08Z
- **Tasks:** 3
- **Files modified:** 8 (2 new backend files, 3 new/modified generated bindings, 3 source files)

## Accomplishments
- Race table defined in SpacetimeDB with `public: true` so all clients can subscribe
- 4 starter races (Human, Eldrin, Ironclad, Wyldfang) with stat bonuses seeded via ensureRaces in syncAllContent
- create_character reducer now takes `raceId: u64` instead of `race: string`, validates race exists, is unlocked, and allows the selected class
- Racial stat bonuses are applied to `computeBaseStats` output before computing maxHp, hitChance, critMelee, and all other derived stats
- Module published to local SpacetimeDB, TypeScript bindings regenerated with `tables.race` accessor and updated `createCharacter` signature

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Race table and RACE_DATA seed file** - `c1f13fb` (feat)
2. **Task 2: Update create_character reducer to validate raceId and apply racial bonuses** - `cbcf8da` (feat)
3. **Task 3: Publish module and regenerate client bindings** - `00f7d7d` (feat)

## Files Created/Modified
- `spacetimedb/src/data/races.ts` - RACE_DATA array (4 races) and ensureRaces upsert function
- `spacetimedb/src/index.ts` - Added Race table, import, schema() entry, syncAllContent wiring, RACE_DATA in reducerDeps
- `spacetimedb/src/reducers/characters.ts` - Updated create_character: raceId param, race/class validation, racial stat bonuses
- `src/module_bindings/race_type.ts` - Generated Race row type
- `src/module_bindings/race_table.ts` - Generated race table accessor
- `src/module_bindings/create_character_reducer.ts` - Updated: raceId:bigint instead of race:string
- `src/module_bindings/create_character_type.ts` - Updated: raceId:bigint instead of race:string
- `src/module_bindings/index.ts` - Updated with Race table and new reducer type
- `src/composables/useCharacterCreation.ts` - Updated newCharacter state to use raceId:bigint (Rule 3 fix)

## Decisions Made
- Human's `availableClasses` is `''` (empty string) not `'all'` — `isClassAllowed` returns `true` for empty/null, so empty string correctly means "all classes allowed"
- Racial bonuses baked into `baseStats` at creation (not stored as a separate column/layer) — simpler model where racial bonuses flow into ALL derived stats automatically
- Character row stores `race: raceRow.name` (display string) not `race_id` — character snapshot is self-contained without needing a join

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed useCharacterCreation.ts to use raceId instead of race**
- **Found during:** Task 3 (Publish and regenerate bindings)
- **Issue:** After regenerating bindings, `useCharacterCreation.ts` was passing `race: string` to `createCharacter` but the reducer now requires `raceId: bigint`, causing a TypeScript error (`'race' does not exist in type`)
- **Fix:** Updated `newCharacter` state from `{ name, race, className }` to `{ name, raceId: 0n, className }`, updated `isCharacterFormValid` to check `raceId > 0n`, updated reducer call to pass `raceId`
- **Files modified:** `src/composables/useCharacterCreation.ts`
- **Verification:** `npx tsc --noEmit` no longer shows error TS2353 for useCharacterCreation.ts
- **Committed in:** `00f7d7d` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal fix required to unblock TypeScript compilation after reducer signature change. Plan 02 will build the full race selection UI on top of this foundation.

## Issues Encountered
- Local SpacetimeDB server was not running — started with `spacetime start` before publishing. Normal workflow step.

## User Setup Required
None - publishes to local SpacetimeDB. Server must be running (`spacetime start`) before publish.

## Next Phase Readiness
- Race table is live in SpacetimeDB with 4 starter races available
- Client bindings have `tables.race` for subscription and `createCharacter({ name, raceId, className })` for reducer calls
- Plan 02 (frontend) can now build race selection UI: subscribe to `tables.race`, display race list, let player pick, pass `raceId` to reducer
- `useCharacterCreation.ts` has placeholder `raceId: 0n` — Plan 02 will wire in actual race selection

---
*Phase: 01-races*
*Completed: 2026-02-12*

## Self-Check: PASSED

All files present and all commits verified:
- spacetimedb/src/data/races.ts: FOUND
- src/module_bindings/race_type.ts: FOUND
- src/module_bindings/race_table.ts: FOUND
- c1f13fb (Task 1): FOUND
- cbcf8da (Task 2): FOUND
- 00f7d7d (Task 3): FOUND
