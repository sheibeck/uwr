---
phase: 50-ledger-screens-character-and-economy
plan: 31
subsystem: ledger-client-data-and-models
tags: [vue, ledger, hub, subscriptions, result-card, item-details, salvage-preview, client, gap-closure]

requires:
  - phase: 50-28
    provides: "salvageMaterialYield, salvageReagentDefs, SALVAGE_REAGENT_CHANCE_PCT, FOOD_BUFF_LABELS, the result line codec"
  - phase: 50-30
    provides: "tables.myActionResult (row type ActionResult), reducers.craftRecipeCount, regenerated bindings"
provides:
  - "LedgerData.lastResult, outputRecipes and outputRecipesApplied; craftRecipeCount forwarded unchanged"
  - "queries.myActionResult and queries.recipesByOutput"
  - "itemDetails, itemStatEntries, unitSellValue, foodEffect (src/ledger/itemDetails.ts)"
  - "resultCardView (src/ledger/resultCard.ts)"
  - "salvagePreview (src/ledger/salvagePreview.ts)"
affects: [50-32, 50-33, 50-34, 50-35, 50-36, 50-37, 50-38]

key-files:
  created:
    - src/ledger/itemDetails.ts
    - src/ledger/itemDetails.test.ts
    - src/ledger/resultCard.ts
    - src/ledger/resultCard.test.ts
    - src/ledger/salvagePreview.ts
    - src/ledger/salvagePreview.test.ts
  modified:
    - src/ledger/queries.ts
    - src/ledger/queries.test.ts
    - src/ledger/ledgerContext.ts
    - src/ledger/ledgerData.ts
    - src/ledger/ledgerData.test.ts

key-decisions:
  - "lastResult copies the lastSale pattern: the per-sender view with no WHERE, an immediate swap keyed by the active character and a characterId filter"
  - "outputRecipes is keyed by every owned template id (not the slot-filtered ones), so it never forms a reactive cycle with the template subscription"
  - "salvagePreview drops the count (countKnown false, no x-count text, no number in the confirm) while the recipe cap cannot be read, so a capped yield is never overstated"
  - "A salvage preview never lists a scroll line; the result card shows one only when the server's row reports it"

requirements-completed: [LDG-01, LDG-02, LDG-10, LDG-11]

status: complete
completed: 2026-10-06
---

# Phase 50 Plan 31: Client hub and models for the result card, item details and salvage preview Summary

The ledger hub now reads the active character's own result row and the recipes behind owned items and forwards the batch craft reducer, and three pure, tested models turn server data into the result card content, the item details and the salvage yield preview. No component, server or bindings change.

## Commits

| Commit | Message |
|--------|---------|
| f2ef832a | feat(50-31): hub lastResult, outputRecipes, template key extension and craftRecipeCount forwarding (Task 1) |
| 4dc144eb | feat(50-31): itemDetails and resultCardView models (Task 2) |
| a8bbcc5a | feat(50-31): salvagePreview naming the guaranteed yield and the reagent (Task 3) |

## What changed

- **queries.ts.** `myActionResult` is `toSql(tables.myActionResult)` with no WHERE. `recipesByOutput(ids)` is an OR chain on `output_template_id` and refuses an empty list. Every existing string is unchanged.
- **ledgerContext.ts.** `LedgerReducers.craftRecipeCount` (craftRecipe kept), `LedgerData.lastResult`, `outputRecipes`, `outputRecipesApplied`, and the inert values (null, empty Map, false).
- **ledgerData.ts.** `lastResultKeyed` (immediate swap, filter on characterId). `outputRecipesKeyed` is a second binding on recipe_template keyed by the owned template ids, filtered by `set.has(row.outputTemplateId)`; the map keeps the lowest recipe id per output. The template key now also loads the result's templateId, every decoded line's templateId and each output recipe's requirement templates. Both new bindings join `keyed` for reset and dispose. The header scope list names them.
- **itemDetails.ts.** Stat entries in the shared STAT_ROWS order (signed rows '+n', Armor Class, Damage and DPS plain), `unitSellValue` through `sellPayout` and `perkBonusByField` (null for a quest item), `foodEffect` through `FOOD_BUFF_LABELS`, and `itemDetails` (type parts with the short level tone, effect, meta, description). A generated dagger shows Damage 4 and DPS 5 with the new sentence and with the old two-material description.
- **resultCard.ts.** `resultCardView` for craft (Crafted, x-tag, Used lines with U+2212, quality word, instance stats and Equip id, food effect), salvage (Received lines with 'now n', Bonus and Recipe found tags only for those line kinds, scroll instance only when the row is in the bag, 'Nothing usable was left.') and Discover (Nothing new with a tip, or the recipes found). Malformed linesJson gives no lines; names are carried as plain strings.
- **salvagePreview.ts.** Guaranteed material from the shared `salvageMaterialYield` with the MATERIAL_DEFS value and the recipe cap, the exact reagent the server would pick (`(instance id + character id) % defs`), the confirm text for each case, and null for a non-salvageable template.

