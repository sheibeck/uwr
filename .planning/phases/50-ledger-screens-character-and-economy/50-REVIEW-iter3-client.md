---
phase: 50-ledger-screens-character-and-economy
reviewed: 2026-10-07T05:08:08Z
depth: deep
iteration: 3
scope: "git diff bf98c7db..HEAD -- src ':!src/module_bindings' (client half of plans 50-31..50-40: hub lastResult/outputRecipes/craftRecipeCount/consolidateStacks, ResultCard + useActionResult, Inventory per mock 10a, InventoryActions, Drawer/Sheet actions slot, BackpackGrid fill grid with ResizeObserver, bagRunner, crafting three columns, RecipeDetail stepper, ItemCard, Craft/Salvage SegTabs, SalvageList/SalvageDetail, salvagePreview chance wording, tokens guard)"
files_reviewed: 60
files_reviewed_list:
  - src/crafting/CraftingScreen.test.ts
  - src/crafting/CraftingScreen.vue
  - src/crafting/ItemCard.test.ts
  - src/crafting/ItemCard.vue
  - src/crafting/MaterialsOnHand.vue
  - src/crafting/RecipeDetail.test.ts
  - src/crafting/RecipeDetail.vue
  - src/crafting/RecipeList.vue
  - src/crafting/SalvageDetail.vue
  - src/crafting/SalvageList.vue
  - src/crafting/SalvageTab.test.ts
  - src/crafting/craftingModel.test.ts
  - src/crafting/craftingModel.ts
  - src/crafting/salvageModel.test.ts
  - src/crafting/salvageModel.ts
  - src/frame/AppFrame.screens.test.ts
  - src/frame/AppFrame.vue
  - src/frame/Drawer.test.ts
  - src/frame/Drawer.vue
  - src/frame/Sheet.test.ts
  - src/frame/Sheet.vue
  - src/gameDataAlias.test.ts
  - src/inventory/BackpackGrid.test.ts
  - src/inventory/BackpackGrid.vue
  - src/inventory/EquippedSlots.vue
  - src/inventory/Inspector.component.test.ts
  - src/inventory/Inspector.vue
  - src/inventory/InventoryActions.vue
  - src/inventory/InventoryMeta.vue
  - src/inventory/InventoryScreen.test.ts
  - src/inventory/InventoryScreen.vue
  - src/inventory/backpack.test.ts
  - src/inventory/backpack.ts
  - src/inventory/bagRunner.test.ts
  - src/inventory/bagRunner.ts
  - src/inventory/inspector.test.ts
  - src/inventory/inspector.ts
  - src/ledger/InlineConfirm.vue
  - src/ledger/ItemTile.vue
  - src/ledger/ResultCard.vue
  - src/ledger/ResultCardDialog.test.ts
  - src/ledger/SegTabs.vue
  - src/ledger/itemDetails.test.ts
  - src/ledger/itemDetails.ts
  - src/ledger/itemModel.test.ts
  - src/ledger/itemModel.ts
  - src/ledger/ledgerContext.ts
  - src/ledger/ledgerData.test.ts
  - src/ledger/ledgerData.ts
  - src/ledger/parts.test.ts
  - src/ledger/queries.test.ts
  - src/ledger/queries.ts
  - src/ledger/resultCard.test.ts
  - src/ledger/resultCard.ts
  - src/ledger/salvagePreview.test.ts
  - src/ledger/salvagePreview.ts
  - src/ledger/useActionResult.test.ts
  - src/ledger/useActionResult.ts
  - src/screens/screens.ts
  - src/styles/tokens.client.test.ts
findings:
  critical: 0
  warning: 7
  info: 13
  total: 20
status: issues_found
---

# Phase 50: Code Review Report (iteration 3, client)

**Reviewed:** 2026-10-07T05:08:08Z
**Depth:** deep. Cross-file traces: `useActionResult` with `actionRunner` and `bagRunner`; `ResultCard` with `Drawer`, `Sheet`, `InlineConfirm` and `ReagentPicker` (Esc and Tab listeners); `ledgerData` and `keyedBinding` (swap semantics) with `salvagePreview`, `Inspector` and `SalvageDetail`; `salvagePreview` against `salvage_item` in `spacetimedb/src/reducers/items_crafting.ts`; `craftQuantity` against `maxCraftCount` and `planCraft`; the generated bindings for `consolidate_stacks` and `craft_recipe_count`.
**Files Reviewed:** 60
**Status:** issues_found

