---
phase: 50-ledger-screens-character-and-economy
plan: 05
subsystem: spacetimedb
tags: [spacetimedb, game-data, economy, vendor]

requires:
  - phase: 50-03
    provides: "perkBonusByField (client-side perk percent over the same keys)"
  - phase: 50-04
    provides: "shared item rules; items.ts import layout"
provides:
  - "spacetimedb/src/data/vendor_pricing.ts: computeSellValue (moved), sellPayout, buyPrice, rapportPercents"
  - "buy_item, sell_item and sell_all_junk call the shared helper; real-handler differential test"
affects: [50-07 sell helper and NL sell paths, 50-09 publish, Vendor screen]

tech-stack:
  added: []
  patterns:
    - "Differential real-handler test written to pass before and after the refactor"

key-files:
  created:
    - spacetimedb/src/data/vendor_pricing.ts
    - spacetimedb/src/data/vendor_pricing.test.ts
    - spacetimedb/src/reducers/vendor_pricing_parity.test.ts
  modified:
    - spacetimedb/src/helpers/economy.ts
    - spacetimedb/src/reducers/items.ts

key-decisions:
  - "A fractional perk percent is truncated (Math.trunc) before BigInt, and a non-finite one counts as zero, so the helper never throws"
  - "Rounding stays per instance: sell_all_junk calls sellPayout once per stack; the parity test uses three stacks of 7 so a pooled sum (22) would fail against the per-instance sum (21)"
  - "helpers/economy.ts re-exports computeSellValue, so intent.ts keeps its import until Plan 07"

requirements-completed: [LDG-08, LDG-09]

status: complete
duration: 15min
completed: 2026-10-06
---

# Phase 50 Plan 05: Shared vendor pricing Summary

Buy price, sell payout and the rapport percentages now come from one import-free module; `buy_item`, `sell_item` and `sell_all_junk` call it, and a real-handler differential test proves the gold deltas did not move.

## Exported signatures

`spacetimedb/src/data/vendor_pricing.ts` (no imports):

- `computeSellValue(baseValue: bigint, vendorSellMod: bigint): bigint` (moved verbatim; `helpers/economy.ts` re-exports the same function object)
- `sellPayout(vendorValue: bigint, quantity: bigint, perkSellPct: number, vendorSellMod: bigint): bigint`
- `buyPrice(listPrice: bigint, perkDiscountPct: number, vendorBuyMod: bigint): bigint` (perk discount capped at 50, minimum 1n after each step)
- `rapportPercents(input: { perkBuyPct: number; perkSellPct: number; vendorBuyMod: bigint; vendorSellMod: bigint }): { buyPct: number; sellPct: number; fromRenown: boolean }` (one-decimal numbers, no NaN, no negative zero; display formatting belongs to the client)
- types `RapportInput`, `RapportPercents`

## Task Commits

1. Task 1: vendor_pricing module and economy re-export: `cbcbf059`
2. Task 2: the three reducers call the helper (parity test written first, passing before and after): `3d614ae5`

## Verification

- `vendor_pricing.test.ts`: 24 tests (every behavior line, the economy re-export identity, the no-import pin).
- `vendor_pricing_parity.test.ts`: 44 tests: 10 fixtures (five modifier pairs, each with and without the `shrewd_bargainer` perk) for buy_item, for sell_item with a stack of 3 and a single item, and for sell_all_junk; plus the Not enough gold, Backpack is full and no-junk cases. It passed against the old inline math before the edit and passes after.
- With `item_rules_parity.test.ts`: 118 tests pass with `--maxWorkers=1`.
- `grep -c "buyPrice(" items.ts` is 1; `grep -c "sellPayout(" items.ts` is 2; `git diff --stat spacetimedb/src/schema` is empty.

## Deviations from Plan

None. Reward-line shapes are unchanged: the perk message in buy_item is built whenever the perk is above 0, and in sell_item only when the perk is above 0 and the base value is positive, as before.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: vendor_pricing.ts, vendor_pricing.test.ts, vendor_pricing_parity.test.ts
- FOUND commits: cbcbf059, 3d614ae5
