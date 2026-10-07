---
phase: 50-ledger-screens-character-and-economy
plan: 38
subsystem: ui
tags: [vue, crafting, salvage, seg-tabs, result-card, mobile, gates, client, gap-closure]
requires:
  - phase: 50-34
    provides: Inventory salvage confirm, salvageNeedsConfirm and the read-scroll wiring this plan copies
  - phase: 50-37
    provides: CraftingScreen with the shared runner and result card (craft, discover)
  - phase: 50-39
    provides: bag sort and the Inventory header the Salvage list follows
  - phase: 50-40
    provides: salvagePreview { components, knowable, reagentPossible, yields, confirmText } in chance wording and the chance-based salvage_item
provides:
  - "Craft / Salvage switch in the Crafting screen (SegTabs with optional icons)"
  - "SalvageList, SalvageDetail and salvageModel: gear rows in the bag sort, 'May return' chance rows from the shared preview, the shared confirmText confirm"
  - "Salvage ends on the shared result card, including the empty roll 'Nothing usable was left.', with Read scroll when a scroll was granted"
  - "Full gate run for the follow-up 50-28..50-40, all green"
affects: [phase 51, milestone-end UAT]
tech-stack:
  added: []
  patterns:
    - "Salvage in Crafting reuses Inventory's reducer, rule (salvageNeedsConfirm), preview and confirm text; the detail never words a yield of its own"
    - "A tab panel made a flex column with :deep(.panel) so the columns keep their own scrolling inside SegTabs"
key-files:
  created:
    - src/crafting/salvageModel.ts
    - src/crafting/salvageModel.test.ts
    - src/crafting/SalvageList.vue
    - src/crafting/SalvageDetail.vue
    - src/crafting/SalvageTab.test.ts
  modified:
    - src/crafting/CraftingScreen.vue
    - src/crafting/CraftingScreen.test.ts
    - src/ledger/SegTabs.vue
    - src/ledger/parts.test.ts
key-decisions:
  - "The Salvage detail speaks only in chances: heading 'May return', one row per salvagePreview yield, a hint line ('It may return some materials.' / 'Nothing usable will come of it.') for what cannot be named, and the confirm prompt is preview.confirmText unchanged (owner rule 2026-10-07, deliberate deviation from mock C.9)"
  - "The Salvage button hides (v-show) while the confirm shows, so the confirm replaces it in place as in Inventory; Keep it and Esc refocus the button"
  - "On mobile a salvaged item closes its detail and shows the list again; focus then lands on the first list row"
requirements-completed: [LDG-01, LDG-10, LDG-11]
duration: about 70 min
completed: 2026-10-07
status: complete
---

# Phase 50 Plan 38: Salvage tab in Crafting and the follow-up gate run Summary

**Crafting now opens on a Craft / Salvage switch; the Salvage tab lists non-equipped gear, shows what a salvage 'May return' as chances straight from the shared salvagePreview, confirms with the Inventory's own confirmText, and ends on the shared result card (including 'Nothing usable was left.'); every gate for plans 50-28 to 50-40 is green.**

## Performance

- **Tasks:** 3 of 3
- **Files:** 5 created, 4 modified (plus this SUMMARY)

## Accomplishments

