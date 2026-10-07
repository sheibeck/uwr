---
phase: 50-ledger-screens-character-and-economy
plan: 36
subsystem: crafting-recipe-detail
tags: [vue, crafting, recipe-detail, craft-count, stepper, reagent, mobile, client, gap-closure]

requires:
  - phase: 50-31
    provides: "ledger.reducers.craftRecipeCount"
  - phase: 50-35
    provides: "craftingModel (craftQuantity, craftAvailability count, craftCountArgs, usesRows, createsCard, recipeDetail.qualityLine) and ItemCard.vue"
provides:
  - "RecipeDetail.vue rebuilt to mock 9a: Creates card, Uses rows, quality line, single reagent slot, quantity row, Craft N x"
  - "craft-start emit with { args } (CraftCountArgs) for Craft again (plan 50-37)"
affects: [50-37]

key-files:
  created:
    - src/crafting/RecipeDetail.test.ts
  modified:
    - src/crafting/RecipeDetail.vue
    - src/crafting/CraftingScreen.test.ts

key-decisions:
  - "The quantity value is shown, not typed (an output element, no input), as in the mock"
  - "The mobile Discover icon button from the mock is not added: Discover already sits in the mobile list view"
  - "The single reagent slot is kept on mobile (the mock hides it), because CONTEXT keeps full functionality"
  - "Stepper bounds and Max are aria-disabled, not disabled (the SellQuantity precedent), so focus never drops at a bound"

requirements-completed: [LDG-10, LDG-11]

status: complete
completed: 2026-10-06
---

# Phase 50 Plan 36: Recipe detail to mock 9a with the quantity row Summary

The recipe detail now reads top to bottom as mock 9a: the Creates card (ItemCard with the output's stats, effect and sell value), Uses rows scaled by the chosen quantity ('for N crafts'), the fixed quality line with PhSealCheck and its upgrade hint, one 'Add Essence + reagent' slot that opens the existing essence and reagent pickers in place, the reason line, and a quantity row (minus, value, plus, Max N, Craft N x Name). One click crafts the whole batch through craft_recipe_count.

## Commits

| Commit | Message |
|--------|---------|
| 01432592 | feat(50-36): RecipeDetail Creates card, Uses rows, quality line and the single reagent slot (Task 1) |
| 40cafa9e | feat(50-36): quantity row (minus, value, plus, Max) and Craft N x through craftRecipeCount (Task 2) |

## What changed

- **Body.** `createsCard(...)` (with the character and renown perk keys) feeds `<ItemCard kicker="Creates">`; mobile passes no kicker and the card's chip form. While the output template is missing, the old name `h4` and meta line stand in. The have-of-need tiles and mobile material rows are replaced by `ul.uses` (icon 14px, rarity-colored name, have in met or short color, ' / need' in neutral-500). The Quality h6 and the tier word are replaced by `p.quality-line` and `p.hint`.
- **Reagent slot.** `button.reagent-toggle` (aria-expanded, aria-controls, aria-disabled without a station with aria-describedby the reason; 32px, 44px on mobile). The existing essence slot, slots line, reagent slots and `ReagentPicker` instances sit unchanged in the region it controls. All choose, remove, items-watch, Esc and focus-return logic is untouched. A recipe change resets the choices and collapses the slot. Collapsed with an essence chosen it reads '{essence} + {k} reagent(s)' (k is the reagents chosen).
- **Quantity.** `requested` (bigint) feeds `craftQuantity`; a watcher clamps the request when the live rows lower the maximum; the request resets to 1 on a recipe change and after a resolved craft. Craft availability receives `count`. `craftInert` also covers max 0. The `role="group"` 'How many to craft' holds the stepper (minus, `output`, plus) and Max; Craft follows in the same `.qty-row`. On mobile Craft takes its own full-width line.
- **Craft.** `craftCountArgs(...)`, `emit('craft-start', { args })`, then `runner.run('craft', () => reducers.craftRecipeCount(args))`. The single-craft reducer is no longer referenced (comment-filtered grep count 0).
- **Mapping to the guards.** Desktop: row gap 8, stepper min-height 40 with `inset 0 0 0 1px var(--color-neutral-700)` and `--radius-md`, step buttons 36x40, value min-width 32 (14px tabular), Max and Craft 40. Mobile: step buttons 44x44, Max 44, Craft 44 and flex-basis 100%. Uses rows padding 8, gap 8, 4px between rows.

## TDD evidence and gate counts

- **Task 1.** RED: `RecipeDetail.test.ts` 11 failed, 2 passed (of 13). GREEN: the same file 13 of 13; `vitest run src/crafting src/styles` 10 files, 226 tests pass; `vue-tsc -b` exit 0.
- **Task 2.** RED: 13 failed, 15 passed (of 28). GREEN: 28 of 28; `vitest run src/crafting src/ledger src/styles` 22 files, 429 tests pass (designContract, colors.guard, tokens.client pin 23, scrollbars included); `vue-tsc -b` exit 0.
- **Full client suite** (`pnpm exec vitest run --dir src --maxWorkers=2`): 150 files, 3370 tests, all pass.
- **Greps.** `<ItemCard` 1, `PhSealCheck` 2, `Add Essence + reagent` 1, `aria-controls` 1, `<ReagentPicker` 2, `reducers.craftRecipeCount(` 1, comment-filtered `reducers.craftRecipe(` 0, `PhMinus` 2, `PhPlus` 5 (includes PhPlusCircle), `How many to craft` 1, `min-height: 44px` 5, `v-html` or `<svg` 0; no `replaceAll`, `.at(`, `Object.hasOwn(` or the banned word.

## Deviations from Plan

**1. [Interpretation] Group contents.** The plan lists − / value / + / Max inside the labelled group and Craft after it; the group holds the stepper and Max, and Craft is its sibling in the same row (a Craft button is not part of 'How many to craft').

**2. [Consistency] CraftingScreen.test.ts.** Beyond the plan's list: the character fixture gained `vendorSellMod: 100n` (the Creates card needs it for the sell value), the screen-level XSS cases use an output template that carries the markup name (the card's h4 is the output name, not the recipe name), the mobile Craft text is now the full craftLabel, and the Craft aria-label is the model's 'Craft {made} {name}' (or 'Missing materials for {name}').

**3. [Removed] Old cases.** The five RecipeDetail cases about the Recipe kicker, tiles and the tier word were removed from CraftingScreen.test.ts; their replacements are in RecipeDetail.test.ts.

No case-colliding file names: `RecipeDetail.test.ts` is new and no tracked file differs from it only by case.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-50-148 (the count is clamped by the shared maxCraftCount; the server refuses 0, above 99 and any shortfall), T-50-149 (the 'craft' runner key ignores repeats while pending: tested) and T-50-150 (text nodes only: escape tests on recipe, output, material and essence names) are implemented.

## Self-Check: PASSED

- Files exist: src/crafting/RecipeDetail.vue, src/crafting/RecipeDetail.test.ts, src/crafting/CraftingScreen.test.ts.
- Commits 01432592 and 40cafa9e exist on master.
