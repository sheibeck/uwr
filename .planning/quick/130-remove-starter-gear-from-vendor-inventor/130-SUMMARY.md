---
phase: quick-130
plan: 01
subsystem: items
tags: [seeding, vendors, loot, items, world-drop, balance]

requires:
  - phase: quick-129
    provides: World-drop gear pool (STARTER_ITEM_NAMES exclusion set already in ensureLootTables)

provides:
  - Vendor inventories filtered to exclude all starter gear items
  - World-drop tier 1 weapons normalized to weaponBaseDamage 5 / weaponDps 7
  - World-drop tier 1 armor +1 AC over starter equivalent per slot/type

affects:
  - vendor-inventory
  - loot-tables
  - world-drop-gear
  - starter-items

tech-stack:
  added: []
  patterns:
    - "STARTER_ITEM_NAMES at module scope shared by ensureLootTables and ensureVendorInventory"

key-files:
  created: []
  modified:
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/seeding/ensure_items.ts

key-decisions:
  - "STARTER_ITEM_NAMES promoted to module scope so both ensureLootTables and ensureVendorInventory share one source of truth"
  - "Starter accessories (Rough Band, Worn Cloak, Traveler Necklace, Glimmer Ring, Shaded Cloak) added to STARTER_ITEM_NAMES exclusion set"
  - "All tier 1 world-drop weapons set to uniform 5 base damage / 7 DPS (+1 over starter 4/6 baseline)"
  - "Tier 1 world-drop armor each +1 AC over starter equivalent — cloth 4/3/2, leather 5/4/3, chain 6/5/4, plate 7/6/5"

duration: 8min
completed: 2026-02-17
---

# Quick Task 130: Remove Starter Gear from Vendor Inventories Summary

**Vendor inventories now exclude all starter gear via module-scope STARTER_ITEM_NAMES filter, and world-drop tier 1 gear is tuned to +1 over starter (weapons 5/7 base/dps, armor +1 AC per slot)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-17T13:24:55Z
- **Completed:** 2026-02-17T13:32:15Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Promoted `STARTER_ITEM_NAMES` from inside `ensureLootTables` to module scope so both loot filtering and vendor filtering share the same constant
- Added 5 starter accessory names to the exclusion set (Rough Band, Worn Cloak, Traveler Necklace, Glimmer Ring, Shaded Cloak)
- Added `!STARTER_ITEM_NAMES.has(row.name)` to `allEligible` filter in `ensureVendorInventory` — vendors now stock only world-drop gear and consumables
- Normalized all 8 tier 1 world-drop weapons to `weaponBaseDamage: 5n, weaponDps: 7n` (+1/+1 over starter 4/6 baseline)
- Updated all 12 tier 1 world-drop armor pieces to +1 AC over their starter equivalents
- Published module successfully, database updated with no errors

## Task Commits

1. **Task 1: Exclude starter items from vendor inventories** - `25dd72c` (feat)
2. **Task 2: Tune world-drop tier 1 gear stats to +1 over starter** - `ba5d315` (feat)
3. **Task 3: Publish and verify** - (no code changes; publish only)

## Files Created/Modified

- `spacetimedb/src/seeding/ensure_enemies.ts` - STARTER_ITEM_NAMES moved to module scope, starter accessories added, ensureVendorInventory allEligible filter extended
- `spacetimedb/src/seeding/ensure_items.ts` - All tier 1 world-drop weapon stats normalized to 5/7, all tier 1 world-drop armor +1 AC

## Decisions Made

- STARTER_ITEM_NAMES promoted to module scope (not duplicated) — single source of truth for both loot and vendor exclusion
- Starter accessories added to the exclusion set — they're granted at character creation, should not appear in shops
- Tier 1 world-drop weapons set to a uniform 5/7 rather than varying stats — cleaner progression, removes outliers like Rusty Axe 7/9 which was already better than vendor alternatives

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Vendor inventories now sell only consumables, food, utilities, accessories (world-drop), and world-drop gear
- World-drop commons provide a clear, small motivation to kill enemies in early zones
- Starter gear remains exclusively granted at character creation

---
*Phase: quick-130*
*Completed: 2026-02-17*
