---
phase: quick-143
plan: 01
subsystem: loot-generation
tags: [loot, affixes, quality-tiers, tooltip, balance]
dependency_graph:
  requires: [14-04]
  provides: [rare-affix-budget-cap, danger-based-quality-tiers, tier-tooltip-label]
  affects: [useInventory, useCombat, helpers/items, reducers/combat]
tech_stack:
  added: []
  patterns: [danger-based-tier-selection, affix-budget-redistribution, quality-tier-to-number-mapping]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/reducers/combat.ts
    - src/composables/useInventory.ts
    - src/composables/useCombat.ts
decisions:
  - "Rare affix budget capped at 2n total magnitude via post-processing trim (not pre-generation constraint)"
  - "Danger-based tier selection uses 5 breakpoints (<=120=common, 121-170=uncommon, 171-250=rare, 251-400=epic, >400=epic cap)"
  - "12% tier-up roll uses (seedBase + 47n) % 100n to avoid seed collision with existing offsets"
  - "Level cap still applies as upper bound over danger-based result"
  - "qualityTierToNumber defined locally in each composable (no shared utility file needed)"
metrics:
  duration: ~10min
  completed: 2026-02-17
---

# Quick Task 143: Rebalance Affix Budget for Rare Items and Danger-Based Quality Tiers

**One-liner:** Rare item affix budget capped at +2 total magnitude, quality tier rolls now driven by zone danger level with 12% tier-up chance, and "Tier N" label added to all item tooltips.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Backend — affix budget cap + danger-based quality tier rolls | b3d9678 | helpers/items.ts, reducers/combat.ts, module_bindings/ |
| 2 | Client — add Tier label to tooltip descriptions | 82aa650 | useInventory.ts, useCombat.ts |

## What Was Built

### Task 1: Backend Loot Changes

**`rollQualityTier` in `helpers/items.ts`:**
- Added optional `dangerMultiplier?: bigint` parameter
- When provided: selects base tier from danger breakpoints (<=120=common, 121-170=uncommon, 171-250=rare, 251-400=epic, capped at epic — no random legendaries)
- 12% tier-up roll using `(seedBase + 47n) % 100n`; bumps base tier by 1, capped at epic
- `getMaxTierForLevel(creatureLevel)` applied as final upper cap
- When `dangerMultiplier` is undefined: falls back to original level-based logic (backward compatible for `create_test_item`)

**`generateAffixData` in `helpers/items.ts`:**
- Post-processing step for `qualityTier === 'rare'`: iterates rolled affixes, trims magnitudes until total <= 2n
- Affixes with 0n magnitude after trimming are excluded
- Only rare tier affected; common, uncommon, epic, legendary unchanged

**`generateLootTemplates` in `reducers/combat.ts`:**
- Added `dangerMultiplier?: bigint` parameter; passed to `rollQualityTier`
- Call site updated: looks up `combat.locationId` → `location.regionId` → `region.dangerMultiplier` once before the character loop
- Falls back to 100n (common-tier zone danger) if location/region not found
- Module republished with `--clear-database`, bindings regenerated

### Task 2: Client Tier Labels

**`useInventory.ts`:**
- Added `qualityTierToNumber` helper (common=1, uncommon=2, rare=3, epic=4, legendary=5)
- Inventory items description: `Tier N • qualityTier • typeField • slot`
- Equipped slots description: same pattern with `equippedQualityTier`

**`useCombat.ts`:**
- Added `qualityTierToNumber` helper (same mapping)
- Active loot description: `Tier N • activeLootQualityTier • typeField • slot`
- Pending loot description: `Tier N • qualityTier • typeField • slot`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/items.ts
- FOUND: spacetimedb/src/reducers/combat.ts
- FOUND: src/composables/useInventory.ts
- FOUND: src/composables/useCombat.ts
- FOUND commit: b3d9678 (Task 1 backend)
- FOUND commit: 82aa650 (Task 2 client)
