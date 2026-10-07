---
phase: 50-ledger-screens-character-and-economy
fixed_at: 2026-10-07T06:20:00Z
review_path: .planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-iter3-client.md
iteration: 3
findings_in_scope: 20
fixed: 14
skipped: 6
status: partial
---

# Phase 50: Code Review Fix Report (iteration 3, client)

**Fixed at:** 2026-10-07T06:20:00Z
**Source review:** `.planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-iter3-client.md`
**Iteration:** 3

**Summary:**
- Findings in scope: 20 (7 Warning, 13 Info). The orchestrator asked for all 7 Warnings plus the cheap Info items, and for the rest to be documented.
- Fixed: 14. These are WR-01 to WR-07, plus IN-01, IN-03, IN-07, IN-08, IN-09, IN-10 and IN-12.
- Left as documented: 6. These are IN-02, IN-04, IN-05, IN-06, IN-11 and IN-13. IN-13 is partly covered by the tests added with the fixes.

The fixes were made on `master` in the main checkout, with one commit per finding. All paths were staged explicitly. No worktree was used: the tests need the installed `node_modules`, and the server fixer worked the same way. Only client files changed. Nothing was published, and the SpacetimeDB server (PID 12020) and Vite (5173) were left alone.

The server fix in `src/crafting/craftingModel.ts` was not touched. That fix passes the bag room to `craftQuantity` through `craftBatchFits`, and the Craft button can read "Backpack full".

## Fixed Issues

### WR-01: An empty salvage roll says "Broken down into materials" and "Materials went to your backpack"

**Commit:** `779cf427`
**Files modified:** `src/ledger/resultCard.ts`, `src/ledger/resultCard.test.ts`, `src/crafting/CraftingScreen.test.ts`

**Applied fix:** `salvageCard` now picks its sub and footer from the lines the server reported:
- **A component or reagent came back.** The sub reads "Broken down into materials" and the footer reads "Materials went to your backpack. Also written to your log."
- **Empty roll.** The sub reads "Nothing usable was left" and the footer reads "Also written to your log." The sub is the dialog's `aria-describedby`, so it matches the announcement ("Salvaged X. Nothing usable was left.").
- **Only a scroll came back.** The sub reads "Only a recipe scroll came back" and the footer reads "The scroll went to your backpack. Also written to your log."

**Tests:**
- `resultCard.test.ts`: the empty-roll test now asserts the sub and the footer, and that no text mentions materials. A new test covers the scroll-only case.
- `CraftingScreen.test.ts`: the empty-roll test asserts the dialog's described sub, the footer, and that the card never mentions materials.

### WR-02: The polite live region does not announce a result whose text repeats the previous one

**Commit:** `908207fc`
**Files modified:** `src/ledger/ResultCard.vue`, `src/ledger/ResultCardDialog.test.ts`

**Applied fix:**
- A new seq clears the live region, then sets the text on the next tick. A repeated text (Craft again with the same count, two empty salvages, two empty Discover runs) is therefore still a real DOM change.
- A token keeps an older pending set from overwriting a newer result.
- Focus still moves to Done on each new seq, as before. IN-06 was not changed.

**Tests:** A `MutationObserver` records what the region shows:
- Two rows with the same announce text and seqs 2 and 3 each give `['', text]`.
- A re-render with the same seq gives nothing.
- A fast second result is never overwritten by the first.
- The existing live-region tests now wait for the next tick.

### WR-03: While the output-recipe subscription swaps, a new item is previewed as "no recipe makes it"

**Commit:** `bf518915` (state logic: worth a look at UAT)
**Files modified:** `src/ledger/ledgerData.ts`, `src/ledger/ledgerContext.ts` (doc), `src/ledger/ledgerData.test.ts`

**Applied fix:** `outputRecipesApplied` now means "applied for every owned template":
- `keyedIdList` takes an optional `made` callback. The output binding records the id set of each binding's key in a `WeakMap`.
- The flag is true only when the shown binding has applied and its key holds every owned template id.
- **Newly owned template** (for example a freshly crafted Darksteel Sword): the old binding stays current but does not cover the new template. The flag is false, so Inspector and SalvageDetail pass `undefined`, and the preview says "It may return some materials."
- **Dropped template** (after a salvage): the old key still covers the bag, so the flag stays true and nothing flickers.
- `keyedBinding.ts` was not changed.

