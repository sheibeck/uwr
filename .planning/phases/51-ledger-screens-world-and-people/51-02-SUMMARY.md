---
phase: 51-ledger-screens-world-and-people
plan: 02
subsystem: ui
tags: [vue, map, pure-helpers, design-guards, svg-folder, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-01 visited_location rows (consumed by later plans; nothing here imports them yet)"
provides:
  - "Inline svg guard that allows exactly src/map/, and the 1200px tier allowed in src/map/"
  - "src/map pure helpers: order, danger, terrain, travelTimer, knownPlaces, route, regionChips"
  - "src/map/mapGuards.test.ts scanning every production file under src/map/"
affects: [51-04, 51-05, 51-07, 51-08, 51-09, 51-10, 51-11]

tech-stack:
  added: []
  patterns:
    - "Map helpers take plain lists and return plain values (no Vue, no subscriptions)"
    - "Timer = server ready time minus game.clock.nowMicros(); no reduction math on the client"

key-files:
  created:
    - src/map/order.ts
    - src/map/danger.ts
    - src/map/danger.test.ts
    - src/map/terrain.ts
    - src/map/terrain.test.ts
    - src/map/travelTimer.ts
    - src/map/travelTimer.test.ts
    - src/map/knownPlaces.ts
    - src/map/knownPlaces.test.ts
    - src/map/route.ts
    - src/map/route.test.ts
    - src/map/regionChips.ts
    - src/map/regionChips.test.ts
    - src/map/mapGuards.test.ts
  modified:
    - src/styles/designContract.test.ts
    - src/frame/frameContract.test.ts

key-decisions:
  - "svg allowance is the prefix 'src/map/' (trailing slash), so a sibling such as src/mapping/ is still flagged"
  - "mapGuards bans the cooldown-length constant by name (COOLDOWN_MICROS) and Date.now, but does not ban importing travel_config, so the shared stamina helpers stay importable"
  - "routeNote reads '1 stop' for a single step ('{n} stops' otherwise); the UI-SPEC wording is the plural only"
  - "regionChips accepts an optional playerLevel and returns band (dangerBand of the range top) so the gate and chip colors share one rule; band is null without a level or a range"

patterns-established:
  - "Danger rule: placeDanger checks terrainType 'uncharted' before isSafe"
  - "Edges are revealed only when their source is a visited place"

requirements-completed: [LDG-04]

duration: 25min
completed: 2026-10-07
---

# Phase 51 Plan 02: Map foundation helpers Summary

**The inline-svg guard now admits exactly src/map/, and the Map's danger bands, terrain legend, travel timer, known places, BFS routes and region chips exist as tested pure helpers.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 2 of 2
- **Files:** 14 created, 2 modified

## Accomplishments
- Guards: the svg case is now a pure filter (`src/rails/X.vue` flagged, `src/map/GraphPlane.vue` allowed, `src/mapping/X.vue` flagged); the 1200px tier allow-list adds `map`.
- `danger.ts`: `dangerBand`, `BAND_WORD`, `BAND_COLOR`, `placeDanger` (reuses `routeLevel`, uncharted before safe).
- `terrain.ts`: legend of eight terrains in UI-SPEC order, `passage`, own-key lookup (T-51-08), PhMapPin fallback.
- `travelTimer.ts`: largest `readyAtMicros` minus the server clock, stale rows read Ready; `formatClock`, `aboutMinutes`.
- `knownPlaces.ts`, `route.ts`, `regionChips.ts` per the plan interfaces.

## Task Commits

1. **Task 1: guards, danger, terrain, timer** - `de583481`
2. **Task 2: known places, routes, region chips** - `645a6714`

## TDD record

- Task 1 RED (tests written, no implementation): `pnpm exec vitest run src/map src/styles/designContract.test.ts src/frame/frameContract.test.ts` gave 4 failed files (danger, terrain, travelTimer unresolved imports; the fourth was the guard test 'finds the map helpers', 1 failed test, 54 passed). GREEN: 6 files, 87 tests passed. RED and GREEN went into one task commit.
- Task 2: the test files were written before the implementation files, but a separate RED run was not recorded (the three modules did not exist, so they could not have loaded). GREEN: 7 files, 78 tests passed in `src/map`.

## Verification

- `pnpm exec vitest run src/map src/styles/designContract.test.ts src/frame/frameContract.test.ts`: green.
- `pnpm exec vue-tsc -b`: exit 0.
- Full `pnpm exec vitest run` from the repo root: 291 files passed, 3 failed, all three the known baselines (scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts); 9111 tests passed, 2 failed (measurement.results).
- No publish, no binding regeneration, no dependency change.

## Deviations from Plan

### Auto-fixed Issues

None required.

### Judgment calls (not bugs)

1. **'1 stop' singular.** The plan and UI-SPEC give '{n} stops'. `routeNote` prints '1 stop' for a single step and '{n} stops' otherwise (same reasoning as the plan's own singular 'about 1 minute'). Owner can revert in one line in `src/map/route.ts`.
2. **Extra `band` on RegionChip and optional `playerLevel` input.** Required to satisfy the key link (regionChips uses `dangerBand`). It is not a lock or level gate.
3. **mapGuards scope.** It does not forbid importing `@game-data/travel_config`; it forbids the cooldown length by name (`COOLDOWN_MICROS`) and `Date.now`, which is what the prohibition requires. 51-01's stamina helpers live in that same file and later plans may need them.
4. **knownPlaces keeps unknown visited ids in `visited`.** A visited id with no location row stays in the `visited` set (its connections still count) but is never drawn.
5. **Region name fallback.** A drawn place whose region row is missing gets the chip name 'Unknown region'; routeNote falls back to 'this region'.

## Known Stubs

None.

## Threat Flags

None. T-51-08 (own-key terrain lookup), T-51-09 (svg prefix with sibling fixture), T-51-10 (timer reads only the server row; guard bans the constant and Date.now) are mitigated and tested.

## Notes for later Phase 51 plans

- Import paths: `src/map/order` (`compareBigint`, `compareNames`), `src/map/danger` (`Band`, `dangerBand`, `BAND_WORD`, `BAND_COLOR`, `PlaceDanger`, `placeDanger(place, regions, playerLevel)`), `src/map/terrain` (`TerrainInfo`, `TERRAIN_LEGEND`, `terrainOf`), `src/map/travelTimer` (`travelTimer(rows, game.clock.nowMicros())`, `formatClock`, `aboutMinutes`), `src/map/knownPlaces` (`knownPlaces`, generic over rows with `id` and `regionId`), `src/map/route` (`adjacencyOf`, `shortestPath`, `stepsFrom`, `routeNote`), `src/map/regionChips` (`regionLevelRange`, `RegionChip`, `regionChips`, `RegionPlace`, `RegionDef`).
- `placeDanger` and `regionChips` expect rows with `terrainType`, `isSafe`, `regionId`, `levelOffset` (and region `dangerMultiplier`, `name`).
- svg may now be drawn only in `.vue` files under `src/map/`; `<svg` anywhere else fails designContract.
- The 1200px media query is allowed in `src/map/` styles.
- `src/map/mapGuards.test.ts` scans all non-test .ts/.vue files in `src/map/`, so every future file there must avoid Date.now, `COOLDOWN_MICROS`, replaceAll, `.at(`, Object.hasOwn and the banned World-events word.
- The Write tool on this machine writes LF; Python text-mode writes produce CRLF (git normalizes to LF anyway, `.gitattributes` says eol=lf for sources).

## Self-Check: PASSED

- Files: all 14 created files and 2 modified guard tests exist; commits de583481 and 645a6714 are in `git log`.
