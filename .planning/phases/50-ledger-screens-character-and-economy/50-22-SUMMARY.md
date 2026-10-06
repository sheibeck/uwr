---
phase: 50-ledger-screens-character-and-economy
plan: 22
subsystem: client-crafting
tags: [vue, crafting, screen, mobile]

requires:
  - phase: 50-12
    provides: "FrameControls isDesktop, ScreenDef.meta slot"
  - phase: 50-21
    provides: "craftingModel, ReagentPicker"
provides:
  - "src/crafting/CraftingScreen.vue: the Crafting body (desktop columns and mobile list and detail views)"
  - "src/crafting/CraftingMeta.vue: header meta (recipes known and the station tag)"
  - "src/crafting/MaterialsOnHand.vue, RecipeList.vue, RecipeDetail.vue"
affects: [50-23 screen registration]

tech-stack:
  added: []
  patterns:
    - "A list component that owns its filters also keeps the desktop selection valid and reports it with a select event (null when no row is visible)"

key-files:
  created:
    - src/crafting/MaterialsOnHand.vue
    - src/crafting/RecipeList.vue
    - src/crafting/RecipeDetail.vue
    - src/crafting/CraftingMeta.vue
    - src/crafting/CraftingScreen.vue
    - src/crafting/useWideLayout.ts
    - src/crafting/CraftingScreen.test.ts
  modified:
    - src/crafting/craftingModel.ts
    - src/crafting/craftingModel.test.ts
    - src/styles/designContract.test.ts

key-decisions:
  - "Components Plan 23 registers: CraftingScreen (body, no props) and CraftingMeta (ScreenDef.meta, no props). CraftingMeta shows the recipes-known count on both layouts and the station tag or 'No crafting station here' on desktop only; the mobile list view carries the station line itself"
  - "Which Materials form is mounted (column at 1200px and wider, disclosure inside the list below) comes from a matchMedia query in useWideLayout, so exactly one form exists in the page; the 900px shell switch is unchanged"
  - "RecipeList owns the category and craftable filter state, auto-selects the first visible row on desktop and emits select(null) when nothing is visible; it exposes focusRow(id) and emptyText (the detail panel shows the list's empty text when no row is visible)"
  - "The mobile list view stays mounted (v-show) while the detail view is open, so the filters survive a visit and the back button can focus the row it came from"
  - "Discover recipes appears in MaterialsOnHand (column, pinned) and RecipeList (after the rows, and in the no-recipes empty state), each with the station reason; the call is the same runner key so a second click is ignored"
  - "RecipeDetail holds the essence and reagent choices; they reset when the recipe changes and, after a craft, only the choices whose items are used up clear (the essence takes the reagent slots with it)"
  - "Reagent and essence slots are aria-disabled without a station (UI-SPEC Interaction States)"

requirements-completed: [LDG-10, LDG-11]

status: complete
duration: 75min
completed: 2026-10-06
---

# Phase 50 Plan 22: Crafting screen Summary

The Crafting screen composes Materials on hand, the recipe list with category chips and the craftable filter, and the selected recipe's detail with the single deterministic Quality line, the essence and reagent slots with the inline picker, the reason line, Craft and Discover recipes, as columns in the desktop drawer and as a list view and a detail view in the 390x844 sheet, with one action runner shared with the notice line.

## Components Plan 23 registers

- `CraftingScreen` (`src/crafting/CraftingScreen.vue`): the screen body, no props.
- `CraftingMeta` (`src/crafting/CraftingMeta.vue`): the `ScreenDef.meta` component, no props.

## Other components

- `MaterialsOnHand` props `mode: 'column' | 'disclosure'`, `runner`, `mobile?`, `showDiscover?`; no emits. Column: `h6`, a name and count grid, Discover pinned under it. Disclosure: collapsed ghost button `Materials on hand · {n}` (`aria-expanded`, `aria-controls` an always-present region).
- `RecipeList` props `selectedId`, `mobile?`, `runner`, `showMaterialsDisclosure?`, `showDiscover?`; emits `select(recipeId | null)`; exposes `focusRow(id)` and `emptyText`. Chips (group `Recipe category`), the real `Show only craftable` checkbox (Nocturne `.radio`, squared `.dot`, unchecked by default), rows as `aria-pressed` buttons with the model's aria-label, the three empty states and `Show all {n} recipes`.
- `RecipeDetail` props `recipeId`, `runner`, `mobile`; no emits. The `Quality` h6 with the tier word in its craft color and the hint, `Optional reagent` with the essence slot, the reagent slots and the inline `ReagentPicker`, the reason line and Craft (`Craft {name}` on desktop; `Craft` with the full aria-label on mobile). Craft runs `runner.run('craft', () => reducers.craftRecipe(args))` with `craftArgs` (unset ids omitted).
- `useWideLayout()` and `WIDE_QUERY` (`(min-width: 1200px)`).

## Task commits

1. `5e9e3b48` materials on hand, recipe list with filters, crafting header meta (and the icon guard fix, below)
2. `9c7cf7e9` recipe detail and the crafting screen composition

## Verification

- `pnpm exec vitest run src/crafting src/ledger src/styles --maxWorkers=2`: 14 files, 261 tests passed (CraftingScreen.test.ts 61: CraftingMeta 3, MaterialsOnHand 8, RecipeList 14, RecipeDetail 20, desktop screen 8, mobile screen 8; craftingModel 31 after the stationHere test).
- Full gate: `pnpm exec vitest run --dir src --maxWorkers=2`: 140 files, 3050 tests passed. `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "craftRecipe(" src/crafting/RecipeDetail.vue` is 1; `grep -c "researchRecipes({ characterId"` is 1 in MaterialsOnHand.vue and 1 in RecipeList.vue.
- The rendered-output tests (RecipeDetail on both layouts, desktop and mobile screens) assert no `%` and no `Likely quality` in a mounted gear recipe.

## Deviations from Plan

**1. [Rule 3 - Blocking] The icon import guard flagged `./MaterialsOnHand.vue`**
- **Found during:** Task 1 (src/styles run)
- **Issue:** `designContract.test.ts` matches the word `material` in any import specifier as an icon library (`@mui`-style material icons), so importing the plan's own file name `MaterialsOnHand.vue` failed "client source uses Phosphor icons only".
- **Fix:** the library pattern is now applied to package specifiers only (not paths starting with `.`); two assertions added (a relative `./MaterialsOnHand.vue` passes, `@iconify/vue` is still flagged). **Commit:** `5e9e3b48`.

**2. [Interpretation] Additive helpers**
- `stationHere(locationId, locations)` was added to `craftingModel.ts` (tested) so the meta, list, materials and detail read the station one way; `useWideLayout.ts` was added for the Materials form switch. Neither is in the plan's file list.

**3. [Interpretation] Singular reagent line**
- The line reads `Standard quality takes up to 1 reagent.` (see 50-21); `Reinforced` and `Exquisite` use the plural.

## Known Stubs

None.

## Threat Flags

None. T-50-71 (text nodes only; escape tests for rows, detail tiles, materials and picker options, on both layouts), T-50-72 (Craft is pre-gated with the shared planCraft; the server validates before it mutates), T-50-73 (the runner ignores a second Craft or Discover until the first settles; tested) hold.

## Self-Check: PASSED

- FOUND: src/crafting/MaterialsOnHand.vue, RecipeList.vue, RecipeDetail.vue, CraftingMeta.vue, CraftingScreen.vue, useWideLayout.ts, CraftingScreen.test.ts
- FOUND commits: 5e9e3b48, 9c7cf7e9