- **salvageModel.ts (pure):** `salvageRows` (non-equipped, `isSalvageableTemplate`, `compareBagItems` order, `{Slot} · {Type} · Tier {n}` with absent parts omitted), `salvageCountText` ('1 item can be salvaged'), the words `SALVAGE_INTRO`, `SALVAGE_EMPTY`, `SALVAGE_YIELD_HEADING = 'May return'`, `SALVAGE_NOTHING`, `SALVAGE_UNKNOWN`, and `salvageYieldHint`. A parity test builds real `salvagePreview` results and proves `confirmText` contains the same hint sentence.
- **SalvageList.vue:** intro, one row button per item (icon tile, rarity-colored name, type line, `aria-pressed`, `aria-label '{name}, {typeLine}'`), the empty state 'Nothing left to salvage.', desktop auto-select of the first row (and `select null` when empty), mobile never auto-selects (rows min-height 56). Exposes `focusRow` and `focusFirst`.
- **SalvageDetail.vue:** ItemCard (kicker 'Salvage', the instance's stats with its affixes via `instanceStats`, 'Sells for', description), `h6` 'May return' with one row per `preview.yields` entry (`×1 · 50% chance`, note 'unlikely' under 25 percent, the reagent as '12% chance' with its affix note), the hint line when not knowable or nothing possible, no scroll line, the `Salvage {name}` button with PhRecycle. Confirm uses `salvageNeedsConfirm` and `<InlineConfirm warning :prompt="preview.confirmText">`; it closes when the selected instance changes. The call is `reducers.salvageItem` under the runner key `salvage`. Equipped (stale), offline and pending make the button `aria-disabled` and send nothing.
- **SegTabs.vue:** optional `icon?: Component`, rendered aria-hidden at 14px before the label, 4px gap. Tabs without an icon render as before (Inventory, Stats, Vendor suites pass).
- **CraftingScreen.vue (CRLF kept):** a `Crafting mode` tablist (Craft with PhHammer selected on open, Salvage with PhRecycle). The whole Craft panel moved unchanged into the 'craft' tab. The Salvage panel has the count line, a desktop grid (wide: list 300 / detail fluid / Materials 210; 900 to 1199: list and detail) and the mobile list view with the detail view and an 'All gear' back button (44px) that returns focus to the row. `salvage: 'salvage'` joined the result keys, `Read scroll` was added for salvage results on both layouts, and `fallbackFocus` covers the Salvage tab. Card code is untouched: the card shows the server's lines or its own empty text.
- **Gate run (Task 3):** no code change was needed.

## Gate Results

| Gate | Result |
| ---- | ------ |
| Module suite (`spacetimedb`, `--maxWorkers=1`, measurement.results.test.ts excluded) | 118 files, 4749 tests passed |
| Client suite (`vitest run --dir src --maxWorkers=2`, includes designContract, colors.guard, tokens.client, scrollbars, frameContract, gameDataAlias and every screen suite) | 153 files, 3501 tests passed |
| `vue-tsc -b` | exit 0 |
| `pnpm build` | exit 0 ('bundle clean: 4 files scanned'; the usual chunk-size notice only) |
| Targeted: crafting, ledger, inventory, stats, vendor, styles, frame | 57 files, 1334 tests passed |
| Snapshot `claude_request.test.ts.snap` | not modified (`git status` clean after the module run) |

Known baseline failures, untouched and not run here: `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs` (both outside `--dir src` and the module suite) and `spacetimedb/src/helpers/measurement.results.test.ts` (excluded).

Cross-plan contract checks (non-test sources): reducers.craftRecipe( count 0, raw-HTML directive or inline SVG 0 files, promised-yield phrase or `countKnown` 0 files. The word "ripple" appears in no file of this follow-up (the only hits in `src` are two older test guards outside it).

## TDD / RED runs

- Task 1: salvageModel.test.ts and SalvageTab.test.ts first failed on the missing modules (2 files failed, no tests ran), then 41 tests passed after the implementation.
- Task 2: the 21 new CraftingScreen.test.ts tests failed against the old screen (no switch) and passed after the implementation; the full file is 110 tests. The two SegTabs icon tests in parts.test.ts were added after the SegTabs change had been made, so their RED run was not recorded (they passed on the first run).

## Task Commits

1. Task 1: `85a6caec` feat(50-38): Salvage list and detail with chance rows and the shared confirm
2. Task 2: `8864500a` feat(50-38): Craft / Salvage switch in Crafting with the salvage panel and result card
3. Task 3: no code change (gates only)
4. SUMMARY: committed separately (docs(50-38))

## Deviations from Plan

### Deliberate deviations from mock C.9 (owner rule of 2026-10-07, plan 50-40)

1. **Heading.** 'May return' replaces the mock's receive heading, because nothing is guaranteed any more.
2. **Rows.** The mock's guaranteed '×2' row is gone. Every row is a chance from `salvagePreview().yields` (`×1 · 50% chance`, note 'unlikely' under 25 percent; the reagent '12% chance'). With `knowable` false, no component rows and 'It may return some materials.'; with `knowable` true and no yields, 'Nothing usable will come of it.'
3. **Confirm prompt.** The mock's own destroy sentence is replaced by `preview.confirmText`, the exact text Inventory shows, with no digit. 'Keep it', 'Salvage' and the warning icon stay.

### Auto-fixed Issues

None needed fixing against the shipped 50-40 interface; it matched the hand-off (`yields`, `knowable`, `confirmText`, keys and wording).

### Other small interpretations

- **[Rule 3 - layout] `:deep(.panel)` on the Crafting screen.** SegTabs' panel is a plain scrolling block, which would have made the recipe/salvage columns grow with their content and lose their own scrolling. The screen makes the panel a flex column with `overflow: hidden` and an 8px top padding so the existing grid and list/detail views behave as before.
- **Mobile selection reset (Rule 2).** On mobile a salvaged item leaves the bag, so the screen clears the salvage selection and returns to the list view; the plan's "focus lands on the list" is met with a new `focusFirst` on SalvageList. On desktop the list auto-selects the next row.
- **Hint line and a reagent-only preview.** When `knowable` is true and the only yield is the reagent, the hint is empty (the reagent row stands alone), exactly as the behavior block says.
- **Plan verify command, Task 3.** Its greps for `reducers.craftRecipe(`, `v-html` and `<svg` also scan test files, where the "must not contain" assertions name those strings (earlier plans' tests and mine). The non-test counts are 0, which is the contract; the literal command would print 1 and 6 on the test strings. Recorded, not changed.
- **Count line.** `.salvage-count` sits above the grid inside the panel (the mock puts the label next to the switch); a single line keeps the guard-clean layout.

## Auth gates

None.

## Known Stubs

None.

## Threat surface

No new surface beyond the plan's threat model: the same `salvage_item` and `learn_recipe_scroll` reducers, text nodes only (escape tests on the list, detail, confirm prompt via the shared preview, and the card), runner keys `salvage` and `item-learn` ignore repeats while pending, and the open confirm closes on a selection change.

## Owner try-out note

Reload http://localhost:5173 (the module was published in plan 50-30 and 50-40; no publish was done here).

1. The backpack squares stay at the mock size on a wide window, with `x{n}` counts.
2. Salvage a rare item from Inventory and read the confirm: it speaks of what may come back and never names a count; then see the result card.
3. An equipped item's Salvage is unavailable.
4. In Crafting, pick a recipe, see what it makes, step the quantity with Max and craft several at once.
5. Craft again; Discover recipes; switch to Salvage, read 'May return' and its chances, and salvage from there.
6. Salvage a crafted weapon several times: sometimes the card says 'Nothing usable was left.', and a tier 3 material rarely comes back.

## Deferred UAT (consolidated, milestone end; at 1280, 1920 and 390x844)

- **Backpack (50-32, 50-39):** squares stay at the mock size, heading and chips line up with the grid, `x{n}` top-right, common rings light; 50 slots drawn under All, arrows skip empty cells; Organize with two partial stacks merges and the notice line says "Inventory organized: ...". The owner may prefer a 68px cap with an 8px gap (one constant in `backpack.ts`, the `minmax(44px, 72px)` pin in `BackpackGrid.vue` and its test).
- **Inventory salvage (50-34, 50-40):** salvage a rare item at 1280 and 390x844, read the confirm (chances, no count), check the result card, Read scroll when a scroll drops; Salvage on an equipped item is disabled with its reason.
- **Craft and Discover (50-37):** craft 3 at 1280 and 390x844, Craft again, Equip, Discover (Nothing new, and with finds).
- **Crafting layout (50-35, 50-36):** recipe list, quantity stepper and Max, output details card, Materials column at 1200+ and the 900 to 1199 disclosure layout.
- **Salvage tab (50-38):** the Craft / Salvage switch (icons, keys), the list and 'May return' rows at 1280, 1920 (two and three columns) and 390x844 (All gear, bottom sheet), the confirm for rare and crafted items, the empty roll card 'Nothing usable was left.', Read scroll.
- **Salvage numbers (50-40):** the 50/25/10 percent chances by material tier and the half-rounded-down amounts may be revised by the owner after playing.

## Claude decisions recorded in the follow-up (50-28 to 50-37, 50-39, 50-40, and this plan)

- **50-28:** planCraft's ok result carries `count` only for a batch above 1n; armor descriptions say 'cut from' for leather and 'woven from' for cloth; a trinket accessory with a stat missing from the word table falls back to the slot sentence.
- **50-29:** craft_recipe keeps its argument object and calls `craftBatch(ctx, args, 1n)` while a new reducer takes the count (old clients keep craft_recipe); craft xN has no backpack capacity gate (parity); a missing output template is refused up front.
- **50-30:** the result row is written after the instance is deleted, with totals from `getItemCount` after each grant; a salvage with no material still writes a row.
- **50-31:** `lastResult` copies the `lastSale` pattern; `outputRecipes` is keyed by every owned template id; a salvage preview never lists a scroll line.
- **50-32:** tracks capped (minmax 44/58 desktop, 44/66 mobile, 4px gap); common ring neutral-200 per the mock; `stackCountText` shows `x{n}` for every stackable including x1.
- **50-33:** one result card for Crafting and Inventory; Esc closes it (captured so the drawer stays); no auto-dismiss; the card opens only for a result the screen asked for.
- **50-34:** mock 10a labels supersede the UI-SPEC checker note (Equip, Unequip, Use, Eat, Learn recipe on both layouts); house destructive-confirm styling kept; no scroll line in the preview; equipped refused up front, no bag-space reason.
- **50-35:** server categories kept; uncraftable rows full opacity with a muted name and red status; name stays an h4 at 20/500; 'Stackable' instead of 'Stacks to 99'; Can make N is the server's `maxCraftCount`.
- **50-36:** the quantity value is shown, not typed; no mobile Discover icon button; the single reagent slot kept on mobile; stepper bounds `aria-disabled`.
- **50-37:** Craft again is the smaller of the last count and what the bag allows, hidden at max 0 or with no station; no 'Add to hotbar'; Discover caption 'Finds new recipes from the materials you carry.'; Equip desktop only for equippable crafted gear.
- **50-39:** the sort is always applied and Organize is the server merge plus the sorted view; the frame gained an actions slot; Organize is an icon-only 44px button on mobile; `bagRunner` shares one runner per hub; 71px tiles at 1280.
- **50-40:** chances 50/25/10 by material tier, amounts half rounded down under the strict cap; 'Nothing usable was left.' kept; the 12 percent reagent and the scroll roll unchanged; an all-miss salvage always writes the feed line.
- **50-38 (this plan):** the three deliberate mock C.9 deviations above, the `:deep(.panel)` flex layout, the mobile selection reset and the confirm replacing the button in place.

## Self-Check: PASSED

- Files found: src/crafting/salvageModel.ts, salvageModel.test.ts, SalvageList.vue, SalvageDetail.vue, SalvageTab.test.ts; CraftingScreen.vue, CraftingScreen.test.ts, src/ledger/SegTabs.vue and parts.test.ts modified.
- Commits found: 85a6caec, 8864500a.
