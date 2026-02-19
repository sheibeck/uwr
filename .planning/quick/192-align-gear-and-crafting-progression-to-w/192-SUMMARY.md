---
phase: quick-192
plan: 01
subsystem: loot
tags: [spacetimedb, typescript, loot, crafting, gear-progression, world-tiers]

# Dependency graph
requires:
  - phase: 13.1-dual-axis-gear-system
    provides: craftQuality field on ItemInstance, materialTierToCraftQuality helper
  - phase: 14-loot-gear-progression
    provides: CombatLoot table, qualityTier rarity system, take_loot reducer
provides:
  - TIER_RARITY_WEIGHTS and TIER_QUALITY_WEIGHTS named config constants in items.ts
  - rollQualityForDrop function for independent quality axis rolling
  - getWorldTier with T5 (L41-50) support
  - craftQuality column on CombatLoot schema
  - craftQuality flows from generateLootTemplates -> CombatLoot -> ItemInstance via take_loot
  - Equip level gate removed (any obtained item can be equipped)
  - materialTierToCraftQuality is now probability-weighted when seed provided
  - CRAFT_QUALITY_PROBS config constant in crafting_materials.ts
affects: [gear-ui, crafting-panel, inventory-tooltip, loot-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-axis loot roll: rarity (rollQualityTier, seed offset 53n) + quality (rollQualityForDrop, seed offset 67n) rolled independently per drop
    - Config-table-driven probability: TIER_RARITY_WEIGHTS and TIER_QUALITY_WEIGHTS are tunable named constants
    - Probabilistic crafting quality: materialTierToCraftQuality uses CRAFT_QUALITY_PROBS when seed provided, deterministic fallback when not

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/data/crafting_materials.ts
    - client/src/module_bindings/combat_loot_type.ts (regenerated)

key-decisions:
  - "TIER_RARITY_WEIGHTS and TIER_QUALITY_WEIGHTS are exported named constants — all probability thresholds tunable without touching function bodies"
  - "rollQualityForDrop uses seed offset 67n to avoid collision with rollQualityTier seed offset 53n — two independent axis rolls from same seedBase"
  - "getWorldTier replaces getMaxTierForLevel; backward-compat alias kept for any callers; T5 returns 5 for L41-50"
  - "craftQuality column on CombatLoot is optional — existing rows unaffected; column enables loot-roll to item-take quality flow"
  - "Equip level gate removed per world-tier spec: gear availability is world-driven, any obtained item can be equipped regardless of character level"
  - "materialTierToCraftQuality accepts optional seed; deterministic fallback preserved for callers without seed context (backward compat)"
  - "CRAFT_QUALITY_PROBS: T2 mats 65% reinforced (not 100%), T3 mats 60% exquisite — probability-weighted not deterministic"
  - "craftQuality propagated in both take_loot (single item) and take_all_loot (batch path) for both common and non-common rarities"

patterns-established:
  - "World drop two-axis roll pattern: call rollQualityTier for rarity axis, rollQualityForDrop for quality axis, both from same seedBase with different offsets"
  - "Config constant pattern for probability tables: Record<tierNumber, tuple> named constants at module top level"

requirements-completed: [GEAR-PROG-01, GEAR-PROG-02, GEAR-PROG-03, GEAR-PROG-04]

# Metrics
duration: 12min
completed: 2026-02-19
---

# Quick Task 192: Align Gear and Crafting Progression to World-Tier Spec Summary

**Dual-axis world drop system: rarity and quality rolled independently per enemy level band using TIER_RARITY_WEIGHTS/TIER_QUALITY_WEIGHTS named config constants, T5 tier added, equip gate removed, craftQuality flows from loot-roll to item-take, crafting quality made probabilistic**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-02-19T13:33:17Z
- **Completed:** 2026-02-19T13:45:00Z
- **Tasks:** 3/3
- **Files modified:** 5 server + 44 binding files

## Accomplishments

- Added `getWorldTier` (T5 at L41-50) replacing `getMaxTierForLevel` with backward-compat alias
- Added `TIER_RARITY_WEIGHTS` and `TIER_QUALITY_WEIGHTS` as exported named config constants with 5-tier entries — all magic numbers replaced
- Added `rollQualityForDrop` for independent quality axis with seed offset 67n to avoid collision with rarity roll offset 53n
- Rewrote `rollQualityTier` to use `TIER_RARITY_WEIGHTS` with danger bonus shift (max +10%)
- Added `craftQuality` optional column to `CombatLoot` schema; wired from `generateLootTemplates` through `CombatLoot` insert through `take_loot` and `take_all_loot` to `ItemInstance` for both common and non-common rarity items
- Removed equip level gate from `equip_item` reducer with explanatory comment
- Added `CRAFT_QUALITY_PROBS` config constant to `crafting_materials.ts`; made `materialTierToCraftQuality` probability-weighted when seed provided (T2: 65% reinforced, T3: 60% exquisite)
- Updated `craft_recipe` reducer to pass `craftSeed` from `ctx.timestamp.microsSinceUnixEpoch + character.id` to `materialTierToCraftQuality`
- Published module with `--clear-database -y` and regenerated all client bindings

## Task Commits

1. **Task 1: Add world-tier config constants and rollQualityForDrop** - `3b33e0d` (feat)
2. **Task 2: Wire craftQuality through schema, combat, items, crafting** - `792c774` (feat)
3. **Task 3: Publish with --clear-database and regenerate bindings** - `9ff573d` (feat)

## Files Created/Modified

- `spacetimedb/src/helpers/items.ts` - Added getWorldTier, TIER_RARITY_WEIGHTS, TIER_QUALITY_WEIGHTS, rollQualityForDrop; rewrote rollQualityTier to use config constants
- `spacetimedb/src/schema/tables.ts` - Added craftQuality optional column to CombatLoot table
- `spacetimedb/src/reducers/combat.ts` - Import rollQualityForDrop; call in generateLootTemplates; pass craftQuality to CombatLoot insert
- `spacetimedb/src/reducers/items.ts` - take_loot and take_all_loot propagate craftQuality to ItemInstance; equip_item level gate removed; craft_recipe passes craftSeed
- `spacetimedb/src/data/crafting_materials.ts` - Added CRAFT_QUALITY_PROBS; updated materialTierToCraftQuality to be probability-weighted with seed
- `client/src/module_bindings/` - All bindings regenerated; combat_loot_type.ts now includes craftQuality field

## Decisions Made

- T1 creatures retain level-scaled uncommon chance (not TIER_RARITY_WEIGHTS direct roll) to preserve the existing fine-grained T1 drop economy — TIER_RARITY_WEIGHTS used for T2+ only
- craftQuality propagation added to take_all_loot batch path as well as take_loot single-item path for consistency
- getMaxTierForLevel kept as backward-compat alias (not deleted) since other callers reference it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added craftQuality propagation to take_all_loot batch path**
- **Found during:** Task 2 (propagating craftQuality through take_loot)
- **Issue:** Plan documented craftQuality propagation only for take_loot (single item reducer). take_all_loot is the same code path for batch looting and needed the same fix to prevent quality being lost on bulk loot operations.
- **Fix:** Added craftQuality propagation (both non-common and common branches) to take_all_loot in addition to take_loot
- **Files modified:** spacetimedb/src/reducers/items.ts
- **Committed in:** 792c774 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical coverage)
**Impact on plan:** Single-line omission in plan; fix necessary for correctness. No scope creep.

