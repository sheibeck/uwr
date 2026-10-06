---
phase: 47-console-rails-hotbar-and-input
plan: 05
subsystem: client-data-layer
tags: [spacetimedb, subscriptions, event-tables, keyed-bindings, tdd]
requires: []
provides:
  - "bindEventTable / EventTableLike / BindEventTableOptions / EventTableBinding"
  - "createKeyed / keyedRows / idListKey / parseIdListKey / Keyed / AttachableBinding"
  - "createServerClock / ServerClock"
  - "gameQueries / GameQueries"
affects: [47-06, 47-07, 47-08, 47-09]
tech-stack:
  added: []
  patterns: ["onInsert-only event binding", "swap-on-applied keyed bindings", "typed where + toSql"]
key-files:
  created:
    - src/game/bindEventTable.ts
    - src/game/bindEventTable.test.ts
    - src/game/keyedBinding.ts
    - src/game/keyedBinding.test.ts
    - src/game/serverClock.ts
    - src/game/serverClock.test.ts
    - src/game/queries.ts
    - src/game/queries.test.ts
  modified: []
key-decisions:
  - "Event bindings route rows to a callback and never read iter(); the stale-apply guard is copied from bindTable."
  - "createKeyed also disposes its bindings and watchers when the owning effect scope stops (guarded by getCurrentScope), so a session teardown cannot leak subscriptions."
  - "A key change while the current binding has not applied yet still goes through pending: current stays until the new binding applies (spec behavior, kept simple)."
  - "queries.ts throws on an empty id list instead of emitting invalid SQL; callers use idListKey (null when empty) to bind nothing."
requirements-completed: [CON-01, CON-03, CON-04]
status: complete
duration: 15min
completed: 2026-10-05
---

# Phase 47 Plan 05: Subscription primitives Summary

Four `src/game/` modules the game data hub (47-06) builds on: an onInsert-only event-table binding, keyed bindings that swap on applied, a server clock skew estimate, and typed, filtered SQL for every table Phase 47 reads.

## What was built
- `src/game/bindEventTable.ts`: one stable listener `(ctx, row) => onRow(row)`; `attach` ignores the same connection, detaches the previous one with the same function reference (`removeOnInsert`), and keeps bindTable's stale-apply guard (an `onApplied` for a conn that is no longer current unsubscribes its own handle). `applied` and `failed` refs; an error warns with the sql. Never touches `iter()`. Unsubscribe errors are swallowed.
- `src/game/keyedBinding.ts`: `createKeyed` with `flush: 'sync'` watchers on key and conn. First binding shows at once; later key changes attach a pending binding and promote it when its `applied` flips (old one disposed then). A newer key disposes the pending binding; null or `reset()` disposes both; a conn change re-attaches both. `swap: 'immediate'` is available for event bindings. `keyedRows` is a computed over the current binding's rows. `idListKey` sorts bigints numerically, de-duplicates, joins with commas and returns null for an empty set; `parseIdListKey` reverses it.
- `src/game/serverClock.ts`: `sample(serverMicros)` sets skew to `Number(serverMicros) - now() * 1000`; `nowMicros()` is `now() * 1000 + skew`; default skew 0, latest sample wins.
- `src/game/queries.ts`: `gameQueries()` using `toSql(tables.x.where(...))`. Filters: `event_private.ownerUserId`, `event_location.locationId`, `event_group.groupId`, npc/resource_node/character `locationId`, `location_connection.fromLocationId`, hotbar/hotbar_slot/ability_template/ability_cooldown/event_contribution/renown/renown_perk `characterId`, `group.id`, `group_member.groupId`, `world_event.status = 'active'`. Id lists build an `.or()` chain. Views, `faction` and `event_world` stay whole.

## Verification
- `pnpm exec vitest run src/game`: 4 files, 41 tests pass (10 + 14 + 4 + 13 across the four files).
- `pnpm exec vitest run --dir src --maxWorkers=2`: 59 files, 1020 tests pass (was 55 files, 979 tests).
- `pnpm exec vue-tsc -b`: exits 0.
- queries.test.ts runs the real typed builder in this checkout, so research A1 (typed `where` on event tables generates valid SQL) is confirmed at the SQL-text level. Server acceptance of these subscriptions was not tested (no live server, per owner constraints).

## Deviations from Plan
None - plan executed as written. Two small type-level adjustments inside the planned files, no behavior change:
- `EventTableLike<Row>` types its callbacks as `(ctx, row: Row)` so the type parameter is used (an unused `Row` fails `noUnusedLocals`).
- `createKeyed` casts its `shallowRef(null)` to `ShallowRef<B | null>` because Vue's unwrapping over a generic `B` otherwise fails to type-check.

## Threat model
- T-47-04a mitigated: every event_private, event_location and event_group query carries a WHERE, asserted in queries.test.ts.
- T-47-04b transferred as planned (server tables stay public; a hostile client can still subscribe unfiltered).
- T-47-12 mitigated: stale-apply unsubscribe, pending bindings disposed on every key change, reset and scope stop; all tested.

## Known Stubs
None.

## Threat Flags
None.

## Commits
- c082e3b9 feat(47-05): event-table binding over onInsert
- 3fb94888 feat(47-05): keyed bindings with swap-on-applied
- 35f30c55 feat(47-05): server clock and filtered subscription queries

## Self-Check: PASSED
