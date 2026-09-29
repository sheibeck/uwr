---
phase: 14-loot-gear-progression
plan: 01
subsystem: backend-schema
tags: [schema, affix-system, loot, quality-tiers, legendary]
dependency_graph:
  requires: []
  provides:
    - ItemAffix table with by_instance index
    - ItemInstance quality fields (qualityTier, displayName, isNamed)
    - CombatLoot quality fields (qualityTier, affixDataJson, isNamed)
    - affix_catalog.ts with PREFIXES, SUFFIXES, LEGENDARIES arrays
    - QUALITY_TIERS, AFFIX_COUNT_BY_QUALITY, QUALITY_TIER_COLORS constants
  affects:
    - spacetimedb/src/schema/tables.ts
    - Plan 14-02 (loot generation logic depends on these tables and catalog)
tech_stack:
  added: []
  patterns:
    - Optional fields appended at end of table columns for SpacetimeDB auto-migration
    - Single-column btree index on itemInstanceId for affix lookups
    - BigInt magnitudeByTier arrays indexed by quality tier number (0=common, 1=uncommon, etc.)
key_files:
  created:
    - spacetimedb/src/data/affix_catalog.ts
  modified:
    - spacetimedb/src/schema/tables.ts
decisions:
  - "Legendary drop sources use placeholder enemy names from existing templates pending Phase 17 World Bosses"
  - "lifeOnHit, cooldownReduction, manaRegen are tier 3+ only (minTier=3) per user decision"
  - "No utility affixes (gold find, XP boost) — all affixes are combat-focused per user decision"
  - "QUALITY_TIER_NUMBER exported as index helper for magnitudeByTier lookups in downstream plans"
metrics:
  duration: 2min
  completed: 2026-02-17
  tasks: 2
  files: 2
---

# Phase 14 Plan 01: Schema and Affix Catalog Foundation Summary

ItemAffix table, quality field extensions on ItemInstance/CombatLoot, and a complete affix catalog with 12 prefixes, 11 suffixes, 4 legendary definitions, and quality tier constants.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extend schema with ItemAffix table, ItemInstance and CombatLoot quality fields | 91d1a5b | spacetimedb/src/schema/tables.ts |
| 2 | Create affix catalog with prefixes, suffixes, and legendary definitions | 6071a4a | spacetimedb/src/data/affix_catalog.ts |

## What Was Built

### Task 1: Schema Extensions

Added `ItemAffix` table to `tables.ts`:
- `id` (u64, primaryKey, autoInc), `itemInstanceId` (u64), `affixType` (string), `affixKey` (string), `affixName` (string), `statKey` (string), `magnitude` (i64)
- Single-column `by_instance` btree index on `itemInstanceId`
- Table is `public: true` so clients can subscribe

Extended `ItemInstance` with 3 optional fields appended at the end:
- `qualityTier: t.string().optional()` — 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
- `displayName: t.string().optional()` — computed full name with prefix+base+suffix
- `isNamed: t.bool().optional()` — true only for legendary unique items

Extended `CombatLoot` with 3 optional fields appended at the end:
- `qualityTier: t.string().optional()` — quality tier rolled at combat time
- `affixDataJson: t.string().optional()` — JSON array of affix keys to apply when looted
- `isNamed: t.bool().optional()` — true for legendary uniques

Added `ItemAffix` to the schema export.

### Task 2: Affix Catalog (`spacetimedb/src/data/affix_catalog.ts`)

Types:
- `AffixDef` — key, name, type, slots, statKey, minTier, magnitudeByTier
- `LegendaryDef` — key, name, baseTemplateName, slot, affixes, enemyTemplateName

**PREFIXES (12 entries):**
- Weapon: mighty (strBonus), swift (dexBonus), arcane (intBonus), wise (wisBonus), keen (weaponBaseDamage), vampiric (lifeOnHit, tier 3+)
- Armor: sturdy (armorClassBonus), vital (hpBonus), warded (magicResistanceBonus), fortified (armorClassBonus, tier 2+)
- Accessory: empowered (intBonus), resolute (wisBonus)

**SUFFIXES (11 entries):**
- Weapon: of_power (strBonus), of_precision (dexBonus), of_haste (cooldownReduction, tier 3+)
- Armor: of_endurance (hpBonus), of_strength (strBonus), of_the_mind (intBonus), of_warding (magicResistanceBonus, tier 2+), of_resilience (armorClassBonus)
- Accessory: of_mana_flow (manaRegen, tier 3+), of_insight (wisBonus), of_vigor (hpBonus)

**LEGENDARIES (4 entries):**
- Soulrender — mainHand weapon; Vampiric prefix (lifeOnHit 5) + of Haste suffix (cooldownReduction 15); drops from Fen Witch (placeholder)
- Ironveil — chest armor; Fortified prefix (armorClassBonus 8) + of Endurance suffix (hpBonus 35); drops from Cinder Sentinel (placeholder)
- Whisperwind — cloak accessory; Resolute prefix (wisBonus 4) + of Mana Flow suffix (manaRegen 8); drops from Hexbinder (placeholder)
- Dreadmaw — mainHand weapon; Keen prefix (weaponBaseDamage 10) + of Power suffix (strBonus 4); drops from Basalt Brute (placeholder)

**Constants:**
- `QUALITY_TIERS` — typed const tuple for type safety
- `QualityTier` — union type
- `AFFIX_COUNT_BY_QUALITY` — 0 for common, 1 for uncommon, 2 for rare, 3 for epic, 0 for legendary (fixed)
- `QUALITY_TIER_COLORS` — hex colors per tier
- `QUALITY_TIER_NUMBER` — index map for magnitudeByTier lookups

## Deviations from Plan

### Auto-added Items

**QUALITY_TIER_NUMBER constant added (not in plan)**
- **Found during:** Task 2
- **Reason:** Downstream loot generation plans will need to look up magnitudeByTier[tierIndex]. Exporting this as a constant avoids redefining the mapping in every consumer.
- **Files modified:** spacetimedb/src/data/affix_catalog.ts

No bugs fixed, no blocking issues, no architectural changes required.

## Self-Check: PASSED

- [x] `spacetimedb/src/schema/tables.ts` exists and contains ItemAffix, quality fields
- [x] `spacetimedb/src/data/affix_catalog.ts` exists with PREFIXES, SUFFIXES, LEGENDARIES
- [x] Commit `91d1a5b` exists (schema)
- [x] Commit `6071a4a` exists (affix catalog)
- [x] `npx tsc --noEmit` shows zero errors in tables.ts and affix_catalog.ts
- [x] ItemAffix in schema export
- [x] No multi-column indexes
- [x] All new fields appended at end of column lists (SpacetimeDB migration safe)