**Tests:**
- **Swap window:** the old key is applied and the new key is pending. The flag is false, `outputRecipes.get(new)` is undefined, and the real `salvagePreview` fed from the hub is not knowable and says "It may return some materials." Once the new key applies, the flag is true and the recipe is read.
- **Removal:** dropping a template keeps the flag true while the narrower key subscribes.

### WR-04: On the desktop Salvage tab, focus returns to a Salvage button that now targets an item the player never chose

**Commit:** `c23c31b5` (focus logic: worth a look at UAT)
**Files modified:** `src/crafting/CraftingScreen.vue`, `src/crafting/CraftingScreen.test.ts`

**Applied fix:**
- The desktop `<SalvageDetail>` is keyed on `String(salvageSelectedId)`.
- When the list auto-selects the next row, the old detail and the Salvage button that started the call are removed. The card's `close()` then sees a disconnected opener and runs `fallbackFocus`, which focuses the selected row.
- The mobile path already closes the detail, so it is unchanged.

**Tests:** A new desktop test salvages the common Plain Tunic, which has no confirm.
- The opener button is gone.
- After Done, `document.activeElement` is the `.salvage-row` for the auto-selected Gilded Vest, never a `.salvage-btn`.
- Activating that row salvages nothing more.
- With the key removed, the test fails as expected.

### WR-05: The second click of a double-click lands on the new scrim and dismisses the result card unseen

**Commit:** `716167d4`
**Files modified:** `src/ledger/ResultCard.vue`, `src/ledger/ResultCardDialog.test.ts`, `src/crafting/CraftingScreen.test.ts`, `src/inventory/InventoryScreen.test.ts`

**Applied fix:**
- The scrim closes the card only on a `pointerdown` and `click` pair that both land on the scrim itself. `downOnScrim` is set by the scrim's `pointerdown` and consumed by its `click`.
- The flag resets each time the card opens, and a press that starts inside the card does not count.
- No timer is used, which follows the UI-SPEC "no timers" rule.

**Tests:**
- **Dialog unit tests:**
  - A click with no `pointerdown` keeps the card open.
  - A press that starts inside the card and ends on the scrim keeps it open.
  - A `pointerdown` from before the card closed does not carry over to the next card.
  - The existing scrim-close tests now send `pointerdown`, then `click`.
- **CraftingScreen:** a stray scrim click after a craft leaves the card open.

### WR-06: Result card actions are not inert while offline

**Commit:** `e57318a5`
**Files modified:** `src/ledger/ResultCard.vue`, `src/ledger/resultCard.ts`, `src/crafting/CraftingScreen.vue`, `src/inventory/InventoryScreen.vue`, plus the three test files

**Applied fix:**
- `ResultCardAction` gains `reason?: string`. An action with a reason is `aria-disabled="true"`, emits nothing, and is described by one visible reason line under the buttons (Label 12, `--color-neutral-400`).
- The new `RESULT_ACTION_OFFLINE` in `resultCard.ts` reads "You're offline. Try again once you're reconnected."
- **Crafting:** the screen passes the reason on Craft again, Equip and Read scroll while it is offline.
- **Inventory:** the screen passes it on Read scroll. Open crafting is navigation only and stays live.
- Done is never disabled.

**Tests:**
- **Dialog:** a reason makes the action aria-disabled and described by a single reason line, and nothing is emitted. With no reasons, no line is shown and nothing is described.
- **Crafting:** after a gear craft goes offline, Craft again and Equip are aria-disabled with the reason, there is one reason line, and no reducer call is made.
- **Inventory:** offline, Read scroll is aria-disabled with the reason and calls nothing, while Open crafting stays live. Back online, the reason clears.

### WR-07: The tokens guard accepts any quoted `'--x':` in any `.vue` file as a global definition

**Commit:** `73ed5a04`
**Files modified:** `src/styles/tokens.client.test.ts`

**Applied fix:**
- A `var(--name)` that is not a Nocturne or client token is excused only when two things hold:
  - The same file sets it as a key of its own `:style` or `v-bind:style` binding. HTML comments are stripped, and plain object literals in the script do not count.
  - The name is on the pinned `INLINE_ALLOWED` list, which is `['--bag-columns']`.
- A second test pins the set of inline keys found across the client to that allowlist. A new inline "token" therefore fails the guard.

