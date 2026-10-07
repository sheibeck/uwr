---
phase: 50-ledger-screens-character-and-economy
plan: 34
subsystem: inventory-inspector-and-salvage-result
tags: [vue, inventory, inspector, salvage, result-card, mobile, client, gap-closure]
status: complete

requires:
  - phase: 50-31
    provides: "salvagePreview, resultCardView, ledger.lastResult, outputRecipes"
  - phase: 50-33
    provides: "ResultCard, useActionResult, InlineConfirm warning"
provides:
  - "salvageNeedsConfirm (inspector.ts); mock 10a labels (Equip, Unequip, Use, Eat, Learn recipe)"
  - "Equipped items: Salvage visible but aria-disabled with the reason, no reducer call"
  - "The salvage confirm names the yield from salvagePreview (warning icon, Salvage / Keep it)"
  - "Inventory hosts the shared result card after a salvage (Open crafting on desktop, Read scroll when a scroll dropped, bottom sheet on mobile)"
affects: [50-36, 50-37, 50-38]

key-files:
  modified:
    - src/inventory/inspector.ts
    - src/inventory/Inspector.vue
    - src/inventory/inspector.test.ts
    - src/inventory/Inspector.component.test.ts
    - src/inventory/InventoryScreen.vue
    - src/inventory/InventoryScreen.test.ts

key-decisions:
  - "Mock 10a labels supersede the UI-SPEC 'Equip item' checker note: the primary reads Equip, Unequip, Use, Eat, Learn recipe on both layouts (mobileLabel equals label)"
  - "House destructive-confirm styling kept (Keep it primary, Salvage in the danger style) with the mock copy and icon"
  - "No scroll line in the preview: the result card shows a scroll only when the server's row reports it"
  - "The bag-full salvage reason is gone; equipped is refused up front and salvage no longer needs free bag space"

requirements-completed: [LDG-01, LDG-02]

completed: 2026-10-06
---

# Phase 50 Plan 34: Inventory follows mock 10a Summary

The inspector's Salvage now has the PhRecycle icon, refuses equipped items up front, and confirms with the yield named from the shared rule ("Salvage destroys this item. You'll get 2 Rough Hide, and maybe a reagent."). After a salvage the Inventory screen opens the shared result card with exactly what the server reported. No server, bindings or hub change.

## Commits

| Commit | Message |
|--------|---------|
| bda6f07c | feat(50-34): inspector salvage per mock 10a: short labels, PhRecycle, equipped refused, confirm names the yield (Task 1) |
| 89a20887 | feat(50-34): Inventory hosts the shared result card after a salvage: Open crafting, Read scroll, desktop and mobile (Task 2) |

## What changed

- **inspector.ts.** Primary labels are the short words on both variants. `salvageNeedsConfirm(instance, template, affixes)` is exported (rarity above common, a craft quality, or any non-implicit affix; equipped no longer matters). The salvage block is `visible = isSalvageableTemplate`, `available = visible and not equipped`, `reason = "Equipped items can't be salvaged."` when equipped. `salvagePrompt` and the bag-full salvage reason are deleted.
- **Inspector.vue.** `preview = salvagePreview(...)` with `outputRecipe` passed only once `ledger.outputRecipesApplied` is true (so no count is named while the recipe cap is unknown). The Salvage button renders `PhRecycle` (aria-hidden) and the text 'Salvage' on card and dock. `runSalvage` is one `salvageItem` call under the 'item-salvage' key; the unequip branch and `stillEquipped` are deleted. `InlineConfirm` gets `warning`, `preview.confirmText` and `confirm-label="Salvage"`.
- **InventoryScreen.vue.** `useActionResult({ runner, lastResult, keys: { 'item-salvage': 'salvage' }, fallbackFocus: focusAfterResult })`, `resultView` through `resultCardView`, actions (Open crafting with PhHammer on desktop only; Read scroll with PhBookOpen, primary, pending on 'item-learn', only when the view carries a scroll instance), `onResultAction`, and `<ResultCard>` as the last child of the ready template. `restoreFocusAfterRemoval` returns while the card is open. `.inventory-screen` is `position: relative`.

## TDD evidence and gate counts

- **Task 1.** RED (component run, model already written): `Inspector.component.test.ts` 12 failed; the model tests were written with the model in one step, so their RED run was not captured separately (they passed first time, 55 passed). GREEN: `vitest run src/inventory/Inspector.test.ts Inspector.component.test.ts src/ledger` 14 files, 255 tests pass; then `src/inventory src/ledger src/styles` 21 files, 396 pass; `vue-tsc -b` exit 0.
- **Task 2.** RED: `InventoryScreen.test.ts` 17 failed of 68 (every new card test; the negative cases pass trivially before the code). GREEN: 68 of 68. Mutation check: removing the `result.shown` guard in `restoreFocusAfterRemoval` fails the focus test (after strengthening the test to start from lost focus), restored afterwards. Final: `vitest run src/inventory src/ledger src/styles src/frame` 40 files, 755 tests pass; `vue-tsc -b` exit 0.
- **Greps.** `export function salvageNeedsConfirm` 1; `Equipped items can't be salvaged.` 1; `unequipped first` 0; `stillEquipped` 0; `PhRecycle` 3 in Inspector.vue; `salvagePreview(` 1; `useActionResult(` 1; `<ResultCard` 1; `'item-salvage': 'salvage'` 1; `learnRecipeScroll` in InventoryScreen.vue 1; `position: relative` 1; no `replaceAll`, `.at(`, `Object.hasOwn` or banned word.

## Deviations from Plan

**1. [Rule 1 - Bug] Open crafting uses the screen id 'craft'.** The plan says `frame.openScreen('crafting')`, but `ScreenId` is `'map' | 'bag' | 'stats' | 'craft' | ...`; `'crafting'` failed vue-tsc. The code and the test use `'craft'`.

**2. [Interpretation] Footer copy.** The plan's behavior text says the salvage card footer reads 'Items went to your backpack. Also written to your log.'; the plan 50-31 model (and its tests) write 'Materials went to your backpack. Also written to your log.' for a salvage. The screen test pins the model's text; the model was not changed.

**3. [Rule 3 - Blocking] Path case.** The model test file is tracked as `src/inventory/inspector.test.ts` (lowercase), which is the same path as the plan's `Inspector.test.ts` on this filesystem; the existing file was edited and no second file was created.

**4. Test-only.** The InventoryScreen `worldContext` fixture gained `lastResult`, `outputRecipes` and `outputRecipesApplied` (applied, no recipe) and an `openScreen` spy; three existing label expectations in InventoryScreen.test.ts ('Equip item', 'Unequip item') were updated to the mock labels.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-50-142 (equipped refused client-side, no reducer call, tested on card and dock), T-50-143 (text nodes; markup tests on the confirm prompt and the card), T-50-144 (runner keys 'item-salvage' and 'item-learn'; second Read scroll click ignored while pending, tested) and T-50-145 (arm-and-seq rule; no card for a row present at mount or arriving with no salvage started, tested) are implemented.

## Deferred UAT (milestone end)

Salvage a rare item at 1280 and at 390x844, read the confirm (yield named), check the result card, and Read scroll when a scroll drops. Try Salvage on an equipped item (disabled, reason shown).

## Self-Check: PASSED

- Files exist: the six modified files above and this SUMMARY.
- Commits bda6f07c and 89a20887 exist on master.
