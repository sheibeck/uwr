---
phase: 50-ledger-screens-character-and-economy
plan: 21
subsystem: client-crafting
tags: [vue, crafting, model, reagents]

requires:
  - phase: 50-02
    provides: "planCraft, craftQualityForMaterialName, craftQualityUpgrade, isGearRecipe"
  - phase: 50-11
    provides: "itemModel, STAT_ROWS"
  - phase: 50-13
    provides: "shared Ledger parts and action runner"
provides:
  - "src/crafting/craftingModel.ts: recipe rows, filters, materials, recipe detail, essence and reagent options, Craft availability and arguments"
  - "src/crafting/ReagentPicker.vue: inline listbox picker"
affects: [50-22 crafting screen]

tech-stack:
  added: []
  patterns:
    - "The client calls the same planCraft the reducer runs, so every Craft refusal the client shows is the server's own verdict"

key-files:
  created:
    - src/crafting/craftingModel.ts
    - src/crafting/craftingModel.test.ts
    - src/crafting/ReagentPicker.vue
    - src/crafting/ReagentPicker.test.ts
  modified: []

key-decisions:
  - "Craft availability counts the backpack room that the consumed materials free up (the server removes the inputs before it adds the output), so a full bag whose whole stacks are consumed is not wrongly blocked; a stackable output joins an existing stack"
  - "The reagent slots line is singular for one slot ('Standard quality takes up to 1 reagent.') and plural otherwise; the contract text '{n} reagents' is otherwise unchanged"
  - "essenceOptions takes the quality key; reagentOptions takes the chosen essence key and the slots' chosen ids, with exceptSlot so the slot being changed does not count against availability; an exhausted reagent is listed with the hint 'All chosen'"
  - "A modifier_missing refusal names the reagent by taking it from planCraft's own message, so no second lookup can disagree with the server"
  - "Materials on hand uses the template rarity (common names use the plain text color); recipe rows with an unknown recipe type show category 'Other' in the meta and appear under All only"

requirements-completed: [LDG-10, LDG-11]

status: complete
duration: 35min
completed: 2026-10-06
---

# Phase 50 Plan 21: Crafting model and reagent picker Summary

One tested model derives every count, filter, quality line and Craft reason of the crafting screen from the server's own shared rules (planCraft, the quality rule, the essence gate and the reagent slot table), and an inline listbox picker lets an essence or a reagent be chosen with the keyboard or pointer.

## Model exports (src/crafting/craftingModel.ts)

- `RECIPE_FILTERS` (All, Weapon, Armor, Accessory, Consumable), `recipeCategory(recipeType)` (null for an unknown type), `bagCount(items, templateId)` (non-equipped quantities), `recipesKnownText(n)`.
- `recipeRows(input: { known, recipes, templates, items }, { filter, onlyCraftable }): RecipeRow[]` with `{ id, name, category, tier, meta ('Weapon · T1'), requirements: { templateId, name, have, need, met, text }[], craftable, ariaLabel }`; craftable first, then name.
- `materialsOnHand(items, templates): { templateId, name, count, color }[]` (materials, essences and reagents by name).
- `recipeDetail(input, recipeId, characterLevel): RecipeDetail | null` with `{ id, name, gear, metaParts, tiles ('{have} of {need}' and '{have} / {need}'), qualityKey, quality, qualityHint, slots, slotsLine, outputTemplateId }`.
- `essenceOptions(items, templates, qualityKey)`, `reagentOptions(items, templates, essenceKey, chosen, exceptSlot?)` returning `PickerOption { templateId, name, color, have, hint, eligible }`; helpers `essenceKeyOf(template)`, `essenceMagnitudeText(essenceKey)` ('+2 per reagent'), `reagentEffectText(essenceKey, reagentName)` ('+2 INT').
- `craftAvailability({ recipe, station, templates, items, choice }): { available, reason, plan }` with the reasons in the UI-SPEC order, and `craftArgs(characterId, recipeTemplateId, choice)` (only the chosen ids; reagents fill modifier1 to modifier3 in slot order and are sent only with an essence). `CraftChoice = { essenceId: bigint | null, reagentIds: (bigint | null)[] }`.

## ReagentPicker

Props `kind: 'essence' | 'reagent'`, `options: PickerOption[]`, `mobile?: boolean`; emits `choose(templateId)` (eligible options only) and `close` (Escape, caught in the capture phase and prevented). A `role="listbox"` (`aria-label` `Choose essence` or `Choose reagent`, `aria-activedescendant`) of `role="option"` rows (`aria-selected` on the active one, `aria-disabled` when ineligible), focused when it opens; the empty lists show `No essences on hand.` or `No reagents on hand.`. Options are 32px high on desktop and 44px on mobile.

## Task commits

1. `536345b9` crafting model
2. `c8545fea` inline listbox picker for an essence or a reagent

## Verification

- `pnpm exec vitest run src/crafting src/styles --maxWorkers=2`: 6 files, 103 tests passed (craftingModel 30, ReagentPicker 9).
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "planCraft(" src/crafting/craftingModel.ts` is 1; `grep -c "@game-data/crafting_rules"` is 1; `grep -c 'role="listbox"' src/crafting/ReagentPicker.vue` is 1.

## Deviations from Plan

None to scope. The interpretations are listed under key decisions; the full-bag rule (freed room) is a stricter-correct reading of "hasBackpackSpace with stacking".

## Known Stubs

None.

## Threat Flags

None. T-50-68 (the client pre-gates with the same planCraft the server runs before it mutates; parity test), T-50-69 (names pass through as plain text; escape tests in the model and the picker), T-50-70 (quality line from craftQualityForMaterialName, no invented odds) hold.

## Self-Check: PASSED

- FOUND: src/crafting/craftingModel.ts, craftingModel.test.ts, ReagentPicker.vue, ReagentPicker.test.ts
- FOUND commits: 536345b9, c8545fea