## Summary

This pass covers the client half of plans 50-31 to 50-40.

**What holds up:**
- **Reducer calls.** Every new call uses object syntax and its argument names match the generated bindings: `craftRecipeCount`, `consolidateStacks({ characterId })`, `salvageItem`, `equipItem`, `learnRecipeScroll`.
  - Craft again only sends what the live bag allows (`againCount`).
  - Equip and Read scroll only target instances that are still in the bag and not equipped (`resultCard.ts:191-192`, `:201-208`).
  - The Salvage tab refuses a stale equipped instance (`SalvageDetail.vue:119`).
- **Server parity.** The salvage preview calls the server's own `salvageComponents` and `salvageReagentDefs`. The reagent pick `(instance id + character id) % defs` matches `items_crafting.ts:532`. The confirm text has no digits.
- **Double submit.** Runner keys cover double submits (`craft`, `salvage`, `item-salvage`, `item-learn`, `item-equip`, `bag-organize`). Pending buttons are `aria-disabled` and send nothing.
- **Listeners.** The `ResizeObserver` is feature-detected, desktop only, re-created when `root` or `mobile` changes, and disconnected on unmount. The `bagRunner` WeakMap holds no strong reference from long-lived state back to the runner: `online` is an uncached getter and `pending` is a computed over the runner's own `shallowRef`.
- **XSS.** There is no `v-html`. Every server string is a mustache text node or attribute. Colors in `:style` come only from the `rarityColor`, `nameColor` and `CRAFT_COLORS` lookup tables, never from raw server strings.
- **Design guards.** Font sizes, weights and spacing in every added style line are on the allowed scales (one `margin: 8px 0 0`, which is on scale). There is no `replaceAll`, `.at(`, `Object.hasOwn`, `<svg` or the banned word, and no literal colors.
- **Gates.** The scoped suites pass: `npx vitest run src/crafting src/inventory src/ledger src/styles src/frame src/screens src/gameDataAlias.test.ts` gives 51 files, 1106 tests passed.

**Main concerns:**
1. **The result card is not fully honest or accessible.**
   - An empty salvage roll still says "Broken down into materials" and "Materials went to your backpack" (WR-01).
   - The live region never re-announces an identical result, for example Craft again with the same count, or two salvages that both came back empty (WR-02).
   - The card's actions ignore the offline state (WR-06).
2. **The salvage preview can name the wrong components.** `outputRecipesApplied` stays true while the output-recipe subscription is still swapping. During that window a freshly crafted item is treated as "no recipe makes it" and previewed with its slot material instead of its recipe inputs (WR-03).
3. **Focus and pointer flow around the card on the desktop Salvage tab.**
   - After a common item is salvaged, focus returns to a Salvage button that now names an item the player never picked (WR-04).
   - The second click of a double-click lands on the scrim and dismisses the card before it can be read (WR-05).
4. **The 50-39 relaxation of the tokens guard is too loose.** Any quoted `'--x':` in any `.vue` file defines `--x` for every file in the project (WR-07).

No Critical findings: nothing here mints, loses or misroutes server state, and the server re-validates every call.

## Earlier iterations

- The iteration-1 client fixes (CR-01 salvage confirm for crafted and affixed items; WR-01 to WR-07) and the iteration-2 client fixes (WR-01 `buy_listing`, IN-04 picker on input) are not touched by this diff, except where they were rewritten on purpose:
  - `salvageNeedsConfirm` replaces the inline rule. Same predicate, with equipped dropped because equipped is now refused.
  - The "bag full" salvage reason is gone, as 50-34 decided.
- No regression was found in the earlier focus fixes (`restoreFocusAfterRemoval`, the `fallbackFocus` paths).

## Warnings

### WR-01: An empty salvage roll says "Broken down into materials" and "Materials went to your backpack"

