---
phase: quick-194
plan: 01
subsystem: crafting/salvage
tags: [salvage, reagents, affixes, crafting]
dependency_graph:
  requires: []
  provides: [affix-constrained salvage reagent drops]
  affects: [salvage_item reducer]
tech_stack:
  added: []
  patterns: [affix-constrained pool filtering]
key_files:
  modified:
    - spacetimedb/src/reducers/items.ts
decisions:
  - Affix deletion happens at end of reducer; reading affixes before deletion is safe — no need to cache affixes earlier
  - No fallback to full reagent pool when item has no affixes — guards with filteredModDefs.length > 0
metrics:
  duration: ~5min
  completed: 2026-02-18
---

# Phase quick-194 Plan 01: Fix Salvage to Only Yield Modifier Reagents for Item's Affixes Summary

Salvage reagent drops are now constrained to reagents whose statKey matches the salvaged item's actual ItemAffix rows — armorClassBonus items yield Iron Ward, hpBonus items yield Life Stone, common items (no affixes) yield nothing.

## What Was Built

Single targeted change to `salvage_item` reducer in `spacetimedb/src/reducers/items.ts`:

1. Before the bonus reagent roll, collect `affixStatKeys` set from `ctx.db.itemAffix.by_instance.filter(instance.id)` (affixes still exist at this point — deletion happens at the end of the reducer).
2. Filter `CRAFTING_MODIFIER_DEFS` to `filteredModDefs` where `d.statKey` is in `affixStatKeys`.
3. Guard: only roll and pick when `filteredModDefs.length > 0` — common items (0 affixes) skip the block entirely.
4. `modIdx` uses `% BigInt(filteredModDefs.length)` for correct modulus over the constrained pool.

## Commits

| Hash | Message |
|------|---------|
| c03cb31 | feat(quick-194): constrain salvage reagent drop to item's actual affix statKeys |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- Module published successfully: `Build finished successfully`
- `affixStatKeys` appears in salvage_item reducer (confirmed via code review)
- `CRAFTING_MODIFIER_DEFS.length` does NOT appear in the salvage block (grep: no matches)
- `filteredModDefs.length` used as modulus (line 1816)

## Self-Check: PASSED

- File modified: `spacetimedb/src/reducers/items.ts` — exists and updated
- Commit c03cb31 — exists (git log confirmed)
- Module publishes without errors — confirmed
