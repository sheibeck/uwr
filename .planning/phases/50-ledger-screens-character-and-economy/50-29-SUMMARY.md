---
phase: 50-ledger-screens-character-and-economy
plan: 29
subsystem: crafting-server
tags: [spacetimedb, crafting, craft-count, result-row, private-table, view, real-handler-tests, gap-closure]

requires:
  - phase: 50-28
    provides: "planCraft count, MAX_CRAFT_COUNT, maxCraftCount, data/action_result codec"
provides:
  - "Private action_result table (one row per character) and the my_action_result view"
  - "writeActionResult: the upsert with seq + 1 and encoded lines"
  - "craft_recipe_count reducer (all or nothing, 1..99) and the shared craftBatch path that craft_recipe now uses"
  - "delete_character removes the character's action_result row"
affects: [50-30, 50-31, 50-36]

key-files:
  created:
    - spacetimedb/src/helpers/action_result.ts
    - spacetimedb/src/views/action_result.ts
    - spacetimedb/src/views/action_result.test.ts
    - spacetimedb/src/reducers/craft_count.test.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/views/types.ts
    - spacetimedb/src/views/index.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/characters.ts
    - spacetimedb/src/reducers/items_crafting.ts
    - spacetimedb/src/views/llm.test.ts

key-decisions:
  - "craft_recipe keeps its argument object and calls craftBatch(ctx, args, 1n); the new reducer takes the count (arguments are positional, old clients keep craft_recipe)"
  - "craft xN, like craft_recipe, has no backpack capacity gate (parity; data/inventory_rules.ts records that craft has none). The client still shows 'Your backpack is full.' when there is no room for the first item"
  - "A missing output template is now refused up front with 'Recipe output not found' instead of rolling back through addItemToInventory"

requirements-completed: [LDG-10, LDG-11]

status: complete
completed: 2026-10-06
---

# Phase 50 Plan 29: action_result table, craft_recipe_count and the result row Summary

The server half of "Craft xN": a private per-character result row served through a per-sender view, and a batch craft reducer that validates everything before the first write. Nothing was published and no bindings changed.

## Commits

| Commit | Message |
|--------|---------|
| ffc1ace1 | feat(50-29): private action_result table, my_action_result view and upsert helper (Task 1) |
| 61f6d5ff | feat(50-29): craft_recipe_count and the shared batch path with the result row (Task 2) |

## What changed

- **action_result table** (tables.ts, additive only: 0 removed lines). Private, `characterId` primary key (not autoInc), columns seq, kind, templateId?, itemInstanceId?, itemName, rarity, craftQuality?, quantity, recipeTemplateId?, craftCount, linesJson, at. Registered as the last schema entry.
- **my_action_result view.** Two primary-key lookups (player by sender, row by active character); the test proxy throws on any table scan.
- **writeActionResult.** Insert with seq 1n, or update with seq + 1n replacing every field; throws a SenderError for a kind outside RESULT_KINDS.
- **craftBatch** (items_crafting.ts), shared by craft_recipe (count 1n) and craft_recipe_count. Order of refusals, all before any write:
  1. owner (requireCharacterOwnedBy throws)
  2. crafting station (the existing 'system' line)
  3. count below 1: 'Choose at least one to craft.'
  4. count above 99: 'You can craft up to 99 at once.'
  5. 'Recipe not found'
  6. 'Recipe not discovered'
  7. 'Recipe output not found' (new)
  8. planCraft with the count: 'Missing materials to craft this recipe.' (a 'system' event), 'Essence tier too low for this craft quality', 'Missing catalyst (Essence)', 'Missing modifier: {name}', 'Must provide at least one reagent when using an Essence'
- **Writes.** Remove every `plan.consumes` entry (batch totals, including essence and reagents), then one stack add of outputCount x count for a stackable output, or count separate instances each decorated by `decorateCrafted` (the old decoration block moved into a shared local, byte for byte). Feed line: `You craft {name}.` for one, `You craft {n}x {name}.` for a batch. Then the result row: one 'used' line per consumed template with units and the bag count after.
- **delete_character** deletes `action_result` by characterId next to the buy-back delete.

## TDD evidence and gate counts

- **Task 1.** RED: action_result.test.ts failed to load (`./action_result` view module missing). GREEN: action_result, vendor_buyback (view), schema tests, 6 files, 77 tests pass. `git diff -U0 HEAD -- tables.ts | grep -c '^-[^-]'` printed 0 before the commit.
- **Task 2.** RED: craft_count.test.ts failed in beforeAll, 43 tests skipped, because `capturedReducer('craft_recipe_count')` was not a function (the reducer did not exist). GREEN: craft_count (43 tests: success, 20 max-parity cases for bag 0..9 with and without an essence, the cap of 99, every refusal unchanged, ownership, replace, craft_recipe parity, delete cleanup), craft_quality and recipe_discovery, 3 files, 98 tests pass unchanged.
- **Full module suite** (`--exclude **/measurement.results.test.ts`): 116 files, 4701 tests, all pass after the llm.test.ts fix below (the first run had 1 failure, 4700 pass). `pnpm exec vue-tsc -b` exit 0. The snapshot `claude_request.test.ts.snap` showed a line-endings-only diff and was restored with `git restore`.

## Deviations from Plan

**1. [Rule 3 - Blocking] views/llm.test.ts wiring test needed the ActionResult dep**
- **Found during:** full suite run after Task 2
- **Issue:** `registerViews wiring` builds a deps object from a hard-coded list of table names; the new `registerActionResultViews` read `ActionResult.rowType` of undefined.
- **Fix:** added `'ActionResult'` to that list.
- **Files modified:** spacetimedb/src/views/llm.test.ts (not in the plan's files_modified)
- **Commit:** 61f6d5ff

**2. [Note] craft_recipe diff check.** The acceptance grep for removed argument lines shows them in `git diff` because the whole reducer block moved below the new helpers; the argument object itself is identical (same six fields in the same order, verified by reading the new block and by craft_quality and recipe_discovery passing unchanged).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-50-120 and T-50-121 (count refused below 1 and above 99, every refusal deep-equal, max and max + 1 parity), T-50-122 (foreign owner throws, nothing changes), T-50-123 (private table, per-sender view, no public action_result) and T-50-124 (new reducer, craft_recipe arguments unchanged) are implemented and tested. T-50-125 is accepted: no backpack capacity gate, parity with craft_recipe.

## Self-Check: PASSED

- Files exist: helpers/action_result.ts, views/action_result.ts and its test, reducers/craft_count.test.ts, and the edited tables.ts, items_crafting.ts, characters.ts, views/index.ts, views/types.ts, index.ts, views/llm.test.ts.
- Commits ffc1ace1 and 61f6d5ff exist on master.
