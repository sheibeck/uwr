---
phase: 50-ledger-screens-character-and-economy
plan: 09
subsystem: spacetimedb
tags: [spacetimedb, publish, local, bindings]

requires:
  - phase: 50-01 through 50-08
    provides: "all Phase 50 server code (buy-back table, view and reducer, quest-item refusal, craft validate-before-mutate, shared helpers)"
provides:
  - "The owner's local uwr database runs the Phase 50 server code (additive: one private table, one view, one reducer; nothing cleared)"
  - "Regenerated client bindings: tables.myVendorBuyback, VendorBuyback row type, reducers.buybackLastSale({ characterId })"
affects: [50-10 client hub (subscribes to my_vendor_buyback, calls buybackLastSale), 50-19 Just sold card, 50-23 owner try-out]

tech-stack:
  added: []
  patterns:
    - "Gate (full suites) -> key check -> exact local publish -> key check -> regenerate -> commit bindings"

key-files:
  created:
    - src/module_bindings/my_vendor_buyback_table.ts
    - src/module_bindings/buyback_last_sale_reducer.ts
  modified:
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts

key-decisions:
  - "types/reducers.ts is regenerated whenever a reducer is added (two additive lines for buybackLastSale); it is committed with the other bindings although the plan's allowlist named only four paths"

requirements-completed: [LDG-09, LDG-11]

status: complete
duration: 25min
completed: 2026-10-06
---

# Phase 50 Plan 09: Local publish and bindings Summary

The local uwr database now runs all Phase 50 server work, published additively with `--break-clients` (no clear, no maincloud, no push), the stored key was 108 before and after, and the client bindings expose the buy-back view and reducer.

## Pre-publish gate (Task 1)

- `git status --porcelain spacetimedb/src` empty before the run (Plans 01-08 committed).
- Module suite: `pnpm exec vitest run --maxWorkers=1 --exclude "**/measurement.results.test.ts"` from `spacetimedb/`: **106 files, 4316 tests passed**, exit 0.
- Client suite: `pnpm exec vitest run --dir src --maxWorkers=2`: **118 files, 2515 tests passed**.
- `pnpm exec vue-tsc -b`: exit 0.
- The module run rewrote `spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap` by line endings only (`git diff --ignore-all-space` empty); restored with `git restore` as instructed.
- Ping `http://127.0.0.1:3000/v1/ping`: 200.
- Key check before (`spacetime sql --server local uwr "SELECT key_set, key_length FROM admin_llm_status"`, matched by `grep -qE "true +[|] +108"`):

```
 key_set | key_length
---------+------------
 true    | 108
```

## Publish (Task 2)

Command, exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`. Exit 0. The output (ANSI codes stripped) contains no clear prompt, migration refusal or manual-migration text. Tail:

```
Checking for breaking changes...
Database Migration Plan
▸ Created user table: vendor_buyback (private)
    Columns: character_id U64, npc_id U64, npc_name String, location_id U64, template_id U64, item_name String,
             rarity String, quantity U64, price U64, quality_tier/craft_quality/display_name (option String),
             is_named/is_temporary (option Bool), affixes_json String, listing_id (option U64), sold_at timestamp
    Unique constraints: vendor_buyback_character_id_key on [character_id]
    Indexes: vendor_buyback_character_id_idx_btree on [character_id]
▸ Created view: my_vendor_buyback (same 17 columns)

Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

(The CLI also printed its usual `tsc not found in node_modules` notice followed by `Build finished successfully.`; this is the existing behavior.)

- Key check after: `key_set true`, `key_length 108` (same grep matched).
- `spacetime sql --server local uwr "SELECT * FROM my_vendor_buyback"` returns the 17 columns and no rows (empty for the CLI identity, as expected).
- Log excerpt (`spacetime logs --server local uwr | tail -n 80`; zero lines matching "panic"):

```
2026-10-06T17:56:33.744537Z  INFO: Updated program to f113175892216e45feadd5887cc395c39ea0b7bfae8f7f19668841d411192c60
2026-10-06T17:56:33.745218Z  INFO: Creating table `vendor_buyback`
2026-10-06T17:56:33.746729Z  INFO: Database updated
```

No reducer was called, no client or LLM path was run against the live database.

## Bindings (Task 3)

`pnpm spacetime:generate -y` finished successfully. Diff stat (commit `492386b2`, 89 insertions, 0 deletions):

```
src/module_bindings/buyback_last_sale_reducer.ts | 15 +  (new)
src/module_bindings/index.ts                     | 17 +
src/module_bindings/my_vendor_buyback_table.ts   | 31 +  (new)
src/module_bindings/types.ts                     | 24 +
src/module_bindings/types/reducers.ts            |  2 +
```

Every added hunk is about the buy-back surface: in `index.ts` the `BuybackLastSaleReducer` import and `__reducerSchema("buyback_last_sale", ...)`, the `MyVendorBuybackRow` import, the `myVendorBuyback` table entry and its deprecated `my_vendor_buyback` alias lines; in `types.ts` the `MyVendorBuyback` placeholder object (empty, like `MyQuests`) and the `VendorBuyback` row type (17 fields); in `types/reducers.ts` the `BuybackLastSaleParams` type. No existing table, reducer or type changed.

**Generated names for Plan 10:** the view's table handle is `tables.myVendorBuyback` (row component `MyVendorBuybackRow`, whose columns are exactly the VendorBuyback columns); the exported row type to use is `VendorBuyback` (the `MyVendorBuyback` type in `types.ts` is an empty placeholder object as for `MyQuests`); the reducer is `reducers.buybackLastSale({ characterId })` with params type `BuybackLastSaleParams`.

`pnpm exec vue-tsc -b` exits 0 after regeneration.

## Deviations from Plan

**1. [Rule 3 - Blocking, reported] `src/module_bindings/types/reducers.ts` changed in addition to the four allowlisted paths**
- **Found during:** Task 3
- **Issue:** The generator also rewrites `types/reducers.ts` when a reducer is added. The plan's allowlist (taken from the 48-01 precedent, which added a view only) names four paths.
- **Fix:** none needed; the diff is two additive lines (the `BuybackLastSaleReducer` import and the `BuybackLastSaleParams` type), purely the new reducer, so it was committed with the other bindings. The plan's automated allowlist grep would flag this file; the content check was done by reading the whole diff.
- **Commit:** `492386b2`

## Known Stubs

None.

## Threat Flags

None. T-50-29 (exact command, stdin closed, key 108 before and after, no clear output), T-50-30 (ping only, no server started or stopped), T-50-31 (no reducer call or LLM path) and T-50-32 (generator only, diff read in full) all held.

## Self-Check: PASSED

- FOUND: src/module_bindings/my_vendor_buyback_table.ts, src/module_bindings/buyback_last_sale_reducer.ts
- FOUND commit: 492386b2