## Issues Encountered

None — TypeScript compiled clean in all modified files. Module published without errors. Bindings regenerated with craftQuality field confirmed in combat_loot_type.ts.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- World drop gear now has both rarity and quality axes set on CombatLoot rows
- craftQuality flows from drop time to ItemInstance via take_loot/take_all_loot
- Client inventory tooltip can now display quality label for world-dropped items (tierLabel in useInventory already derives from craftQuality)
- Equip level gate removed: players can immediately equip any gear found
- Crafted gear quality is probabilistic: T2 mats 65% reinforced, not 100% — provides meaningful variation in crafting outcomes

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/items.ts (getWorldTier, TIER_RARITY_WEIGHTS, TIER_QUALITY_WEIGHTS, rollQualityForDrop all exported)
- FOUND: spacetimedb/src/schema/tables.ts (craftQuality column on CombatLoot at line 542)
- FOUND: spacetimedb/src/reducers/combat.ts (craftQuality wired through generateLootTemplates)
- FOUND: spacetimedb/src/reducers/items.ts (craftQuality propagated in take_loot and take_all_loot; equip gate removed)
- FOUND: spacetimedb/src/data/crafting_materials.ts (CRAFT_QUALITY_PROBS and probabilistic materialTierToCraftQuality)
- FOUND: client/src/module_bindings/combat_loot_type.ts (craftQuality: option(string) in generated bindings)
- Commits verified: 3b33e0d, 792c774, 9ff573d

---
*Phase: quick-192*
*Completed: 2026-02-19*
