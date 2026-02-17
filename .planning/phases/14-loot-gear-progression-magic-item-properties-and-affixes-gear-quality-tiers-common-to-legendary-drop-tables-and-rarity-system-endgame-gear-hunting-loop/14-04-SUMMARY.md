---
phase: 14-loot-gear-progression
plan: 04
subsystem: ui
tags: [spacetimedb, vue, loot, quality-tiers, affixes, salvage, animation]

# Dependency graph
requires:
  - phase: 14-03
    provides: salvage_item reducer, named legendary drops, ItemAffix table, qualityTier/displayName/affixDataJson on CombatLoot and ItemInstance
provides:
  - Quality-colored item names in loot panel and inventory (white/green/blue/purple/orange)
  - Affix stat lines in item tooltips (below base stats) with affix name labels
  - Epic/Legendary flash animation on new loot drops (lootFlash/lootFlashLegendary keyframes)
  - Colored tile borders in inventory bag matching quality tier (2px solid)
  - Salvage context menu for unequipped gear items with confirmation dialog
  - ItemAffix table subscription via useGameData
  - Human verification checkpoint awaiting end-to-end QA
affects: [client loot display, inventory panel, tooltip system, quality color system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - qualityTier field on pendingLoot drives display color instead of template.rarity
    - affixDataJson parsed client-side to produce affixStats array for tooltip rendering
    - CSS @keyframes in Vue <style> block for loot flash animations
    - qualityBorder{Tier} style objects in styles.ts drive dynamic border colors

key-files:
  created:
    - src/module_bindings/item_affix_table.ts
    - src/module_bindings/item_affix_type.ts
    - src/module_bindings/salvage_item_reducer.ts
    - src/module_bindings/salvage_item_type.ts
  modified:
    - src/composables/useGameData.ts
    - src/composables/useCombat.ts
    - src/composables/useInventory.ts
    - src/components/LootPanel.vue
    - src/components/InventoryPanel.vue
    - src/components/CharacterInfoPanel.vue
    - src/ui/styles.ts
    - src/App.vue
    - src/module_bindings/index.ts
    - src/module_bindings/combat_loot_type.ts
    - src/module_bindings/item_instance_type.ts

key-decisions:
  - "Module published with --clear-database -y due to non-optional new columns on combat_loot and item_instance tables (qualityTier, affixDataJson, isNamed)"
  - "qualityTier displayed in loot/inventory UI uses CombatLoot.qualityTier ?? template.rarity as fallback"
  - "affixDataJson parsed client-side from JSON string rather than fetching ItemAffix rows during loot phase (affixes stored as JSON on CombatLoot row for pre-take display)"
  - "ItemAffix rows used for inventory tooltip (post-take) while affixDataJson used for loot panel (pre-take)"
  - "rarityEpic color changed from facc15 (yellow) to aa44ff (purple), rarityLegendary confirmed as ff8800 (orange)"

patterns-established:
  - "formatAffixStatKey helper maps backend statKey strings to human-readable UI labels (duplicated in useCombat and useInventory)"
  - "qualityBorderStyle computed from styles.qualityBorder{Tier}.borderColor for dynamic border injection"

# Metrics
duration: 6min
completed: 2026-02-17
---

# Phase 14 Plan 04: Client Loot Quality UI Summary

**Published module with clear-database, regenerated bindings, and integrated full loot quality display: quality-colored names, affix tooltip lines, Epic/Legendary flash animation, and salvage context menu in LootPanel and InventoryPanel.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-17T00:00:00Z
- **Completed:** 2026-02-17T00:06:00Z
- **Tasks:** 2/3 (Task 3 is human-verify checkpoint)
- **Files modified:** 14

## Accomplishments

- Published SpacetimeDB module with --clear-database to handle non-optional new columns (qualityTier, affixDataJson, isNamed on CombatLoot and ItemInstance)
- Regenerated client bindings with ItemAffix table, salvage_item reducer, and updated CombatLoot/ItemInstance types
- Wired ItemAffix subscription (useGameData), extended pendingLoot (useCombat) and inventoryItems (useInventory) with affixStats, qualityTier, displayName
- LootPanel: quality-colored names, colored tile borders, affix stat lines, Epic/Legendary flash via CSS @keyframes
- InventoryPanel: colored bag slot borders, quality-colored item names, affix tooltip lines, Salvage context menu with confirmation dialog
- Tooltip section in App.vue extended to show affixStats lines with green color below base stats

## Task Commits

Each task was committed atomically:

1. **Task 1: Publish module, regenerate bindings, wire ItemAffix subscription and composables** - `8e7345d` (feat)
2. **Task 2: Quality colors, affix tooltips, Epic/Legendary flash, salvage context menu** - `b321380` (feat)

*Task 3 (human-verify) is a checkpoint — awaiting human verification*

## Files Created/Modified

- `src/module_bindings/item_affix_table.ts` - New: ItemAffix table binding
- `src/module_bindings/item_affix_type.ts` - New: ItemAffix type binding
- `src/module_bindings/salvage_item_reducer.ts` - New: SalvageItem reducer binding
- `src/module_bindings/salvage_item_type.ts` - New: SalvageItem type binding
- `src/composables/useGameData.ts` - Added itemAffixes useTable subscription
- `src/composables/useCombat.ts` - Extended pendingLoot with qualityTier, affixStats, displayName; added formatAffixStatKey helper
- `src/composables/useInventory.ts` - Added ItemAffixRow integration, affixStats/qualityTier/displayName per item, salvageItem reducer
- `src/components/LootPanel.vue` - Quality colors, borders, affix lines, flash animation
- `src/components/InventoryPanel.vue` - Quality borders, salvage context menu, affixStats prop type
- `src/components/CharacterInfoPanel.vue` - Forward salvage-item event
- `src/ui/styles.ts` - lootFlash styles, qualityBorder styles, rarityEpic=purple, rarityLegendary=orange
- `src/App.vue` - itemAffixes destructure, salvageItem wire-up, tooltip affixStats display

## Decisions Made

- Published with --clear-database -y because non-optional columns on existing tables require manual migration (SpacetimeDB 1.11 limitation)
- Affix display uses two data sources: `affixDataJson` (JSON on CombatLoot row) for loot panel pre-take display, and ItemAffix table rows for inventory post-take display
- rarityEpic changed from yellow (#facc15) to purple (#aa44ff) per plan spec
- Display name for loot constructed client-side from affixDataJson prefix/suffix fields

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Schema migration required --clear-database flag: three non-optional columns added to combat_loot (qualityTier, affixDataJson, isNamed) and three to item_instance (qualityTier, displayName, isNamed). SpacetimeDB 1.11 requires default value annotation for adding non-optional columns to existing tables — cleared database as expected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Human verification (Task 3) required to confirm end-to-end loot quality flow works in browser
- After human verification: Phase 14 Plan 04 complete, Phase 14 (Loot & Gear Progression) done
- Affix bonuses (`lifeOnHit`, `cooldownReduction`, `manaRegen`) accumulated in getEquippedBonuses but not yet consumed by combat — available for future Tier 3+ integration (documented in decision #106)

---
*Phase: 14-loot-gear-progression*
*Completed: 2026-02-17*
