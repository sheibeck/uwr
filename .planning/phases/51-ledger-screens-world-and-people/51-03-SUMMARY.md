---
phase: 51-ledger-screens-world-and-people
plan: 03
subsystem: database
tags: [spacetimedb, passages, world-structure, scheduled-reducer, module-identity-guard, publish, local, bindings]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-01 visited_location table, markLocationVisited / visitedRowFor, the my_visited_locations view"
provides:
  - "Passage collapse: an explored passage (terrainType 'passage') becomes a direct border crossing when the last character leaves it, in either direction, in the same transaction"
  - "PASSAGE_LOCATION_COLUMNS: every one of the 26 location-id columns classified once, with a source-text schema coverage test that fails on a new unclassified column"
  - "Guarded passage_sweep_tick table and sweep_passages scheduled reducer (every 5 minutes) that returns offline characters to their own side and collapses empty passages; the first tick is the one-time cleanup"
  - "onlineCharacterIds (51.1 swaps its body for the stored online flag)"
  - "Phase 51 server (51-01 and 51-03) published to the owner's local uwr database with the Anthropic key intact; client bindings regenerated with myVisitedLocations"
affects: [51-05, 51-06, 51-07, 51.1]

tech-stack:
  added: []
  patterns:
    - "Total re-home over every location-bearing table, enforced by a schema-source coverage test"
    - "Scheduled reducer: module-identity guard first, re-arm one tick, then work; armed in init and clientConnected"

key-files:
  created:
    - spacetimedb/src/helpers/online.ts
    - spacetimedb/src/helpers/passages.ts
    - spacetimedb/src/helpers/passages.test.ts
    - spacetimedb/src/reducers/travel_passage.integration.test.ts
    - spacetimedb/src/reducers/passage_sweep.integration.test.ts
    - src/module_bindings/my_visited_locations_table.ts
  modified:
    - spacetimedb/src/helpers/travel.ts
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/scheduled_guard.integration.test.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts

key-decisions:
  - "Coordinator A1 (sweep): an offline character goes to its visited row's fromLocationId when that is an own-region neighbour of the passage, else the lowest-id own-region neighbour; never across the border"
  - "Coordinator 2: no collapse inside applyWorldStartResult; the departure trigger and the sweep cover it"
  - "Departure check runs once after every traveller (leader and followers) has moved, so a follower never targets a deleted place"
  - "event_spawn_item is re-homed, not deleted (live event collectibles); enemy_spawn_member rows go with their enemy_spawn"
  - "Re-linking is per direction: connectLocations when neither directed row exists, else only the missing directed row, so no duplicate row is ever written"
  - "No admin reducer: the first sweep tick is the one-time cleanup"

patterns-established:
  - "A new location-id column in schema/tables.ts must be classified in PASSAGE_LOCATION_COLUMNS or passages.test.ts fails with its name"

requirements-completed: [LDG-04]

duration: ~75min
completed: 2026-10-07
---

# Phase 51 Plan 03: Passage Collapse, Guarded Sweep, Local Publish and Bindings Summary

**An explored region edge collapses into a direct border crossing once nobody stands in it (on departure and through a module-identity-guarded 5-minute sweep that sends offline characters back to their own side), and the Phase 51 server is live on the owner's local database with key_length 108 intact and bindings regenerated.**

## Performance

- **Tasks:** 3 of 3
- **Completed:** 2026-10-07
- **Files:** 5 created and 6 modified (plus the generated bindings)

## Accomplishments

- `helpers/passages.ts`: `passageSides`, `PASSAGE_LOCATION_COLUMNS`, `rehomePassageDependents`, `collapsePassageIfEmpty`, `sweepPassages`, `PASSAGE_SWEEP_INTERVAL_MICROS` (300_000_000n).
- `performTravel` calls `collapsePassageIfEmpty(ctx, originLocationId)` once, after the move loop.
- Re-home list: boundLocationId, quest_template target and source, quest_item, named_enemy, corpse, event_objective, event_spawn_item, npc, vendor_buyback, combat_encounter move to the lowest-id own-side neighbour. Deleted: search_result, resource_node, enemy_spawn (with its enemy_spawn_member rows), event_spawn_enemy, location_enemy_template, enemy_respawn_tick (by scheduledId), pull_state, visited_location at the passage. History kept: world_gen_state.sourceLocationId, world_state.startingLocationId, visited_location.fromLocationId at other places. event_location is `event: true` and ignored.
- `passage_sweep_tick` (private, scheduled) and `sweep_passages`: guard is the first statement, re-arms exactly one tick at now + 300 s, then `sweepPassages`. `ensurePassageSweepScheduled` runs in init and clientConnected.
- Local publish and bindings (below).

## Task Commits

1. **Task 1: passage collapse with full re-homing after departure** - `9840f692`
2. **Task 2: guarded passage sweep** - `df291ebe`
3. **Task 3: regenerated client bindings** - `44f99591` (the publish itself changes no tracked file)

## Publish (Task 3)

Command, run from the repo root with stdin closed, exactly:

`spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`

