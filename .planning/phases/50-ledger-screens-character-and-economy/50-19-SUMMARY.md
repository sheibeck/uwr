---
phase: 50-ledger-screens-character-and-economy
plan: 19
subsystem: client-vendor
tags: [vue, vendor, sell, buy-back]

requires:
  - phase: 50-13
    provides: "GoldAmount, InlineConfirm, action runner"
  - phase: 50-18
    provides: "vendorModel (sellRows, junkSummary, buybackCard)"
provides:
  - "src/vendor/JustSold.vue: the Just sold card with Buy back"
  - "src/vendor/SellPanel.vue: Your backpack table (desktop) and list (mobile) with Sell, Sell all junk and the card placement"
affects: [50-20 vendor screen]

tech-stack:
  added: []
  patterns:
    - "A component reports a settled server effect (the last-sale row clearing after its own call) with an event, so the owning panel moves focus"

key-files:
  created:
    - src/vendor/JustSold.vue
    - src/vendor/JustSold.test.ts
    - src/vendor/SellPanel.vue
    - src/vendor/SellPanel.test.ts
  modified: []

key-decisions:
  - "Offline and every game-reason unavailability use aria-disabled (the Inspector's rule); only Sell all junk with no junk uses the native disabled attribute with title 'No junk to sell'"
  - "Sell all junk is also unavailable (aria-disabled, reason line) when the vendor is no longer nearby: it is a sale to a vendor even though the reducer takes no NPC"
  - "The confirmation hides the junk button with v-show (not v-if) so the opener element stays mounted and Keep it can refocus it"
  - "After a confirmed Sell junk the confirmation closes and, if focus was lost with the removed rows, moves to the Your backpack heading (the junk button is natively disabled then and cannot take focus)"
  - "On mobile the Your backpack heading stays in the DOM as a visually hidden h6 (tabindex -1) so the focus target exists"

requirements-completed: [LDG-09]

status: complete
duration: 40min
completed: 2026-10-06
---

# Phase 50 Plan 19: Sell panel and Just sold card Summary

The sell side of the vendor screen: the Your backpack table (desktop) and list (mobile) with Sell, Sell all junk behind an inline confirmation that states the count and the gold, quest items shown unsellable, and the Just sold card with Buy back, every unavailable state explained and no client state keyed on a sold instance id.

## Components

- `JustSold` props `openVendorId: bigint | null`, `runner: ActionRunner`, `mobile?: boolean`; emits `cleared` (once, when the last-sale row goes away after this component's own successful Buy back, whichever of the promise and the row update arrives first). Reads `ledger.lastSale` through `buybackCard`; renders nothing without a row. Buy back runs `runner.run('buyback', () => reducers.buybackLastSale({ characterId }))` (only the character id). Button: `.btn .btn-secondary`, PhArrowCounterClockwise, `aria-label` from the model, `aria-disabled` plus `aria-describedby` to the reason line for gold, place and full-bag states and while pending or offline; min-height 32 (44 mobile).
- `SellPanel` props `openVendorId: bigint | null`, `vendorNearby: boolean`, `vendorName: string`, `runner: ActionRunner`, `mobile: boolean`; emits nothing. Desktop: head row (h6 `Your backpack` tabindex -1, spacer, `Sell all junk ({n})` with PhBroom), inline confirmation, a scrolling table region (caption, Item / Value / sr-only Action) and the Just sold card pinned after it (`flex: none`, margin-top 16). Mobile: visually hidden heading, full-width `Sell all junk`, the card, then a `ul` of 56px rows with 44px Sell buttons. Sell runs `runner.run('sell:' + id, () => reducers.sellItem({ characterId, itemInstanceId, npcId }))`; Sell all junk runs `runner.run('junk', () => reducers.sellAllJunk({ characterId }))`.
- Focus: a Sell that removes the focused row moves focus to the next following row's Sell button (rows without a button are skipped), else the heading; `JustSold` `cleared` moves focus to the heading. Focus is only moved when the removal cost it its element.

## Task commits

1. `db7f784f` Just sold card with Buy back
2. `ab10c448` SellPanel (Sell, Sell all junk confirmation, card placement)

## Verification

- `pnpm exec vitest run src/vendor src/ledger src/styles --maxWorkers=2`: 14 files, 231 tests passed (JustSold 15, SellPanel 20, vendorModel 36).
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "buybackLastSale({ characterId" src/vendor/JustSold.vue` is 1; `grep -c "Junk sales can't be bought back." src/vendor/vendorModel.ts` is 1 (the prompt comes from the model).

## Deviations from Plan

**1. [Rule 1 - Bug, found by vue-tsc] Template keys cannot be bigint**
- **Found during:** Task 2 verification
- **Issue:** `:key="row.instanceId"` (a bigint) is not a valid Vue key type.
- **Fix:** `:key="String(row.instanceId)"` in both layouts. Folded into the Task 2 commit.

No other deviations.

## Known Stubs

None.

## Threat Flags

None. T-50-61 (text nodes only; escape tests for both components and both layouts), T-50-62 (only the character id is sent for Buy back), T-50-63 (no Sell button for quest rows), T-50-64 (runner keys ignore repeats; tested) hold.

## Self-Check: PASSED

- FOUND: src/vendor/JustSold.vue, JustSold.test.ts, SellPanel.vue, SellPanel.test.ts
- FOUND commits: db7f784f, ab10c448
