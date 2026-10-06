---
phase: 50-ledger-screens-character-and-economy
plan: 18
subsystem: client-vendor
tags: [vue, vendor, model, nearby]

requires:
  - phase: 50-11
    provides: "itemModel (names, rarity colors, categories, slot labels)"
  - phase: 50-12
    provides: "FrameControls.openScreen(id, args), screenArgs"
provides:
  - "src/vendor/vendorModel.ts: vendor selection, For sale rows, sell rows, junk preview, rapport and Just sold card state"
  - "NearbyList Trade opens the vendor screen for the chosen NPC"
affects: [50-19 sell panel, 50-20 vendor screen, 50-23 registration]

tech-stack:
  added: []
  patterns:
    - "Pure model over server shared helpers (buyPrice, sellPayout, rapportPercents, canEquipItem, hasBackpackSpace, perkBonusByField); components only draw"

key-files:
  created:
    - src/vendor/vendorModel.ts
    - src/vendor/vendorModel.test.ts
  modified:
    - src/rails/NearbyList.vue
    - src/rails/ContextContent.test.ts

key-decisions:
  - "Nearby opens the vendor through FRAME_KEY (close, then openScreen('vendor', { npcId, npcName })); ConsoleApi.trade, useConsole and src/game/context.ts are unchanged"
  - "A level-short gear row stays usable (Usable by you hides class failures only) and shows ' · Requires Lv n'; the price is muted for class or level, red when unaffordable (red wins)"
  - "For sale rows are keyed by the vendor_inventory row id; buying sends the template id (the reducer's own argument)"
  - "junkSummary counts every non-equipped isJunk instance with a known template, the exact set sell_all_junk sells (the reducer does not skip quest-slot junk)"
  - "buybackCard 'wrong place' also applies when no vendor is open (openVendorId null), as the UI-SPEC treats the sale NPC as the place"

requirements-completed: [LDG-08, LDG-09]

status: complete
duration: 35min
completed: 2026-10-06
---

# Phase 50 Plan 18: Nearby Trade and the vendor model Summary

Nearby's Trade now opens the vendor screen for that NPC through the frame, and one tested pure model derives every vendor number, filter and reason (prices, payouts, junk preview, rapport, Just sold state) from the server's own shared rules.

## Exported functions (src/vendor/vendorModel.ts)

- `resolveVendor(args: ScreenArgs | null, npcsHere): { kind: 'vendor', npc } | { kind: 'gone', npcId, name } | { kind: 'list', vendors } | { kind: 'empty' }`; `vendorLeft(snapshot, npcsHere)`; type `VendorSnapshot { id, name, greeting, factionId, locationId }`.
- `forSaleRows(input: { stock, templates, items, character, perkKeys, filter }): ForSaleRow[]` with `{ key (listing id), templateId, name, rarity, color, subLine, slotText, price, priceTone ('default' | 'muted' | 'short'), usable, levelShort, reason ('Not enough gold' | 'Backpack full' | null), ariaLabel }`; `forSaleEmptyText(input, vendorName)` (null while rows exist or templates are still arriving); `FOR_SALE_FILTERS` (All, Usable by you).
- `sellRows(input: { items, templates, character: { level, vendorSellMod }, perkKeys }): SellRow[]` with `{ instanceId, templateId, name, rarity, color, junk, quest, quantity, quantityText, value, valueText, subLine, canSell, ariaLabel }`.
- `junkSummary(sellInput): { count, gold, prompt }` (prompt is empty with nothing to sell).
- `rapportParts(input): { lead, figures, suffix }`, `rapportText(input)`, `formatRapportPercent(n)` (U+2212, plus sign, `0%`).
- `buybackCard(lastSale, character | null, openVendorId, items, templates): { name, color, price, state: 'ready' | 'gold' | 'place' | 'full', reason, ariaLabel } | null`.
- Types `VendorCharacter { level, className, weaponProficiencies?, armorProficiencies?, gold, locationId?, vendorBuyMod, vendorSellMod }`, `ForSaleInput`, `SellInput`.

## Task commits

1. `f8496d35` Nearby Trade opens the vendor screen for that NPC
2. `4092b9f3` vendor model (selection, For sale, sell rows, junk preview, rapport, Just sold)
3. `d59e8030` keep a `var()` prefix out of the vendor model comment (token guard)

## Verification

- `pnpm exec vitest run src/rails src/vendor src/console/useConsole.test.ts --maxWorkers=2`: green (rails 13 files with ContextContent 39 tests; vendorModel.test.ts 36 tests).
- `pnpm exec vitest run src/styles src/gameDataAlias.test.ts src/vendor`: 6 files, 123 tests passed.
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "openScreen('vendor'" src/rails/NearbyList.vue` is 1; `@game-data/vendor_pricing` and `@game-data/item_usability` each once in vendorModel.ts; `git diff --stat src/console src/game` empty.

## Deviations from Plan

**1. [Rule 1 - Bug, found by the token guard] A doc comment contained a `var(--` prefix**
- **Found during:** Task 2 (src/styles run after the first commit)
- **Issue:** `tokens.client.test.ts` scans source text for `var(--name)` and flagged the comment `var(--color-rarity-...)`.
- **Fix:** reworded the comment. **Commit:** `d59e8030`.

**2. [Interpretation] `forSaleEmptyText` added next to `forSaleRows`**
- The plan names the two empty texts but not where they are chosen; the model returns the sentence (or null while templates are still arriving) so the screen never shows a wrong line before data lands.

No other deviations. The ConsoleApi deviation from RESEARCH Q6 (Nearby uses FRAME_KEY) is the plan's own and is applied as written.

## Known Stubs

None.

## Threat Flags

None. T-50-58 (prices and payouts from buyPrice and sellPayout, parity tests), T-50-59 (accepted: the client gates on npcsHere), T-50-60 (card state comes only from the per-sender last-sale row) hold.

## Self-Check: PASSED

- FOUND: src/vendor/vendorModel.ts, src/vendor/vendorModel.test.ts, src/rails/NearbyList.vue, src/rails/ContextContent.test.ts
- FOUND commits: f8496d35, 4092b9f3, d59e8030
