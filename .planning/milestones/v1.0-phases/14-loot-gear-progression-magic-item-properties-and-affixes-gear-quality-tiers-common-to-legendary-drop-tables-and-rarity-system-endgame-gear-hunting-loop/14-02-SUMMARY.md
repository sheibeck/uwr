---
phase: 14-loot-gear-progression
plan: 02
subsystem: loot
tags: [affix, quality-tiers, loot-pipeline, combat, items, spacetimedb]

# Dependency graph
requires:
  - phase: 14-01
    provides: ItemAffix table with by_instance index, qualityTier/displayName/isNamed fields on ItemInstance, affixDataJson/qualityTier on CombatLoot, affix_catalog.ts with PREFIXES/SUFFIXES/AFFIX_COUNT_BY_QUALITY
provides:
  - rollQualityTier() — deterministic quality tier roll using creatureLevel + seedBase+31n
  - generateAffixData() — picks 1/2/3 affixes for uncommon/rare/epic from affix_catalog
  - buildDisplayName() — combines prefix + base item name + suffix
  - generateLootTemplates() returns qualityTier + affixDataJson alongside template
  - CombatLoot.insert includes qualityTier, affixDataJson, isNamed fields
  - take_loot creates ItemAffix rows and updates ItemInstance quality fields
  - getEquippedBonuses sums affix stat bonuses for 5 new stats (magicResistance, lifeOnHit, cooldownReduction, manaRegen, weaponBaseDamage)
  - sell_item cleans up ItemAffix rows before deleting ItemInstance
affects:
  - Phase 14 Plan 03 (client-side loot display with quality colors and affix tooltips)
  - Phase 17 (World Bosses - legendary drop integration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Deterministic seed offsets pattern extended with 31n/37n/41n/43n for affix rolling (no Math.random())
    - Loot pipeline returns enriched objects {template, qualityTier, affixDataJson} instead of raw templates
    - JSON.parse/JSON.stringify for affix data transfer through CombatLoot row
    - Affix cleanup before delete pattern (sell_item deletes ItemAffix rows via by_instance index)

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts

key-decisions:
  - "Seed offsets 31n/37n/41n/43n for affix rolling — no collision with existing 11n/19n/23n combat offsets"
  - "JSON serialization bridges affix data from loot generation (combat.ts) to affix creation (items.ts)"
  - "getEquippedBonuses extended with 5 new stat fields (lifeOnHit, cooldownReduction, manaRegen, weaponBaseDamage, magicResistanceBonus) available for future combat integration"
  - "take_loot finds new ItemInstance by: same templateId + no equippedSlot + no qualityTier filter"

patterns-established:
  - "Loot item type: { template, qualityTier?, affixDataJson?, isNamed? } — enriched loot object pattern"
  - "Affix stat application: statKey string switch in getEquippedBonuses maps to bonus accumulator fields"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 14 Plan 02: Loot Generation Pipeline Summary

**Deterministic quality tier rolling and affix generation pipeline: enemy kills roll quality tiers by creature level, generate 1-3 affixes for non-common gear, take_loot creates ItemAffix rows and updates ItemInstance display name, equipped affixes contribute to character stat totals.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T00:44:47Z
- **Completed:** 2026-02-17T00:47:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Full loot generation pipeline from enemy kill through equipped stat bonuses now functional
- Quality tier rolling is deterministic and level-gated: Tier 1 zones (1-10) can only drop common/uncommon, Tier 2 (11-20) adds rare, Tier 3 (21-30) adds epic, Tier 4+ allows all tiers
- Affix counts follow plan: uncommon=1 prefix, rare=1 prefix + 1 suffix, epic=1 prefix + 1 suffix + 1 extra
- Equipped affix bonuses flow into getEquippedBonuses() and subsequently into recomputeCharacterDerived()
- sell_item now properly cleans up ItemAffix rows to prevent database leaks

## Task Commits

Each task was committed atomically:

1. **Task 1: Quality tier rolling and affix generation** - `b384f56` (feat)
2. **Task 2: take_loot affix rows, sell_item cleanup, getEquippedBonuses affix stats** - `7b348a1` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `spacetimedb/src/helpers/items.ts` - Added rollQualityTier(), generateAffixData(), buildDisplayName(), getMaxTierForLevel(); extended getEquippedBonuses() with 5 new stat fields and ItemAffix summation loop
- `spacetimedb/src/reducers/combat.ts` - Imported new helpers; changed generateLootTemplates() to return enriched objects with qualityTier+affixDataJson; updated CombatLoot.insert to pass new fields
- `spacetimedb/src/reducers/items.ts` - Extended take_loot to create ItemAffix rows and update ItemInstance; added sell_item affix cleanup; imported buildDisplayName

## Decisions Made
- Seed offsets 31n/37n/41n/43n for affix rolling — no collision with existing 11n/19n/23n combat offsets
- JSON serialization to bridge affix data between loot generation time and take-loot time
- take_loot finds the newly created ItemInstance by filtering for same templateId + no equippedSlot + no qualityTier (the freshly inserted one won't have qualityTier set yet)
- lifeOnHit, cooldownReduction, and manaRegen accumulated in getEquippedBonuses but not yet consumed by combat reducers (future Tier 3+ integration)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — TypeScript compiled with zero new errors. All 224 errors were pre-existing (implicit any types in closure params, pre-existing number/bigint operator issues in other files).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full backend loot pipeline is complete and ready for client-side display
- Client needs to show qualityTier colors on loot items and item tooltips showing affix bonuses
- getEquippedBonuses now returns magicResistanceBonus, lifeOnHit, cooldownReduction, manaRegen, weaponBaseDamage — client can display these in stats panel
- Legendary drops (LEGENDARIES in affix_catalog.ts) still need combat integration via World Bosses phase

---
*Phase: 14-loot-gear-progression*
*Completed: 2026-02-17*