**File:** `src/ledger/resultCard.ts:210-224` (`sub` at `:213`, `footer` at `:218`)
**Issue:** `salvageCard` always sets `sub: 'Broken down into materials'` and `footer: 'Materials went to your backpack. Also written to your log.'`, even when `views.length === 0`.
- **How often.** With the 50-40 chance rule an empty roll is common: 34% measured, and the only outcome for a req-1 secondary.
- **What the player sees.** One card says "Broken down into materials" (also the dialog's `aria-describedby`, so a screen reader reads it on open), "Nothing usable was left." and "Materials went to your backpack". This contradicts the owner's rule that salvage wording must be honest ("never a guaranteed return").
- **Tests.** `CraftingScreen.test.ts:1830` ("an empty roll opens the card with Nothing usable was left and nothing else") asserts neither the sub nor the footer, so the contradiction is untested.

**Fix:** Branch on the lines:
```ts
const empty = views.length === 0;
sub: empty ? 'Nothing usable was left' : 'Broken down into materials',
footer: empty ? 'Also written to your log.' : 'Materials went to your backpack. Also written to your log.',
```
Add `sub` and `footer` assertions to the empty-roll test in `resultCard.test.ts` and `CraftingScreen.test.ts`.

### WR-02: The polite live region does not announce a result whose text repeats the previous one

**File:** `src/ledger/ResultCard.vue:57-71` (`liveText.value = now.announce`), `:96`
**Issue:** `liveText` is kept after close (by design, `ResultCardDialog.test.ts:327`). Assigning the same string again changes no DOM text, so no assistive technology announces anything. This affects:
- Craft again with the same count. `Crafted 3 Herbal Draught.` is identical every time. The card stays open, Done already has focus, so a screen-reader user gets no signal at all that the second batch was made.
- Two salvages in a row that both come back empty. Both read `Salvaged Iron Dagger. Nothing usable was left.`
- Two Discover runs that both read `Discover recipes found nothing new.`

**Fix:** Clear the region, then set it on the next tick. Or append an invisible per-seq discriminator, so that every new seq is a real text change:
```ts
if (!before || now.seq !== before.seq) {
  liveText.value = '';
  void nextTick(() => { liveText.value = now.announce; doneButton.value?.focus(); });
}
```
Add a test that two rows with the same `announce` and different `seq` both reach the region (observe the clear and the set).

### WR-03: While the output-recipe subscription swaps, a new item is previewed as "no recipe makes it", which names the wrong components

**File:**
- `src/ledger/ledgerData.ts:216-224`, `:306` (`outputRecipesApplied`)
- `src/game/keyedBinding.ts:85-104` (the `onApplied` swap keeps the old binding current)
- `src/inventory/Inspector.vue:79-81` and `src/crafting/SalvageDetail.vue:82-84`
- `src/ledger/salvagePreview.ts:94`, `:114-121`

**Issue:** The cause is a mismatch between two meanings of "applied".
- `outputRecipesApplied` reads `current.applied`. `keyedIdList` uses the default `onApplied` swap, so when the owned-template key changes, the old binding stays current and applied until the new one applies.
- Meanwhile `outputRecipes.get(newTemplateId)` is `undefined`, which the callers turn into `null` ("no recipe makes it"). `salvagePreview` then takes the non-craftable path and previews the slot material from `MATERIAL_DEFS`.

How to trigger it:
1. Craft a new item type, for example a Darksteel Sword, which is a template the character did not own before.
2. Switch to Salvage. The desktop list may auto-select the new sword, or the player selects it in Inventory.
3. Once the template binding has applied but before the output-recipe binding has, the detail shows `Iron Ore ×1 · 50% chance` (slot material) and the confirm says `It may return some Iron Ore.`
4. The server rolls the recipe inputs (`items_crafting.ts:455-500`), so a different material comes back.

The window is one subscription round trip, but it falls exactly on the honesty path the owner asked to protect. The comment "undefined = the hub has not applied" (`salvagePreview.ts:34`) does not hold during a swap.
**Fix:** Expose "applied for this template" instead of "the current binding has applied". One way is to keep the applied key's id set in the hub and return `undefined` for ids outside it:
```ts
// ledgerData: outputRecipeFor(templateId): RecipeTemplate | null | undefined
const appliedIds = computed(() => new Set(parseIdListKey(outputRecipesKeyed.currentKey ?? '')));
// undefined when the template id is not in the applied key yet
```
Alternatively, use `swap: 'immediate'` for this binding so that `applied` is false until the new key applies. Add a test that swaps the key (applied old, pending new) and asserts that the preview is not knowable for the new template.

### WR-04: On the desktop Salvage tab, focus returns to a Salvage button that now targets an item the player never chose

**File:** `src/crafting/SalvageDetail.vue:166-176`; `src/crafting/SalvageList.vue:348-362`; `src/ledger/useActionResult.ts:48-51`, `:67-76`
**Issue:** For a common, uncrafted, unaffixed item there is no confirm, so the opener captured when `salvage` goes pending is the main `Salvage {A}` button.
- The item leaves the bag. `SalvageList` auto-selects the next row B. The un-keyed `SalvageDetail` instance and its button survive, and the button now reads `Salvage {B}`.
- On Done or Esc, `close()` focuses the opener, which is still connected, so focus lands on a destructive control for an item the player never selected.
- The next Enter, a held Enter auto-repeating through Done, or a habitual double-tap salvages B with no confirm.

Inventory does not have this problem because it clears the selection.
**Fix:** After a salvage, return focus to the list, not the button. Either key the detail on the instance (`<SalvageDetail :key="String(salvageSelectedId)" …>`) so the old button disconnects and `fallbackFocus` focuses the selected row, or give `useActionResult` a per-key "focus the fallback" option for `salvage`. Add a test: salvage a common item on desktop, press Done, and assert that `document.activeElement` is a `.salvage-row`, not `.salvage-btn`.

### WR-05: The second click of a double-click lands on the new scrim and dismisses the result card unseen

**File:** `src/ledger/ResultCard.vue:97` (`@click.self="emit('close')"` on `.result-scrim`)
**Issue:** The card and its full-screen scrim render as soon as the server row arrives, which is often under 100 ms on the local server and well within an OS double-click interval.
- Players often double-click Craft or Salvage. The first click sends the call. The runner ignores a second click that arrives while the call is pending.
- A second click that arrives after the card has appeared hits the scrim where the button used to be, and closes the card before it is read. The card is centred, so the Craft and Salvage buttons at the bottom of the detail column are outside it.
- The result is then only in the feed, which is hidden behind the open drawer, and focus jumps back to the opener.

**Fix:** Ignore scrim clicks for a short grace period after the card opens. A timer is a client UI concern, not a reducer. Alternatively, close only on a `pointerdown` and `click` pair that both started on the scrim:
```ts
let downOnScrim = false;
// @pointerdown.self="downOnScrim = true" @click.self="downOnScrim && emit('close'); downOnScrim = false"
```
The pointer-pair approach needs no timer, and a stray second click (whose `pointerdown` came before the scrim existed) no longer closes the card. Add a test where a click event lands on the scrim with no `pointerdown` and the card stays open.

### WR-06: Result card actions are not inert while offline: they look live, do nothing and say nothing

**File:** `src/crafting/CraftingScreen.vue:166-201`; `src/inventory/InventoryScreen.vue:98-114`, `:122-126`; `src/ledger/ResultCard.vue:89-92`, `:152-164`
**Issue:** Every other ledger action follows the UI-SPEC pending and offline rule: `aria-disabled` while `!online`. The card actions only carry `pending`.
- **What happens offline.** Craft again, Equip (Crafting) and Read scroll (both screens) render as enabled buttons. A click reaches `onResultAction`, which returns early on `!reducers`. `runner.run` would also return false without counting a rejection.
- **What the player gets.** Nothing happens, no reason is shown, and the NoticeLine (behind the scrim) shows nothing either.

**Fix:** Pass `pending: runner.isPending(key) || !online.value` for reducer-backed actions, or add an `inert` field with a reason and render it through `aria-describedby`. Keep Open crafting live, because it is navigation only. Add tests with `game.connected = false` asserting `aria-disabled="true"` and no reducer call.

### WR-07: The tokens guard now accepts any quoted `'--x':` in any `.vue` file as a global definition

**File:** `src/styles/tokens.client.test.ts:86-96`
**Issue:** The 50-39 relaxation builds one project-wide `inlineSet` from `/['"](--[\w-]+)['"]\s*:/g` over every `.vue` file, then excuses that name in every file, including `.css` files and other components. Consequences:
- A component that uses `var(--bag-columns)` without ever setting it passes, as long as some other file sets it.
- Any `.vue` file can introduce a new "token" just by writing `:style="{ '--accent-2': … }"`, and it is usable everywhere. The token pin (23) never sees it, which defeats "no new tokens".
- The regex also matches inside comments and any object literal (for example a `Record` of keys that start with `--`), so a comment can define a variable for the guard.

**Fix:** Scope the excuse to the defining file, require the key to sit in a `:style` binding or a style object, and pin an allowlist:
```ts
const INLINE_ALLOWED = new Set(['--bag-columns']);
for (const [file, text] of texts) {
  const own = new Set([...text.matchAll(/:style="[^"]*['"](--[\w-]+)['"]\s*:/g)].map((m) => m[1]));
  for (const name of usedCustomProperties(text)) {
    if (defined.has(name)) continue;
    if (own.has(name) && INLINE_ALLOWED.has(name)) continue;
    missing.push(`${file.replace(ROOT, '')}: ${name}`);
  }
}
```
Add a negative case: a fixture `.vue` text that uses `var(--foo)` set only in another file must fail.

## Info

### IN-01: One Esc closes the result card and any other capture-phase layer underneath it

**File:** `src/ledger/ResultCard.vue:43-54`; `src/crafting/ReagentPicker.vue:64-77`; `src/ledger/InlineConfirm.vue:41-54`
**Issue:**
- **Two layers close.** All three register capture-phase document `keydown` listeners, and none checks `defaultPrevented` or stops immediate propagation. With a reagent picker open in RecipeDetail (it stays open when Craft is clicked with the pointer), one Esc closes the picker behind the scrim as well as the card. The picker queues a focus move to a slot that is under the scrim, which only `close()`'s later `nextTick` overrides.
- **Esc from outside the drawer.** On desktop the drawer is non-modal, so Esc pressed in the console input also closes the card and pulls focus into the drawer.

**Fix:** In each handler, return early `if (event.defaultPrevented)`, and register the card last (or call `stopImmediatePropagation` in the card) so that only the topmost layer handles Esc. Ignore Esc whose target is outside the screen root.

### IN-02: Single-slot arming: a refused action leaves a stale arm, and overlapping actions drop a card

**File:** `src/ledger/useActionResult.ts:36-65`
**Issue:**
- **Stale arm.** A server refusal through `fail()` resolves the promise without writing `action_result`, so `armed` survives. Any later row of that kind with a higher seq opens a card the screen never asked for, for example one written by the same player's second tab: the `my_action_result` view is per sender.
- **Lost card.** A Discover started while a Craft is pending overwrites the craft arm, so the craft's row is ignored.

**Fix:** Clear the arm when the runner key leaves pending and no matching row has arrived within the same flush. Or keep a small map from kind to baseline instead of one slot.

### IN-03: The Inventory confirm path does not recheck availability before sending

**File:** `src/inventory/Inspector.vue:159-168`
**Issue:** `onSalvage` checks `salvageInert`, but `runSalvage` (the InlineConfirm `@confirm`) does not. If the item becomes equipped while the confirm is open (a typed `equip` in the console, which stays operable beside the desktop drawer), the confirm still sends `salvageItem` for an equipped id. The server refuses it, so this is harmless, but it breaks the rule that the client never sends an equipped id. `SalvageDetail.runSalvage` does recheck (`:119`).
**Fix:** Add `if (!v.salvage.available) { confirming.value = false; return; }` at the top of `runSalvage`. Also close the confirm from the `view` watcher when `salvage.available` turns false.

### IN-04: Recipe row `craftable` and `canMake` can disagree

**File:** `src/crafting/craftingModel.ts:194-196` (`craftable = requirements.every(met)`), `:203-228` (`canMake` from the merged `planCraft`), `:248-251` (sort), `src/crafting/RecipeList.vue` (`row.craftable ? { color } : undefined`)
**Issue:** When two requirements share a template, each can be met alone while the merged need is not.
- `canMake` is 0 and the status reads `Missing Iron Ore`.
- But the row sorts with the craftable rows, passes "Show only craftable" and shows its rarity color.

**Fix:** Derive `craftable` from `canMake > 0n`.

### IN-05: The Craft button reads "Missing materials" for refusals that are not about materials

**File:** `src/crafting/craftingModel.ts:813-823`
**Issue:** `craftQuantity` labels every `max === 0n` as `Missing materials` / `Missing materials for {name}`. `maxCraftCount` returns 0 for any `planCraft` refusal. Two such cases:
- A player who has picked an essence but no reagent yet (`no_reagent`).
- A player who has picked too weak an essence (`essence_tier`).

In both, the button reads "Missing materials" while the reason line says something else.
**Fix:** Pass the refusal reason into `QuantityState`, and use a neutral label such as `Can't craft` when the reason is not `materials`.

### IN-06: Craft again moves focus from the Craft again button to Done on every refresh

**File:** `src/ledger/ResultCard.vue:65-67`
**Issue:** A new seq always refocuses Done. A keyboard user repeating Craft again has to Tab back each time.
**Fix:** Move focus to Done only on the first open (`!before`). On a refresh, leave focus where it is (WR-02 still announces the new result).

### IN-07: A stale comment still promises a guaranteed yield

**File:** `src/inventory/Inspector.vue:19`
**Issue:** "The salvage confirm names the guaranteed yield through the shared salvage preview." This contradicts the 50-40 rule and the code below it.
**Fix:** Change it to "The salvage confirm speaks in chances through the shared salvage preview."

### IN-08: Two client constants mirror server data

**File:** `src/ledger/useActionResult.ts:13`; `src/ledger/salvagePreview.ts:65`
**Issue:**
- **Result kinds.** `ResultKind = 'craft' | 'salvage' | 'discover'` duplicates `RESULT_KINDS` from `@game-data/action_result`.
- **Likely threshold.** `LIKELY_PCT = 25n` is a wording threshold tied to today's 50/25/10 chances. If the owner revises them at UAT, for example to 30/15/5, "unlikely" and "rarely" silently move to other tiers.

**Fix:** Derive `ResultKind` from `RESULT_KINDS`. Export the per-tier chances, or a `SALVAGE_LIKELY_PCT`, from `crafting_rules.ts` and import it.

### IN-09: Dead code

**File:** `src/inventory/backpack.ts:124` (`backpackTileSize` is only used by tests since the grid now uses `backpackColumns` plus CSS); `src/ledger/salvagePreview.ts:49-50` (`SalvageYieldView.chance` is never read).
**Fix:** Remove both, or use them.

### IN-10: `aria-controls` points to an element that is not in the DOM while collapsed

**File:** `src/crafting/RecipeDetail.vue:389`, `:399`
**Issue:** The toggle always sets `aria-controls="craft-reagents-…"`, but the region is `v-if="expanded"`. The test at `RecipeDetail.test.ts:225` only checks that the attribute is truthy.
**Fix:** Use `v-show` for the region, or bind `aria-controls` only while expanded.

### IN-11: Organize can silently drop the current selection

**File:** `src/inventory/InventoryActions.vue:27-34`; `src/inventory/InventoryScreen.vue:142-150`
**Issue:**
- **Lost selection.** `consolidate_stacks` keeps the first stack of each template and deletes the rest (`items.ts:703-706`). If the selected stack is merged away, the inspector disappears with no notice, and focus stays on Organize.
- **Clickable while the card is open.** The header actions sit outside the screen root, so the result-card scrim does not cover them, and Organize can still be clicked.

**Fix:** After Organize, if the selected instance is gone, select the surviving stack of the same template.

### IN-12: A stale equipped instance on the Salvage tab is disabled with no reason

**File:** `src/crafting/SalvageDetail.vue:93-97`, `:166-176`
**Issue:** `inert` includes `equipped`, but the button has no `aria-describedby`, and no reason line is shown. Inventory shows "Equipped items can't be salvaged."
**Fix:** Render the same reason line and reference it from the button.

### IN-13: Test gaps

**Files:** `src/ledger/ResultCardDialog.test.ts`, `src/ledger/resultCard.test.ts`, `src/crafting/CraftingScreen.test.ts`, `src/crafting/SalvageTab.test.ts`, `src/inventory/Inspector.component.test.ts`, `src/ledger/ledgerData.test.ts`, `src/styles/tokens.client.test.ts`
**Issue:** These cases have no test:
- the sub and footer of an empty salvage card (WR-01)
- two results with the same announce text (WR-02)
- the output-recipe swap window (WR-03)
- focus after a desktop salvage of a common item (WR-04)
- a scrim click without a matching `pointerdown` (WR-05)
- the card actions while offline (WR-06)
- a negative case for the inline custom property (WR-07)
- Esc with a picker open behind the card (IN-01)
- a refused action followed by an unrelated row (IN-02)
- the confirm after the item becomes equipped (IN-03)

Several screen tests also use `await new Promise((r) => setTimeout(r, 0))` to flush. This works today, but it depends on the macrotask ordering. `flushPromises` from `@vue/test-utils` would be explicit.
**Fix:** Add the listed cases with the fixes.

---

_Reviewed: 2026-10-07T05:08:08Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
