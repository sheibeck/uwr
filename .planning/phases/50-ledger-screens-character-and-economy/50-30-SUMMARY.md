---
phase: 50-ledger-screens-character-and-economy
plan: 30
subsystem: salvage-discover-result-rows-and-publish
tags: [spacetimedb, salvage, discover, result-row, publish, local, bindings, real-handler-tests, gap-closure]

requires:
  - phase: 50-28
    provides: "salvageMaterialYield, salvageReagentDefs, SALVAGE_REAGENT_CHANCE_PCT, the result line codec"
  - phase: 50-29
    provides: "action_result table, my_action_result view, writeActionResult, craft_recipe_count"
provides:
  - "salvage_item on the shared yield rules, writing the action_result row (received, bonus, scroll lines)"
  - "research_recipes (Discover) writing the discover row (one recipe line per find, quantity 0 when nothing new)"
  - "Real-handler test for the equipped salvage refusal (item_instance, item_affix, action_result deep-equal)"
  - "Plans 50-28 to 50-30 published to the owner's local database; bindings regenerated"
affects: [50-31]

key-files:
  created:
    - spacetimedb/src/reducers/salvage_result.test.ts
    - src/module_bindings/my_action_result_table.ts
    - src/module_bindings/craft_recipe_count_reducer.ts
  modified:
    - spacetimedb/src/reducers/items_crafting.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts

key-decisions:
  - "The result row is written after the instance is deleted, from a lines array filled as the grants happen; each line's total is read with getItemCount after every grant"
  - "A salvage whose slot or tier has no material still writes a row (no lines); only the Discover station refusal skips the row"

requirements-completed: [LDG-01, LDG-02, LDG-10, LDG-11]

status: complete
completed: 2026-10-06
---

# Phase 50 Plan 30: Salvage and Discover result rows, local publish, bindings Summary

salvage_item now computes its yield with the shared rules from data/crafting_rules.ts and leaves a private result row stating exactly what it granted; Discover does the same for what it found. Plans 50-28 to 50-30 were published to the local database with the key intact, and the client bindings carry the new view and reducer.

## Commits

| Commit | Message |
|--------|---------|
| 2fb50bad | feat(50-30): salvage on the shared yield rules, equipped refusal test, salvage and Discover result rows (Task 1) |
| 3abcc88e | chore(50-30): regenerate bindings for my_action_result and craft_recipe_count (Task 2) |

## What changed

