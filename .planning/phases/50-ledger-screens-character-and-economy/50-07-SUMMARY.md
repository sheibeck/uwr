---
phase: 50-ledger-screens-character-and-economy
plan: 07
subsystem: spacetimedb
tags: [spacetimedb, vendor, sell, quest-items, buy-back]

requires:
  - phase: 50-04
    provides: "isQuestItemTemplate, QUEST_ITEM_SALE_REFUSAL"
  - phase: 50-05
    provides: "sellPayout (shared vendor pricing)"
  - phase: 50-06
    provides: "private vendor_buyback table"
provides:
  - "spacetimedb/src/helpers/vendor_sale.ts: snapshotAffixes, parseAffixSnapshot, sellInstanceToVendor"
  - "sell_item and the typed 'sell <item>' share one helper (quest refusal, affix snapshot, buy-back record)"
  - "typed 'sell N <item>' and 'sell junk' skip quest items and use sellPayout"
affects: [50-08 buyback_last_sale reducer, 50-09 publish]

tech-stack:
  added: []
  patterns:
    - "One server helper owns the single-item sale so no path can bypass the quest refusal or the buy-back record"

key-files:
  created:
    - spacetimedb/src/helpers/vendor_sale.ts
    - spacetimedb/src/reducers/quest_item_sale.test.ts
  modified:
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/intent.ts

key-decisions:
  - "sellInstanceToVendor refuses a quest template first (before any read that matters or write) through the caller's fail()"
  - "Only a single sale records the buy-back row (window Sell and typed 'sell <item>'); 'sell N', 'sell junk' and sell_all_junk never create or change it"
  - "listingId is stored only when this sale inserted the vendor listing, so Plan 08 never removes a pre-existing listing"

requirements-completed: [LDG-09]

status: complete
duration: 20min
completed: 2026-10-06
---

# Phase 50 Plan 07: Shared sell helper, quest-item refusal and buy-back record Summary

No sell path can sell a quest item now, and the last single sale (window Sell or typed `sell <item>`) is written to the character's one private `vendor_buyback` row with its affixes snapshotted before they are deleted.

## Helper signatures (`spacetimedb/src/helpers/vendor_sale.ts`)

- `interface AffixSnapshot { affixType: string; affixKey: string; affixName: string; statKey: string; magnitude: string }`
- `snapshotAffixes(ctx, instanceId: bigint): AffixSnapshot[]` (magnitude via `String(row.magnitude)`)
- `parseAffixSnapshot(json: string): AffixSnapshot[]` (never throws; malformed JSON, non-array, entries with a missing or non-string field or a non-integer magnitude string are dropped)
- `sellInstanceToVendor(ctx, input: { character, instance, template, npcId: bigint, record: boolean, fail }): boolean`. Order: quest refusal (returns false, no write) -> payout via `sellPayout` and perk message -> affix snapshot -> delete affixes and instance, credit gold -> resale listing (id kept only when this sale inserted it) -> buy-back row when `record` (update the character's row if present, else insert) -> unchanged reward line `You sell {template.name} for {value} gold.{perk suffix}`.

Buy-back row content: `itemName` is the display name when set else the template name; `rarity` is the quality tier when set else the template rarity; `npcName` is the npc row's name or `the vendor` when no npc row exists; `price` is the gold actually paid; `soldAt` is `ctx.timestamp`.

## Task Commits

1. Task 1: helper and `sell_item`: `2bf5b61d`
2. Task 2: the typed sell paths in `intent.ts`: `9f6c564d`

## intent.ts changes (matched by content; file re-read first, the 261006-hyu quick task did not touch the sell block)

Final line ranges in the post-commit file (approximate, in `registerIntentReducers`' `'sell '` block):
- imports (lines 6-9): `computeSellValue` import removed; `sellInstanceToVendor`, `sellPayout`, `isQuestItemTemplate`, `QUEST_ITEM_SALE_REFUSAL` added; `getPerkBonusByField` kept (still used by the junk and sell-N paths).
- 'sell junk' loop (~938-950): `isQuestItemTemplate(tmpl)` -> `continue`; per-instance `sellPayout`.
- 'sell N' loop (~971-1005): quest matches counted and skipped; refusal when only quest matches remain; per-instance `sellPayout`.
- single 'sell <item>' (~1030-1062): the whole payout/delete/listing/line body replaced by one `sellInstanceToVendor(..., record: true, fail)` call.
- The help text line is untouched. No other part of the file changed.

## Verification

- `quest_item_sale.test.ts`: 23 tests (sell_item quest refusal x2, single-sale recording x8 including negative-magnitude affix round trip, replacement, non-vendor npc, unknown npc, equipped guard; sell_all_junk x2; parseAffixSnapshot; typed single x3; typed sell N x4; typed junk x3). Written first and run RED (import missing, then the six typed-path assertions failing for the right reasons), then GREEN.
- Plan verification run: `quest_item_sale`, `vendor_pricing_parity`, `intent`, `character_info_intent`, `no_ripple_word`: 5 files, 178 tests pass with `--maxWorkers=1`.
- `grep -c "sellInstanceToVendor(" items.ts` = 1, `intent.ts` = 1; `grep -c "isQuestItemTemplate(" intent.ts` = 2; `grep -c "ctx.db.vendor_buyback"` is 0 in both reducers.

## Deviations from Plan

None - plan executed as written. (Note: `pnpm exec tsc` is not installed in `spacetimedb/`; type safety is covered by the vitest transform and, in Plan 09, by the client `vue-tsc -b` run.)

## Known Stubs

None. No generated item uses the `quest` slot yet (RESEARCH Q3), so the refusal is exercised by tests with a synthetic template.

## Threat Flags

None beyond the plan's register (T-50-20 to T-50-23 mitigated: single helper refuses first, sell N and junk skip, price is the gold actually paid server-side, snapshot taken before the delete with a negative-magnitude round trip, row written only to the private table).

## Self-Check: PASSED

- FOUND: helpers/vendor_sale.ts, reducers/quest_item_sale.test.ts
- FOUND commits: 2bf5b61d, 9f6c564d
