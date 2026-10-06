---
phase: 50-ledger-screens-character-and-economy
plan: 06
subsystem: spacetimedb
tags: [spacetimedb, schema, view, buy-back, privacy]

requires: []
provides:
  - "spacetimedb/src/schema/tables.ts: private VendorBuyback table registered as vendor_buyback"
  - "spacetimedb/src/views/vendor_buyback.ts: myVendorBuybackRows, registerVendorBuybackViews (view my_vendor_buyback)"
affects: [50-07 sell helper and buyback reducer, 50-08, 50-09 publish (--break-clients, never a clear), 50-10 client subscription]

tech-stack:
  added: []
  patterns:
    - "Private table plus public per-sender view keyed by the sender's own active character (primary-key lookups only)"

key-files:
  created:
    - spacetimedb/src/views/vendor_buyback.ts
    - spacetimedb/src/views/vendor_buyback.test.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/views/types.ts
    - spacetimedb/src/views/index.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/views/llm.test.ts

key-decisions:
  - "One row per character (characterId is the primary key, no autoInc), replaced by the next sale"
  - "Affix magnitudes are stored as decimal strings inside affixesJson because item_affix.magnitude is i64 and JSON.stringify throws on bigint"
  - "The schema change is additive (one table, one view), so Plan 09 publishes with --break-clients and never clears"

requirements-completed: [LDG-09]

status: complete
duration: 12min
completed: 2026-10-06
---

# Phase 50 Plan 06: vendor_buyback table and my_vendor_buyback view Summary

The server now has a private one-row-per-character `vendor_buyback` table and the public per-sender view `my_vendor_buyback`, which returns only the signed-in player's active character's last sale. Nothing writes to the table yet; Plans 07 and 08 add the sell helper and the buy-back reducer.

## Exact column list (Plans 07, 08 and 10 use this)

Table `vendor_buyback` (no `public` flag; `table({ name: 'vendor_buyback' }, {...})`):

| Column | Type | Notes |
|--------|------|-------|
| characterId | u64, primary key (no autoInc) | one row per character; accessor `ctx.db.vendor_buyback.characterId` |
| npcId | u64 | the vendor that bought it |
| npcName | string | |
| locationId | u64 | place of the sale |
| templateId | u64 | |
| itemName | string | |
| rarity | string | |
| quantity | u64 | |
| price | u64 | the exact gold paid |
| qualityTier | string, optional | |
| craftQuality | string, optional | |
| displayName | string, optional | |
| isNamed | bool, optional | |
| isTemporary | bool, optional | |
| affixesJson | string | `[{ affixType, affixKey, affixName, statKey, magnitude }]`, magnitude a decimal string |
| listingId | u64, optional | the resale vendor_inventory row the sale created, if any |
| soldAt | timestamp | |

View: `my_vendor_buyback` (public, `t.array(VendorBuyback.rowType)`): `ctx.db.player.id.find(ctx.sender)`, return `[]` without an active character, else `[row]` from `ctx.db.vendor_buyback.characterId.find(activeCharacterId)` or `[]`. No scan. The client table handle is generated as `tables.myVendorBuyback` after `pnpm spacetime:generate -y` (Plan 09).

## Task Commits

1. Task 1: the private table: `c062c7e9`
2. Task 2: the view and its wiring: `bdadd4e4`

## Verification

- `views/vendor_buyback.test.ts`: 11 tests (private and not public, exact columns and flags, strict mock accessors, no player, no active character, no row, two owners and a third sender, noScanDb proxy, view registered as `my_vendor_buyback` and public, registered handler returns the sender row only).
- `src/views` and `src/schema` together: 7 files, 111 tests pass with `--maxWorkers=1`; `llm_privacy.test.ts` still passes.
- `grep -c "registerVendorBuybackViews(deps)" views/index.ts` is 1; `grep -c "VendorBuyback" index.ts` is 2; `grep -c "\.iter()" views/vendor_buyback.ts` is 0.
- `git show c062c7e9` removes no lines from `schema/tables.ts` (additions only).

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing registerViews wiring test listed the view deps by name**
- **Found during:** Task 2
- **Issue:** `views/llm.test.ts` builds a deps object from a fixed list of table names; `registerVendorBuybackViews` read `VendorBuyback.rowType` from an undefined entry and the test failed.
- **Fix:** added `'VendorBuyback'` to that list (one token).
- **Files modified:** `spacetimedb/src/views/llm.test.ts`
- **Commit:** `bdadd4e4`

## Known Stubs

None. The table is intentionally empty until Plan 07 writes to it.

## Threat Flags

None beyond the plan's register (T-50-17 mitigated by the recorder test, the two-owner test and the per-sender key; T-50-18 by the noScanDb test; T-50-19 by the additive-only diff).

## Self-Check: PASSED

- FOUND: views/vendor_buyback.ts, views/vendor_buyback.test.ts
- FOUND commits: c062c7e9, bdadd4e4
