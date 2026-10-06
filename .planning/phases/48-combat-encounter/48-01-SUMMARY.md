---
phase: 48-combat-encounter
plan: 01
subsystem: combat
tags: [spacetimedb, view, schema-gate, local-publish, bindings]
status: complete
requires: ["46.1-09"]
provides:
  - "Public per-sender view my_combat_aggro (row type MyCombatAggroEntry) over the private aggro_entry table"
  - "Local uwr database serves the view; stored Anthropic key intact (length 108 before and after)"
  - "Regenerated src/module_bindings with the myCombatAggro table accessor and MyCombatAggroEntry row type"
affects: [48]
tech-stack:
  added: []
  patterns: ["chained index lookups in a view (player -> character -> combat_participant -> aggro_entry)", "no-scan proxy over the strict mock db", "publish with stdin closed and --break-clients, key check before and after"]
key-files:
  created:
    - spacetimedb/src/views/combat.test.ts
    - src/module_bindings/my_combat_aggro_table.ts
  modified:
    - spacetimedb/src/views/combat.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
key-decisions:
  - "The view body is the exported pure function myCombatAggroRows(ctx); the registered view just calls it, so tests drive both"
  - "Row type name MyCombatAggroEntry (differs from the generated view struct MyCombatAggro, which is an empty object); .primaryKey() on the row id was accepted by the recorder, by spacetime build and by the generator, so no modifier was dropped"
  - "Pet aggro rows (petId set) are dropped; combat ids are deduplicated in a Set; rows come back in index order and the client sorts"
requirements-completed: [CMB-02]
metrics:
  tasks: 2
  files: 5
  completed: 2026-10-06
---

# Phase 48 Plan 01: my_combat_aggro view, local publish and bindings Summary

The threat order now has a per-sender data path: a public view `my_combat_aggro` returns the aggro rows of every fight one of the sender's own characters takes part in, and nobody else's. It is published to the owner's local database (additive, no clear, key intact) and the client bindings carry `tables.myCombatAggro` and `MyCombatAggroEntry`.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | my_combat_aggro view with a no-scan, per-sender test | 38637d22 | spacetimedb/src/views/combat.ts, spacetimedb/src/views/combat.test.ts |
| 2 | Local publish (--break-clients, no clear), key check, bindings regeneration | ad7093e4 | src/module_bindings/index.ts, types.ts, my_combat_aggro_table.ts |

## What was built

- `spacetimedb/src/views/combat.ts`: exports `MY_COMBAT_AGGRO_KEYS` (`id, combatId, enemyId, characterId, value`) and `myCombatAggroRows(ctx)`. It finds the player by `ctx.sender`, returns `[]` for no player or no `userId`, walks `character.by_owner_user` then `combat_participant.by_character` into a Set of combat ids, then `aggro_entry.by_combat` per combat id. Entries with `petId` set are skipped; the projection holds only the five keys. `registerCombatViews` registers `my_combat_aggro` (public) with the `MyCombatAggroEntry` row; the two existing views and the destructuring are unchanged, so the `views/llm.test.ts` wiring test passes untouched.
- `spacetimedb/src/views/combat.test.ts` (10 tests): registration (name and opts, the two older views still present), key list, two senders in two fights each seeing only their own fight, helper equals registered view, no player row and no userId give `[]`, user with no fight, one user in two fights (both fights returned), duplicate participant rows of one combat do not duplicate output, pet rows dropped and value 0n kept, exact key set. Every read runs through a `noScanDb` proxy that throws on any `iter` access.

## Verification

- `cd spacetimedb && pnpm exec vitest run src/views/combat.test.ts src/views/llm.test.ts --maxWorkers=1`: 2 files, 46 tests passed.
- Full module suite (`--maxWorkers=1`): 75 of 76 files passed, 3772 of 3774 tests; the only failure is the known baseline `src/helpers/measurement.results.test.ts` (2 tests, no recorded Phase 39 results file).
- Client: `pnpm exec vue-tsc -b` exit 0; `pnpm exec vitest run --dir src --maxWorkers=2`: 78 files, 1372 tests passed.

## Schema gate

Health: `curl http://127.0.0.1:3000/v1/ping` printed 200 (server not started, stopped or restarted by this plan; Vite untouched).

Key check before publish (`spacetime sql --server local uwr "SELECT key_set, key_length FROM admin_llm_status"`):

```
 key_set | key_length
---------+------------
 true    | 108
```

Publish command, exactly as ordered: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` (exit 0). Output:

```
Using configuration from C:\projects\uwr\spacetime.json
Using configuration from C:\projects\uwr\spacetime.local.json
Publishing module spacetimedb to database 'uwr'
tsc not found in node_modules. Make sure you have the `typescript` package as a dev-dependency and that your dependencies are installed.
Build finished successfully.
Uploading to local => http://127.0.0.1:3000
Checking for breaking changes...
Database Migration Plan
Created view: my_combat_aggro
    Columns:
        - id: U64
        - combat_id: U64
        - enemy_id: U64
        - character_id: U64
        - value: U64

Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

The plan only adds the view: no clear prompt, no manual migration, no table change. (The `tsc not found` line is the CLI's pre-build probe and is the same on earlier publishes; the build finished successfully.)

Logs after publish: the latest `INFO: Database updated` line is present, no panic or error lines.

Key check after publish:

```
 key_set | key_length
---------+------------
 true    | 108
```

`SELECT * FROM my_combat_aggro` succeeded with an empty result (columns id, combat_id, enemy_id, character_id, value).

## Bindings diff

`pnpm spacetime:generate -y` produced exactly:

- new `src/module_bindings/my_combat_aggro_table.ts` (row: id u64 primaryKey, combatId, enemyId, characterId, value)
- `index.ts` +15 lines: `MyCombatAggroRow` import, `myCombatAggro` table entry, and the deprecated snake_case aliases `my_combat_aggro` in the alias types
- `types.ts` +12 lines: the empty struct `MyCombatAggro` and the row struct `MyCombatAggroEntry` `{ id, combatId, enemyId, characterId, value }` (all bigint)

No other generated file changed. `grep -c "aggroEntry:" src/module_bindings/index.ts` prints 0 (the private table is still unbound; the generator log lists `aggro_entry` among the skipped private tables). Names match the plan's expectation (RESEARCH A2): later plans import `MyCombatAggroEntry` from `src/module_bindings/types` and read `tables.myCombatAggro`.

## Deviations from Plan

None. The plan executed as written.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-48-01 and T-48-02 are covered by the two-sender and no-scan tests; T-48-03 to T-48-06 by the publish and key checks above, the unchanged server and Vite processes, no LLM code touched, and the reviewed bindings diff.

## Flagged assumptions

- CMB-02 edge probe (unclassified): reviewed by hand and pinned by tests (other users' fights, pet rows, a user with characters in two fights, missing player or userId, value 0n kept).

## Deferred owner verification

No hands-on check is needed for this plan. When the owner tries the Phase 48 client later, one item belongs to this view: with two accounts in two separate fights, each account's threat list should show only its own fight (the unit tests prove it; a live look is optional).

## Self-Check: PASSED

- FOUND: spacetimedb/src/views/combat.ts, spacetimedb/src/views/combat.test.ts, src/module_bindings/my_combat_aggro_table.ts
- FOUND commits: 38637d22, ad7093e4
