---
phase: 51-ledger-screens-world-and-people
plan: 07
subsystem: ui
tags: [vue, map, subscriptions, keyed-bindings, session, hub, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-02 knownPlaces, adjacencyOf, travelTimer; 51-03 my_visited_locations view and regenerated bindings"
provides:
  - "mapQueries: typed subscription SQL for the Map hub"
  - "createSecondsTick: a 1 s server-clock tick that runs only while active"
  - "MapData interface, MAP_KEY and createInertMap"
  - "createMapData: session-owned map hub (visited, connections, party cooldowns, selected place people, quest givers, known places, timers, selection state)"
  - "Session.map and SessionDeps.map; provide(MAP_KEY) in App.vue"
affects: [51-08, 51-09, 51-10, 51-11]

tech-stack:
  added: []
  patterns:
    - "Hub template of the Phase 50 ledger reused: one effectScope, createKeyed bindings, keyedRows, reset and dispose"
    - "Tick activity decided by its own clock sample (shallowRef holder breaks the creation-order cycle); a sync watch on the cooldown rows refreshes the sample"

key-files:
  created:
    - src/map/queries.ts
    - src/map/queries.test.ts
    - src/map/secondsTick.ts
    - src/map/secondsTick.test.ts
    - src/map/mapContext.ts
    - src/map/mapData.ts
    - src/map/mapData.test.ts
  modified:
    - src/session/useSession.ts
    - src/session/useSession.test.ts
    - src/App.vue

key-decisions:
  - "known is typed KnownPlaces<Location> (not the bare id/regionId shape) so downstream components get full location rows from known.drawn"
  - "MapInput also carries regions (the plan's wiring list names it) even though the hub does not read it yet"
  - "Selection is not cleared on a character switch; only reset() (logout) clears it"

patterns-established:
  - "Every keyed binding passes a filter equal to its SQL (shared-cache rule); visited, selected-place bindings swap immediately"

requirements-completed: [LDG-04, LDG-05]

duration: 25min
completed: 2026-10-07
---

# Phase 51 Plan 07: Map data hub Summary

**Session-owned map hub: per-sender visited view, whole connection table, party travel cooldowns, selected place people and quest givers, with known places, adjacency, a 1 s timer tick and shared selection state.**

## Performance

- **Tasks:** 2 of 2
- **Files created:** 7, modified: 3

## Accomplishments
- `src/map/queries.ts`: `MapQueries`/`mapQueries()`; visited places only through the `my_visited_locations` view (no WHERE), never the private table.
- `src/map/secondsTick.ts`: `createSecondsTick({ clock, active })` returns `{ nowMicros, refresh }`; 1000 ms interval while active, cleared on scope dispose.
- `src/map/mapContext.ts`: `MapData`, `MAP_KEY` (Symbol 'uwr.map'), `createInertMap()`, types `KnownPlacesResult`, `MapView`.
- `src/map/mapData.ts`: `MapConn`, `MapInput`, `MapDeps`, `createMapData`. Visited keyed on the active character id with immediate swap and a characterId filter; connections key 'all' (null with no character); cooldowns keyed on the sorted, deduped id list of you plus party; npcsAt and charactersAt keyed on the selected place (immediate); giverNpcs keyed on the quest giver id list. `ready` needs visited, connections and cooldowns applied. `known` = knownPlaces over visited ids, the current place (0n ignored), the whole connection table and the session locations; `adjacency` = adjacencyOf(known.edges). The tick runs only while a cooldown row is ahead and stops itself; `selfTimer` and `timerFor(id)` are `travelTimer` over readyAtMicros and the tick's `nowMicros`.
- Session wiring: `SessionDeps.map`, `Session.map`, default builder, construction after the ledger (partyCharacterIds from game.groupMembers minus your own; questGiverIds from game.questTemplates npcId, deduped; clock = game.clock), `map.reset()` on logout, `map.dispose()` on dispose. `App.vue`: `provide(MAP_KEY, session.map ?? createInertMap())`.

## Task Commits

1. **Task 1: queries, seconds tick, hub with keyed bindings and selection state** - `494e964a`
2. **Task 2: session wiring and the App provide** - `ca062603`

## Deviations from Plan

None - plan executed as written. Note on TDD: tests and implementation were written in one pass and run together (GREEN first run), so no separate RED run was recorded.

## Verification
- `pnpm exec vitest run src/map src/session src/App.test.ts`: 23 files, 435 tests passing.
- `npx vue-tsc -b`: exit 0.
- Full `npx vitest run` from repo root: 302 files passed; only the 3 known baseline failures (call_log_report, proof_rules, measurement.results).
- Acceptance greps: createMapData( 1, map.reset() 1, map.dispose() 1, provide(MAP_KEY 1, 'immediate' 4.

## For later Phase 51 plans
- Inject with `inject(MAP_KEY, createInertMap)`; `ready` gates rendering. `known.drawn` are `Location` rows; pass `known.edges` to `layoutGraph` and `known.visited`/`known.heardOf` to `nodeViews`; `adjacency` feeds `stepsFrom`/`shortestPath`.
- `selfTimer` and `timerFor(characterId)` return `{ running, secondsLeft }`; `nowMicros` is the tick sample (stale while no timer runs; use game.clock.nowMicros() for one-off reads).
- `npcsAtSelected`, `charactersAtSelected` (raw, include you and offline players), `selectedApplied`, `giverNpcs` feed `buildDetail` (`giverNpcs` for quest cards).
- Selection state: `selectedId`, `shownRegionId`, `view`, `banner` with `select`, `showRegion`, `setView`, `setBanner`; `select(null)` drops the selected-place subscriptions.
- The rail travel panel can use the same hub for `selfTimer`/`cooldowns` (party cooldowns are subscribed here, not in the game hub).

## Known Stubs
None.

## Threat Flags
None. T-51-28 (visited rows only via the view, characterId filter after a switch) and T-51-30 (timers from readyAtMicros and server clock only; tick stops when idle) are covered by tests.

## Self-Check: PASSED
All 7 created files exist; commits 494e964a and ca062603 present.