Output contained `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`, exit 0. The migration plan only listed: Created user table `passage_sweep_tick` (private, schedule calls `sweep_passages`), Created user table `visited_location` (private), Created view `my_visited_locations`. No drop, no column change, no clear prompt. The log shows `Creating table passage_sweep_tick`, `Creating table visited_location`, `Database updated`, and no panic in the last 80 lines. The build printed the usual `tsc not found in node_modules` line and then `Build finished successfully`.

Key check (`SELECT key_set, key_length FROM admin_llm_status`):

- Before (saved to `.git/uwr-51-03-key-before.txt`): `true | 108`
- After (live): `true | 108`

`SELECT * FROM my_visited_locations` succeeds (empty for the CLI identity).

## Passages before and after

Before the publish (`SELECT id, name FROM location WHERE terrain_type = 'passage'`):

| id | name |
|----|------|
| 6 | The Passage to Tessarine Shelf |
| 4101 | The Passage to Orrowmere Teeth |
| 4107 | The Passage to Sennet Basin |

After the publish (queried a few minutes later, read-only): zero passage rows. The owner's client had reconnected after `--break-clients`, so clientConnected armed the tick, and the first sweep ran: a `passage_sweep_tick` row now exists (scheduled_id 2, due about 5 minutes after the first run), locations 6, 4101 and 4107 are gone, no `location_connection` row touches any of them, and no character has any of them as location or bound location. Three new link pairs appeared in `location_connection` (ids 4133 to 4138): 5 and 4097, 4099 and 4102, 4106 and 4108. I connected no client and called no reducer; the cleanup was the owner's own reconnect.

## Generated binding names (for 51-07)

- New file `src/module_bindings/my_visited_locations_table.ts` (row: `id`, `characterId`, `locationId`, `firstVisitedAt`, `fromLocationId` optional).
- `src/module_bindings/index.ts`: table accessor `myVisitedLocations` (deprecated alias `my_visited_locations`).
- `src/module_bindings/types.ts`: `MyVisitedLocations`, `VisitedLocation`, `PassageSweepTick`.
- The private tables `visited_location` and `passage_sweep_tick` have no table binding (private), only the type objects above. The generator wrote no reducer file for the scheduled reducer.

## Test results

- `passages.test.ts`, `travel_passage.integration.test.ts`, `travel_visited.integration.test.ts`, `passage_sweep.integration.test.ts`, `scheduled_guard.integration.test.ts`: all green (95 tests across the Task 2 run, 50 across Task 1).
- `npx vue-tsc -b`: clean.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 160 files, 3614 tests pass.
- Full `npx vitest run` from the repo root: 9169 tests pass; 3 failing files, all the known baseline (`scripts/llm/call_log_report.test.mjs` and `scripts/llm/proof_rules.test.mjs` suite failures, `spacetimedb/src/helpers/measurement.results.test.ts`).
- Running vitest from inside `spacetimedb/` additionally fails `salvage_result.test.ts` (root-relative client import, already in the hand-off log); it passes from the repo root.

### RED evidence

Task 1: after writing both test files and before any implementation, `vitest run src/helpers/passages.test.ts src/reducers/travel_passage.integration.test.ts` gave `Test Files 2 failed, Tests 4 failed | 2 passed | 33 skipped` (passages.test.ts could not load the missing module; the departure cases failed because nothing collapsed, for example `expected [ 5n, 6n, 4097n ] to deeply equal [ 5n, 4097n ]`). GREEN: 50 passed.

Task 2: I wrote the sweep tests and the guard entries first but went straight on to implement without capturing a separate failing run, so there is no RED output for Task 2. The tests could not have passed beforehand (the reducer, table and `sweepPassages` did not exist); the GREEN run is 95 passed.

## Deviations from Plan

### Commit trailer

- **[Process] Trailer differs from rules.md.** The binding rules and hand-off asked for `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. I am Sonnet 5.5, and the harness attribution reminder for this session names that model, so all three commits carry `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` plus the same `Claude-Session` line. Reword with the orchestrator's preferred trailer if needed.

### Auto-fixed Issues

None. The plan was executed as written, with one small robustness choice: when linking own-side to far-side neighbours the code inserts only the missing directed row if one direction already exists, instead of calling `connectLocations` (which would duplicate the existing row). With neither direction present it calls `connectLocations` as planned.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-51-12 to T-51-18 are all addressed: guard first and pinned by test, total re-home with coverage test, offline-only own-side moves, single collapse after all travellers moved, local publish with key checked before and after, no server start or stop, bindings only regenerated).

## Notes for later Phase 51 plans

- Client: `myVisitedLocations` must be subscribed explicitly (view). A passage never appears as a stop once empty; the map reads the direct link as a border crossing (an own-region place linked to a place in another region).
- `sweepPassages(ctx)` returns `{ moved, collapsed }`; `onlineCharacterIds(ctx)` is the single place 51.1 changes to use the stored online flag.
- A character that comes online in a passage after the sweep moved nothing is simply standing there; there is no player-facing copy for the silent move (the next arrival look shows the place).

## Self-Check: PASSED

- Files found: online.ts, passages.ts, passages.test.ts, travel_passage.integration.test.ts, passage_sweep.integration.test.ts, my_visited_locations_table.ts.
- Commits found: 9840f692, df291ebe, 44f99591.
