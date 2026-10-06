---
phase: 50-ledger-screens-character-and-economy
plan: 20
subsystem: client-vendor
tags: [vue, vendor, screen, mobile]

requires:
  - phase: 50-12
    provides: "FrameControls.screenArgs, ScreenDef.meta"
  - phase: 50-18
    provides: "vendorModel"
  - phase: 50-19
    provides: "SellPanel, JustSold"
provides:
  - "src/vendor/VendorScreen.vue: the Trade screen body (desktop and mobile)"
  - "src/vendor/ForSale.vue: For sale table and list with filters and Buy"
  - "src/vendor/VendorMeta.vue: header meta (gold and the vendor-left warning)"
affects: [50-23 screen registration]

tech-stack:
  added: []
  patterns:
    - "The screen keeps a vendor snapshot and a local choice so a vendor that leaves npcsHere stays on screen"

key-files:
  created:
    - src/vendor/ForSale.vue
    - src/vendor/VendorMeta.vue
    - src/vendor/VendorScreen.vue
    - src/vendor/VendorScreen.test.ts
  modified: []

key-decisions:
  - "Components Plan 23 registers: VendorScreen (body, no props) and VendorMeta (ScreenDef.meta, no props). Title Trade, More row label Vendor (UI-SPEC)"
  - "VendorMeta renders on both layouts (the gold appears only there on mobile) and reads ledger.vendorTarget, which the screen sets through setVendor; the warning shows when that NPC is not in game.npcsHere"
  - "An automatically picked only vendor is stored as the screen's local choice, so it is reported as no longer nearby (band kept) when the character travels instead of falling back to the empty state"
  - "The Buy reason (Not enough gold, Backpack full, no longer nearby) is appended to the row's sub-line with an id the Buy button's aria-describedby points at"
  - "SellPanel is keyed by the screen's resetKey so a second Trade closes an open Sell all junk confirmation; ForSale resets its filter through its resetKey prop"
  - "ledger.setVendor follows the snapshot id (also while the vendor is gone, so the stock rows stay) and is called with null when the screen has no vendor and on unmount"

requirements-completed: [LDG-08, LDG-09]

status: complete
duration: 55min
completed: 2026-10-06
---

# Phase 50 Plan 20: Trade (vendor) screen Summary

The Trade screen composes vendor selection, the vendor band with the rapport line, the For sale table and list with filters and Buy, the sell side from Plan 19, the header meta, the mobile Buy and Sell tabs and the notice line, with one action runner shared by every panel.

## Components Plan 23 registers

- `VendorScreen` (`src/vendor/VendorScreen.vue`): the screen body, no props.
- `VendorMeta` (`src/vendor/VendorMeta.vue`): the `ScreenDef.meta` component, no props. Gold (body size) and, when the vendor registered through `ledger.setVendor` is not in `game.npcsHere`, `{Vendor} is no longer nearby.` in the orange token.

## Other components

- `ForSale` props `vendor: VendorSnapshot`, `vendorNearby: boolean`, `runner`, `mobile: boolean`, `resetKey?: number`; no emits. Desktop: `h6 For sale`, chips (group `For sale filter`), a captioned table (Item, Slot hidden below 1200px, Price, sr-only Action) in a scrolling region. Mobile: chips and a `ul` of 56px rows with 44px Buy. Buy runs `runner.run('buy:' + templateId, () => reducers.buyItem({ characterId, npcId, itemTemplateId }))`.

## Screen behavior

- Vendor choice: the screen arguments' NPC, else the local choice, else the only vendor here, else the `Vendors here` list (48px `PhStorefront` buttons), else `No vendor here.` with `Find a vendor in Nearby, then choose Trade.` (also with no character).
- A second open with other arguments (no remount) switches the band, calls `setVendor`, and resets the For sale filter, the mobile tab, the local choice and any open confirmation. `setVendor(null)` runs on unmount.
- Desktop: band (`flex: none`; rapport under the role line at 900-1199px, right at 1200px and wider), then `For sale` and `Your backpack` columns (each scrolls inside its panel; Just sold pinned), notice line last. Mobile: vendor row (avatar, name, one-line quote), rapport line, `Trade view` tabs Buy and Sell, notice line; the gold is only in the sheet meta.

## Task commits

1. `4e5fb4ba` For sale table and list, vendor header meta
2. `7977eb25` vendor screen composition

## Verification

- `pnpm exec vitest run src/vendor src/ledger src/styles --maxWorkers=2`: 15 files, 273 tests passed (VendorScreen.test.ts 42: ForSale desktop 14 and mobile 4, VendorMeta 4, screen desktop 14 and mobile 6).
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "buyItem({ characterId" src/vendor/ForSale.vue` is 1; `setVendor(` appears 2 times and `screenArgs` 2 times in VendorScreen.vue.

## Deviations from Plan

None to scope. Interpretations:
- **Reason placement:** the plan's Buy reasons sit in the row sub-line (UI-SPEC), so the model's reason string is shown there with the id the button describes; the vendor-left reason replaces the model reason for every row.
- **Auto-picked vendor:** see key decisions; the plan's text says the band stays when the vendor leaves, and this keeps that true when no arguments were passed.

## Known Stubs

None.

## Threat Flags

None. T-50-65 (text nodes only; escape tests for vendor name, greeting, faction and item names on both layouts), T-50-66 (second Trade resets state and re-keys the stock; tested), T-50-67 (setVendor(null) on unmount; tested) hold.

## Self-Check: PASSED

- FOUND: src/vendor/ForSale.vue, VendorMeta.vue, VendorScreen.vue, VendorScreen.test.ts
- FOUND commits: 4e5fb4ba, 7977eb25