**Tests:** These negative cases are each reported:
- `--bag-columns` set in A.vue and used in B.vue
- a stray `--accent-2` set and used in its own file
- the allowlisted key inside an HTML comment or a script object literal

The pinned key in its own setting file passes.

### IN-01: One Esc closes the result card and any other capture-phase layer underneath it

**Commit:** `58e6e346`
**Files modified:** `src/ledger/ResultCard.vue`, `src/ledger/InlineConfirm.vue`, `src/crafting/ReagentPicker.vue`, `src/ledger/ResultCardDialog.test.ts`

**Applied fix:**
- The card listens for Esc on `window` in the capture phase. That runs before the document-level capture listeners of a picker or a confirm under the scrim.
- The card prevents the event. The picker and the confirm now return early on `event.defaultPrevented`, as Drawer and Sheet already do.

**Not changed:** an Esc pressed in the console outside the non-modal desktop drawer still closes the card. Ignoring Esc by target would also ignore Esc while focus sits on `body`. The existing tests dispatch on `body`.

**Tests:** An `InlineConfirm` and a `ReagentPicker` are mounted under the card.
- One Esc closes only the card.
- With the card closed, the next Esc reaches the lower layers again, and only one of them closes.

### IN-03: The Inventory confirm path does not recheck availability before sending

**Commit:** `48af363e`
**Files modified:** `src/inventory/Inspector.vue`, `src/inventory/Inspector.component.test.ts`

**Applied fix:**
- `runSalvage` returns and closes the confirm when `view.salvage.available` is false.
- The `view` watcher also closes the confirm when salvage turns unavailable.

**Tests:**
- A confirm click that lands after the item became equipped, but before the re-render, sends nothing.
- The confirm closes by itself when the item becomes equipped.

### IN-07: A stale comment still promises a guaranteed yield

**Commit:** `661a5667`
**Files modified:** `src/inventory/Inspector.vue`

**Applied fix:** The comment now reads "The salvage confirm speaks in chances through the shared salvage preview."

### IN-08: Two client constants mirror server data

**Commit:** `b4d2830d`
**Files modified:** `src/ledger/useActionResult.ts`, `src/ledger/useActionResult.test.ts`, `src/ledger/salvagePreview.ts`, `src/ledger/salvagePreview.test.ts`

**Applied fix:** Both server exports exist, so both constants now come from them:
- `ResultKind` is re-exported from `@game-data/action_result`, which is the server's `RESULT_KINDS`.
- `LIKELY_PCT` is `SALVAGE_COMPONENT_CHANCE_PCT[2]`, the server's tier 2 chance, instead of `25n`. If the chances are retuned, tiers 1 and 2 still read as likely and tier 3 as rare.

The behaviour is the same today.

**Tests:** The tests pin the server kinds and the import, and check that `salvagePreview.ts` has no literal `25n`.

### IN-09: Dead code

**Commit:** `4a929c17`
**Files modified:** `src/inventory/backpack.ts`, `src/inventory/backpack.test.ts`, `src/ledger/salvagePreview.ts`, `src/ledger/salvagePreview.test.ts`, `src/crafting/salvageModel.test.ts`

**Applied fix:**
- **`backpackTileSize`:** removed from `backpack.ts`. Only tests read it. Its model of the CSS tracks moved into `backpack.test.ts`, so the owner's sizing cases still hold, and a new test pins the `BackpackGrid.vue` tracks the model describes.
- **`SalvageYieldView.chance`:** removed. It was always true and never read, and each line's text already ends in "% chance". The tests were updated.

### IN-10: `aria-controls` points to an element that is not in the DOM while collapsed

**Commit:** `1d811f3e`
**Files modified:** `src/crafting/RecipeDetail.vue`, `src/crafting/RecipeDetail.test.ts`

**Applied fix:** The toggle binds `aria-controls` only while it is expanded.

**Tests:**
- While collapsed, the attribute is absent.
- While expanded, it names the rendered region.
- After collapsing again, it is absent and the region is gone.

### IN-12: A stale equipped instance on the Salvage tab is disabled with no reason

**Commit:** `e91065ed`
**Files modified:** `src/inventory/inspector.ts` (exports `EQUIPPED_SALVAGE`), `src/crafting/SalvageDetail.vue`, `src/crafting/SalvageTab.test.ts`

