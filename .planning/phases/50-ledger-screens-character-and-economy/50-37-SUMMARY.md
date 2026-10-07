---
phase: 50-ledger-screens-character-and-economy
plan: 37
subsystem: ui
tags: [vue, crafting, layout, materials, result-card, craft-again, mobile, client, gap-closure]
status: complete

requires:
  - phase: 50-33
    provides: ResultCard.vue, useActionResult, resultCardView
  - phase: 50-35
    provides: craftingModel (materialRows, craftQuantity), ItemCard
  - phase: 50-36
    provides: RecipeDetail with the craft-start emit and craftRecipeCount
provides:
  - Crafting screen in mock 9a column order (list 300 | detail fluid | Materials on hand 210, Discover pinned under Materials)
  - Materials on hand rows with icon, rarity-colored name, count (0 in red), selected-recipe highlight and captions
  - Shared result card for crafts and Discover with Craft again and Equip
affects: [50-38 salvage tab (edits CraftingScreen.vue next)]

tech-stack:
  added: []
  patterns:
    - "Craft again derives its reagent choice from the args RecipeDetail emits in craft-start, capped by craftQuantity().max"
    - "Screen root is position: relative and hosts <ResultCard> as the last child of the ready template"

key-files:
  created: []
  modified:
    - src/crafting/CraftingScreen.vue
    - src/crafting/MaterialsOnHand.vue
    - src/crafting/CraftingScreen.test.ts

key-decisions:
  - "Craft again repeats the last count, capped by what the bag now allows (min of the two); it is hidden at max 0 and with no station"
  - "No 'Add to hotbar': no item hotbar reducer exists (the quick-slot reducer takes abilities only)"
  - "The Discover caption is 'Finds new recipes from the materials you carry.' (rewritten for the server's real rule)"
  - "Equip is desktop only and only for crafted gear that canEquipItem allows, calling equip_item on the made instance"

requirements-completed: [LDG-10, LDG-11]

duration: 40min
completed: 2026-10-06
---

# Phase 50 Plan 37: Crafting columns and result card Summary

**Crafting screen in mock 9a's three columns (recipes, detail, Materials on hand with Discover under it), plus the shared result card for crafts and Discover with Craft again and Equip, on desktop and at 390x844.**

## Accomplishments

- At 1200px and wider the body grid is `300px minmax(0, 1fr) 210px` (gap 24), DOM order list, detail, materials. The empty-recipes grid is `minmax(0, 1fr) 210px`. The 900 to 1199 tier (320px detail, Materials disclosure and Discover after the rows) and the mobile list and detail views are unchanged.
- MaterialsOnHand now renders `ul.m-rows` / `li.m-row` from `materialRows`: item icon, name in its rarity color, count (class `short`, `--color-con-red`, at 0), the selected recipe's materials highlighted (`--color-accent-900`) including a used material with 0 on hand. Captions: "Highlighted: used by the selected recipe." (only while a recipe is selected) and "Finds new recipes from the materials you carry." under Discover (column mode).
- CraftingScreen hosts `useActionResult` (keys craft and discover), `resultCardView`, and `<ResultCard>`; the root has `position: relative`.
  - Craft again: `craftRecipeCount({ ...lastArgs, count: min(lastCount, max) })`, card stays open and the next row replaces it.
  - Equip (PhTShirt): `equipItem({ characterId, itemInstanceId: made })`, then closes the card.
  - Mobile: bottom sheet with Done and Craft again (primary tone) only; no Equip, no chips.
  - Focus on close: the opener (Craft or Discover), else the selected recipe row, else the back button, else the first button.

## Task Commits

1. Task 1: mock 9a columns and the Materials on hand column - `41fe6fa2`
2. Task 2: result card for crafts and Discover, Craft again, Equip - `100386f9`

## TDD Evidence

- Task 1 RED: `src/crafting/CraftingScreen.test.ts` 67 tests, 7 failed (highlight, red zero and captions, disclosure rows, mock column order, highlight follows selection, empty-grid order). GREEN: crafting + styles + frameContract 11 files, 263 tests pass; `vue-tsc -b` exit 0.
- Task 2 RED: same file 88 tests, 18 failed (all new card tests). GREEN: 88 pass; crafting + ledger + styles + frame 41 files, 793 tests pass; `vue-tsc -b` exit 0 (after typing a read-only `locations` write in a test).
- Full client suite (`npx vitest run`): 275 files passed, 8775 tests passed. Failures are only the known baseline: scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts (2 tests).

## Deviations from Plan

None - plan executed as written. Two small notes:
- The verify commands were run with `npx vitest` / `npx vue-tsc -b` (the repo has npm scripts, not pnpm in this shell).
- `outputRecipes` and `outputRecipesApplied` were added to the test fake ledger as the plan asked, though the Craft screen itself does not read them.

## Known Stubs

None.

## Threat Flags

None. Mitigations: T-50-151 (Craft again count is capped by the shared `craftQuantity().max`; the server re-checks), T-50-152 (runner keys `craft` and `item-equip` ignore repeats, pending buttons are aria-disabled; tested), T-50-153 (all names are text nodes; escape tests for the card and Materials).

## Deferred UAT

Craft 3 at 1280 and at 390x844, Craft again, Equip, Discover (Nothing new and with finds). Deferred to the milestone-end consolidated check.

## Notes for plan 50-38 (Salvage tab editing CraftingScreen.vue)

- `CraftingScreen.vue` root is `<div ref="root" class="crafting-screen" :class="{ mobile }">`, `position: relative`, column flex. Children of the ready template, in order: the `noneKnown` block, the desktop `.desk-grid` (list-col, detail-col, materials-col when `wide`), the mobile `.list-view` / `.detail-view`, `<NoticeLine>`, then `<ResultCard>` as the last child. Add new content before NoticeLine, and keep ResultCard last.
- One shared `runner` (keys `craft`, `discover`, `item-equip`) and one `result = useActionResult({... keys: { craft: 'craft', discover: 'discover' } ...})`. A salvage here should add its key to `keys` (for example `salvage: 'salvage'`), and `resultView`, `resultActions` and `onResultAction` already branch on `view.kind`; the Craft again and Equip actions only appear for `kind === 'craft'`.
- `againCount` returns null unless the view is a craft whose `recipeTemplateId` matches `lastCraft`, so a salvage card never shows Craft again.
- `fallbackFocus()` (selected row, back button, first button) is the close fallback; reuse it.
- The `wide` flag comes from `useWideLayout` (JS class `.desk-grid.wide`), so no new media query is needed in `src/crafting/` (frameContract).
- `RecipeList` still emits `select`; the selection id lives in `selectedId` in CraftingScreen. `usedTemplateIds` is derived from the selected recipe's requirements and passed only to the wide Materials column.
- Test file: `src/crafting/CraftingScreen.test.ts` `buildWorld` now takes `lastResult` and returns it; `equipItem` is in `calls`.

## Self-Check: PASSED

- src/crafting/CraftingScreen.vue, src/crafting/MaterialsOnHand.vue, src/crafting/CraftingScreen.test.ts: FOUND
- Commits 41fe6fa2 and 100386f9: FOUND
- Acceptance greps: `300px minmax(0, 1fr) 210px` 1, old grid 0, caption 1, `materialRows(` 1, `useActionResult(` 1, `<ResultCard` 1, `craftRecipeCount(` 1, hotbar 0