## TDD evidence and gate counts

- **Task 1.** RED: ledgerData.test.ts and queries.test.ts, 12 failed of 34 (every new behavior: result binding, output recipes, template key, craftRecipeCount forward, query strings, inert values). GREEN: ledgerData, queries and gameDataAlias, 3 files, 59 tests pass; vue-tsc exit 0.
- **Task 2.** RED (resultCard): `Cannot find module './resultCard'`, no tests ran. itemDetails.test.ts was written before the module but the RED run was not captured separately (the module was written before its first run; its 13 tests passed first time). GREEN: itemDetails 13 and resultCard 15 tests pass; compare and itemModel tests pass unchanged (4 files). One test expectation was wrong first (a dagger gets PhKnife, not PhSword) and was corrected in the test.
- **Task 3.** RED: `Cannot find module './salvagePreview'`, no tests ran. GREEN: salvagePreview 14 tests pass.
- **Full client suite** (`pnpm exec vitest run --dir src --maxWorkers=2`): 145 files, 3220 tests, all pass. `pnpm exec vue-tsc -b` exit 0.
- **Greps.** `craftRecipeCount: (a) => r.craftRecipeCount(a)` 1 in ledgerData.ts; `salvageMaterialYield(` 1 and `SALVAGE_REAGENT_CHANCE_PCT` 2 in salvagePreview.ts; `from 'vue'` 0 in itemDetails.ts and resultCard.ts; no `replaceAll`, `.at(`, `Object.hasOwn(` or banned word in the three models.

## Copy decisions (Claude's discretion, per the plan)

- One footer per kind instead of the mock's two variants: craft 'Items went to your backpack. Also written to your log.', salvage 'Materials went to your backpack. Also written to your log.', Discover 'Also written to your log.'
- 'now {n}' is shown on salvage gains in both screens (the Inventory mock shows it; the crafting mock omits it).
- The Discover tip is 'Gather other materials to find new recipes.', rewritten for the server's real rule (Discover generates recipes from carried materials, and generated recipes have no scrolls). The nothing-new sub reads 'You already know every recipe your materials allow.'
- The quality word is added to the craft sub: 'Added to your bag · Reinforced quality'.
- Discover kicker is 'Discover recipes' (as the mock). Announce strings: 'Crafted 3 Herbal Draught.', 'Salvaged {name}. Received 2 Copper Ore, 1 Ancient Rune.' and 'Discover recipes found 2 new recipes: A, B.'

## Deviations from Plan

None - plan executed as written. Small interpretations, recorded for the component plans:
- `ResultCardView.kind` is typed `string` and an unknown kind returns a neutral 'Done' card instead of throwing (the server only writes the three kinds).
- `equipInstanceId` is null when the crafted gear is already equipped, as well as when the instance is gone or the item is not gear.
- The type line of non-gear uses `categoryWord`, so a well-fed food reads 'Food' (as the plan says) and a non-well-fed consumable reads 'Consumable' (as the bag does). The armor type 'none' (generated weapons) is omitted from the type line.
- `salvagePreview` material.count is the upper bound (recipe cap not applied) when countKnown is false; components must check countKnown before showing it.
- Test-only: itemDetails.test.ts used `generatedOutput` through `recipeCandidates` to build the dagger instead of a literal fixture, so the sentence stays the server's.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-50-132 (models return plain strings, markup tests in all three), T-50-133 (lastResult from the per-sender view, characterId filter, immediate swap, tested), T-50-134 (countKnown false drops the number while outputRecipes has not applied, tested) and T-50-135 (decodeResultLines never throws, malformed JSON test) are implemented.

## Self-Check: PASSED

- Files exist: itemDetails.ts and test, resultCard.ts and test, salvagePreview.ts and test, and the edited queries.ts, queries.test.ts, ledgerContext.ts, ledgerData.ts, ledgerData.test.ts.
- Commits f2ef832a, 4dc144eb and a8bbcc5a exist on master.
