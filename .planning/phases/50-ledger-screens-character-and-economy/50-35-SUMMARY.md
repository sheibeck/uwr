---
phase: 50-ledger-screens-character-and-economy
plan: 35
subsystem: crafting-model-and-item-card
tags: [vue, crafting, model, creates-card, recipe-list, craft-count, client, gap-closure]

requires:
  - phase: 50-28
    provides: "maxCraftCount, MAX_CRAFT_COUNT, planCraft count, primaryMaterialTier, generatedDescription"
  - phase: 50-31
    provides: "itemDetails, unitSellValue, ItemDetails"
provides:
  - "craftingModel: recipe row canMake/statusText/statusTone/nameColor/icon, craftQuantity, craftAvailability count, craftCountArgs, usesRows, recipeDetail.qualityLine, createsCard, materialRows"
  - "ItemCard.vue: the Creates and Salvage item card (desktop and mobile forms)"
  - "RecipeList rows per mock 9a (icon tile, rarity name, short type, Can make N or Missing status)"
affects: [50-36, 50-37, 50-38]

key-files:
  created:
    - src/crafting/ItemCard.vue
    - src/crafting/ItemCard.test.ts
  modified:
    - src/crafting/craftingModel.ts
    - src/crafting/craftingModel.test.ts
    - src/crafting/RecipeList.vue
    - src/crafting/CraftingScreen.test.ts

key-decisions:
  - "Server categories kept (All, Weapon, Armor, Accessory, Consumable), per CONTEXT 'follow the recipe categories the server actually generates'"
  - "Uncraftable rows stay at full opacity (house rule, UI-SPEC difference 24): muted name, red status line; the name's inline rarity color is applied only to craftable rows so the muted class wins"
  - "The item name stays an h4 at 20px/500 on both desktop and mobile (the mock's 17/16 are off the type scale)"
  - "Meta says 'Stackable' (from itemDetails), not the mock's 'Stacks to 99', since stacks have no cap today"
  - "Can make N and the stepper maximum are the server's maxCraftCount on the same planCraft input craft_recipe_count validates, so a quantity the stepper reaches is one the server accepts"

requirements-completed: [LDG-10, LDG-11]

status: complete
completed: 2026-10-06
---

# Phase 50 Plan 35: Crafting model, Creates item card and mock 9a recipe rows Summary

The crafting model now knows how many the bag allows, how the stepper and Craft read, what the output is and does, and which materials a recipe uses, all from the server's own shared rules; the Creates and Salvage item card exists as a component, and the recipe list shows mock 9a rows. RecipeDetail and the screen layout are untouched (plans 50-36 and 50-37).

## Commits

| Commit | Message |
|--------|---------|
| f1e61b20 | feat(50-35): crafting model row status, craftQuantity, count-aware availability and args, Uses rows, quality line, createsCard, materialRows (Task 1) |
| 6a9afa7c | feat(50-35): ItemCard Creates and Salvage card and the mock 9a recipe rows (Task 2) |

## What changed

- **craftingModel.ts.**
  - `RecipeRow` gains `canMake` (maxCraftCount with no essence times the output count), `statusText` ('Can make N' or 'Missing A, B'), `statusTone`, `nameColor` (text color for a common or missing output) and `icon` (PhPackage while the output template is missing). The aria label now ends ', can make N' or ', missing {names}'. Sort order, filters and `craftable` are unchanged. If every requirement is met alone but a merged shared template is not, the row names that template from the planCraft refusal.
  - `craftQuantity(input, requested)` gives quantity (1..max, 1n at max 0), max, made, canIncrease/canDecrease, 'Max n', 'Craft {made}× {name}' (U+00D7; plain 'Craft {name}' at made 1), 'Missing materials', 'for n crafts' and the aria label.
  - `craftAvailability` takes `count` (passed to planCraft, so the shortfall message is for the whole batch); the bag-room check is unchanged (the server has no capacity gate on a batch either).
  - `craftCountArgs` is craftArgs plus `count`.
  - `usesRows` (have / need x quantity, rarity color, icon), `recipeDetail.qualityLine` ('Quality: Reinforced (+1 damage), set by Tier 2 Iron Ore'; armor first, then damage, as the server adds the bonus; null for a consumable), `createsCard` (itemDetails over `sumItemStats(template, [])`) and `materialRows` (icon, highlighted, short, plus used materials with 0 on hand) were added. Every existing export is kept.