**Applied fix:**
- SalvageDetail shows Inventory's reason line, "Equipped items can't be salvaged.", and the Salvage button's `aria-describedby` points at it.
- An open confirm closes when the item becomes equipped.

**Tests:**
- The equipped item shows the reason, and the button is described by it.
- A bag item shows no reason line.
- A confirm closes and sends nothing when the item becomes equipped.

## Skipped Issues

### IN-02: Single-slot arming: a refused action leaves a stale arm, and overlapping actions drop a card
**File:** `src/ledger/useActionResult.ts:36-65`
**Reason:** Not in the cheap set the orchestrator chose. Fixing it means changing the arming model (clear the arm when the key leaves pending with no row, or keep a map from kind to baseline), and the timing needs its own tests. The only trigger today is a second tab of the same player, or a Discover started while a Craft is pending. Left for a follow-up.
**Original issue:** A refusal through `fail()` leaves `armed` set, and a later Discover overwrites a pending craft arm.

### IN-04: Recipe row `craftable` and `canMake` can disagree
**File:** `src/crafting/craftingModel.ts:194-196`, `:203-228`
**Reason:** Not in the cheap set the orchestrator chose. `craftingModel.ts` was just changed by the server fix (`craftBatchFits`, "Backpack full"), so it was left alone to avoid touching that work. It is only reachable when two requirements share a template.
**Original issue:** `craftable` is per requirement, while `canMake` comes from the merged plan.

### IN-05: The Craft button reads "Missing materials" for refusals that are not about materials
**File:** `src/crafting/craftingModel.ts:813-823`
**Reason:** Not in the cheap set the orchestrator chose. The server fix already gives the bag-full case its own "Backpack full" label. The `no_reagent` and `essence_tier` labels would need another change in the same freshly changed `craftQuantity`. Left for a follow-up.
**Original issue:** Every `max === 0n` reads "Missing materials".

### IN-06: Craft again moves focus from the Craft again button to Done on every refresh
**File:** `src/ledger/ResultCard.vue:65-67`
**Reason:** Not in the cheap set the orchestrator chose. WR-02 now announces each refresh, so a keyboard user is told of the new batch. Whether focus should stay on Craft again is a UX choice to confirm at UAT.
**Original issue:** Each new seq refocuses Done.

### IN-11: Organize can silently drop the current selection
**File:** `src/inventory/InventoryActions.vue:27-34`; `src/inventory/InventoryScreen.vue:142-150`
**Reason:** Not in the cheap set the orchestrator chose. Selecting the surviving stack needs the template of the vanished id before the merge, which is new state in InventoryScreen. Left for a follow-up.
**Original issue:** When `consolidate_stacks` merges the selected stack away, the inspector disappears without notice.

### IN-13: Test gaps
**Files:** several test files.
**Reason:** These gaps are covered by the tests added with the fixes:
- WR-01 to WR-07
- IN-01: Esc with a picker and a confirm under the card
- IN-03: the confirm after the item becomes equipped

Still open:
- the "refused action followed by an unrelated row" case, which belongs with IN-02 (still open)
- the switch from `setTimeout` flushes to `flushPromises`, a style change to existing tests that was not in scope
**Original issue:** The listed cases had no test.

## Verification

- **Touched tests:** they all pass:
  - `resultCard`
  - `ResultCardDialog`
  - `CraftingScreen`
  - `SalvageTab`
  - `RecipeDetail`
  - `InventoryScreen`
  - `Inspector.component`
  - `ledgerData`
  - `salvagePreview`
  - `salvageModel`
  - `useActionResult`
  - `backpack`
  - `tokens.client`
- **`npx vue-tsc -b`:** clean (exit 0).
- **Full `npx vitest run`:** 279 files passed and 3 failed. Tests: 8966 passed and 2 failed. The failures are only the baseline ones:
  - `scripts/llm/call_log_report.test.mjs`
  - `scripts/llm/proof_rules.test.mjs`
  - `spacetimedb/src/helpers/measurement.results.test.ts`
- **Guards:**
  - No `v-html` or `<svg`.
  - No `replaceAll`, `.at(` or `Object.hasOwn`, and no banned word.
  - The added styles use only tokens, the 12px size and on-scale spacing.
- **Line endings and file names:** each file kept its existing endings, CRLF or LF. No new files were created, and no names differ only in case.
- **Processes:** no background processes were started.

---

_Fixed: 2026-10-07T06:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