- **salvage_item.** Refusal order and messages unchanged ('Unequip item first' stays third). The material is `salvageMaterialYield` fed with the template's slot, armor type, tier, value, the material template and the sum the matching recipe consumed. The reagent candidates are `salvageReagentDefs` over the instance's affixes and the roll compares against `SALVAGE_REAGENT_CHANCE_PCT` (the formula and the def pick are byte-identical). The scroll branch is unchanged except it keeps the bag row addItemToInventory returns. Feed lines are unchanged. After the instance is deleted the row is written with kind 'salvage', the instance's template, display name or name, rarity (qualityTier, else the template rarity), craft quality, quantity, craftCount 0n and the lines.
- **Lines.** 'received' only when the count is above 0n, 'bonus' only on a reagent grant, 'scroll' only on a scroll grant (instanceId is the scroll's bag row), each with the bag total after all grants.
- **research_recipes.** One 'recipe' line per found recipe in discovery order (templateId = the output template, name = the recipe name). After the loop it writes kind 'discover', itemName '', rarity 'common', quantity = the number found (0n when nothing new). The station refusal writes no row.
- **Not touched:** prompts, Keeper text, learn_recipe_scroll and every other reducer.

## TDD evidence

- **RED:** first run of salvage_result.test.ts against the unchanged reducers: 19 tests, 17 failed (every row assertion: no action_result row was written; the replace test saw seq 4n unchanged), 2 passed (the equipped refusal and the no-station case, which already behaved correctly). Written first; a missing-material test fixture was corrected to use tier 0n (the slot list has no salvage-material-free equipment slot) before the GREEN run.
- **GREEN:** salvage_result 19 tests pass. They cover the equipped refusal (deep-equal item_instance, item_affix, action_result), guaranteed material, displayName and rarity fallback, nothing usable, no material (no lines), replace and seq, reagent hit and miss, the def pick among three affixes, implicit-only affixes never giving a bonus, scroll hit, scroll without template, scroll miss, the recipe cap, a 234-point yield parity grid (13 slot and armor combinations x tiers 1-3 x values 1n, 5n, 100n x with and without a recipe) and the Discover found, two-found, nothing-new and no-station cases.
- **Targeted suite:** salvage_result, recipe_discovery, item_rules_parity, craft_count, craft_quality: 5 files, 167 tests pass (existing tests unchanged, including 'salvaging never beats crafting').
- **Full module suite** (`--exclude **/measurement.results.test.ts`): 117 files, 4720 tests, all pass. `pnpm exec vue-tsc -b` exit 0.
- **Greps:** `salvageMaterialYield(` 1, `salvageReagentDefs(` 1, `writeActionResult(` 3, comment-filtered `< 12n` 0.
- The module run left `claude_request.test.ts.snap` modified; `git diff --ignore-cr-at-eol` was empty (line endings only) and it was restored with `git restore`.

## Local publish

Command, exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`

- **Key before** (saved at `.git/uwr-50-30-key-before.txt`): `key_set | key_length` = `true | 108`.
- **Output tail** (exit 0):
  - `Created user table: action_result (private)` with the 13 columns (character_id, seq, kind, template_id, item_instance_id, item_name, rarity, craft_quality, quantity, recipe_template_id, craft_count, lines_json, at), a unique constraint and a btree index on character_id
  - `Created view: my_action_result` with the same 13 columns
  - `Publishing module...`
  - `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`
  - No other table or column line, no clear prompt, no manual-migration text. The new reducer produced no migration line.
- **Key after:** `true | 108`.
- **Logs** (`spacetime logs --server local uwr | tail -n 80`): no panic. Last lines: `Updated program to 5eb0da13...`, `Creating table action_result`, `Database updated`.
- **`SELECT * FROM my_action_result`** ran and returned the 13-column header with no rows (the CLI identity has no character, as with my_vendor_buyback).
- Not run: maincloud, `--clear-database`, push, any reducer call or client connection. The SpacetimeDB and Vite servers were not touched.

## Bindings

`pnpm spacetime:generate -y` changed exactly the five allowlisted paths; `git diff --numstat src/module_bindings`: index.ts 17/0, types.ts 20/0, types/reducers.ts 2/0 (additions only, zero deletions), plus the two new files my_action_result_table.ts and craft_recipe_count_reducer.ts. The generator also reported `tsc not found in node_modules` (a warning; the build and generate finished successfully, as in earlier plans).

Generated names for the client plans:
- Table handle: `tables.myActionResult` (deprecated alias `my_action_result`)
- Row type: `ActionResult` (`MyActionResult` is the empty placeholder)
- Reducer: `reducers.craftRecipeCount`, params `{ characterId, recipeTemplateId, count, catalystTemplateId?, modifier1TemplateId?, modifier2TemplateId?, modifier3TemplateId? }`; type `CraftRecipeCountParams`

Client gates on the regenerated bindings: `pnpm exec vue-tsc -b` exit 0; `pnpm exec vitest run --dir src --maxWorkers=2` 142 files, 3171 tests pass; `pnpm build` exit 0.

## Owner try-out note

Reload http://localhost:5173. Crafting and salvage work as before. The result card, Craft xN and the new layouts arrive with plans 50-31 to 50-38. Newly generated recipes get the new descriptions, while recipes generated before this publish keep their old sentence (greenfield: no backfill).

## Deviations from Plan

None - plan executed as written. (Test-only: the "no salvage material" fixture uses tier 0n, because every equipment slot has a material at tiers 1 to 3.)

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-50-126 (shared yield, parity grid and existing never-beats-crafting tests green), T-50-127 (equipped refusal first after ownership, deep-equal test), T-50-128 (bonus and scroll lines only on a grant, hit and miss tests), T-50-129 (exact publish command, key 108 before and after, additive migration), T-50-130 (ping and read-only SQL only) and T-50-131 (five-path allowlist, zero deletions) are implemented and verified.

## Self-Check: PASSED

- Files exist: salvage_result.test.ts, the edited items_crafting.ts, my_action_result_table.ts, craft_recipe_count_reducer.ts and the three edited binding files.
- Commits 2fb50bad and 3abcc88e exist on master.