- **ItemCard.vue (new).** Desktop: accent kicker, 64px icon box with a 1px rarity ring and an 18px 22% glow built from the color token, 'x2' yield tag, h4 name in the rarity color, type line with the short part in red, a 3-column `.stat-tiles` grid (8px gap), effect with PhHeartbeat in light green, meta, italic description. Mobile: 56px icon box with ring only, stat chips (`.tag.tag-neutral`, '{label} {text}'), effect and meta, no kicker or description. Text nodes only.
- **RecipeList.vue.** Each row is a flex row: a 32px `.row-icon` tile (output icon in the name color), `.row-name` (14px/500), `.row-meta`, and `.row-status` in the `met` (con-light-green) or `short` (con-red) class. The per-material requirement spans and their styles are gone. Selection, filters, the craftable box, empty states, Discover and focusRow are unchanged; mobile rows keep min-height 56px.

## Mock-to-scale mappings used

| Mock | Used |
|------|------|
| card padding 14, gap 14 | 16, 16 |
| tile padding 6px 9px, gap 6 | 4px 8px, 8 |
| row padding 8px 10px, gap 10 | 8px 16px, 8 |
| icon tile 34px | 32px |
| name 17 | 20 (h4); mobile 16 also 20 |
| type and meta 11.5, tile label 10.5, effect 12.5, yield tag 10.5 | 12, 10, 12, 10 |
| green and red oklch | `--color-con-light-green`, `--color-con-red` |
| icon box radius 10 | `--radius-md` (8px) |

## TDD evidence and gate counts

- **Task 1.** RED: `craftingModel.test.ts` 31 failed of 64 (every new function and field: `materialRows is not a function` and the like). GREEN: craftingModel and generatedRecipes, 2 files, 71 tests pass; `vue-tsc -b` exit 0. One existing assertion changed on purpose (the row aria label for a craftable recipe, 'craftable' becomes 'can make 1').
- **Task 2.** RED not captured separately: ItemCard.vue was written before its tests were first run (its 7 tests passed first time), and the RecipeList test edits were made before the template edit but not run in between. GREEN: `vitest run src/crafting src/styles` 9 files, 218 tests pass (designContract, colors.guard, tokens.client pin 23, scrollbars included); `vue-tsc -b` exit 0.
- **Full client suite** (`pnpm exec vitest run --dir src --maxWorkers=2`): 149 files, 3320 tests, all pass.
- **Greps.** `export function craftQuantity` 1, `maxCraftCount(` 2, `export function createsCard` 1, `export function materialRows` 1, `export function craftCountArgs` 1 in craftingModel.ts; `stat-tiles` 2 and `PhHeartbeat` 2 in ItemCard.vue; `row.statusText` 1 and `req.text` 0 in RecipeList.vue; `v-html` and `<svg` 0 in both; no `replaceAll`, `.at(`, `Object.hasOwn(` or banned word.

## Deviations from Plan

**1. [Rule 1 - Consistency] One CraftingScreen.test.ts assertion changed in Task 1's commit.** The Task 1 model change makes the row aria label end ', can make 1', so the one-line assertion in the RecipeList describe was updated in the same commit to keep every commit green; the rest of the RecipeList test updates are in Task 2.

**2. [Interpretation] Muted name only for uncraftable rows.** The plan gives `.row-name` `color: row.nameColor` and also the house rule 'muted name' for uncraftable rows. An inline style would beat the muted class, so the inline color is applied only while the row is craftable. The icon keeps the name color.

**3. [Interpretation] Mobile name size.** The mock's 16px is equidistant from the allowed 14 and 20; the h4 stays 20px/500 as on desktop.

**4. [Process] Task 2 RED not captured** (see above).

No case-colliding file names: `ItemCard.vue` and `ItemCard.test.ts` are new and no tracked file differs from them only by case.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-50-146 (text nodes only: escape tests on ItemCard name, stat label, meta, description, effect, type line and mobile chip, and on the recipe row status and model names) and T-50-147 (Can make N and the stepper maximum use the server's maxCraftCount on the planCraft input, with 99 cap tests and an essence/reagent limit test; the server re-checks every batch) are implemented.

## Self-Check: PASSED

- Files exist: src/crafting/ItemCard.vue, src/crafting/ItemCard.test.ts, and the edited craftingModel.ts, craftingModel.test.ts, RecipeList.vue, CraftingScreen.test.ts.
- Commits f1e61b20 and 6a9afa7c exist on master.
