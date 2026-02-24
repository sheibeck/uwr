---
phase: quick-302
plan: 01
subsystem: game-data
tags: [boss-loot, item-templates, named-enemies, seeding, spacetimedb]

# Dependency graph
requires:
  - phase: quick-301
    provides: named enemy definitions and ensureNamedEnemies seeding
  - phase: 14
    provides: WorldDropItemDef interface, loot pipeline, item template seeding
provides:
  - 35 unique rare boss drop items covering all 14 classes
  - ensureBossDropTemplates seeding function
  - Updated boss loot tables referencing unique items
affects: [combat, loot, named-enemies, gear-progression]

# Tech tracking
tech-stack:
  added: []
  patterns: [boss-drop-defs-array, tiered-boss-loot-with-mundane-filler]

key-files:
  modified:
    - spacetimedb/src/data/named_enemy_defs.ts
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/seeding/ensure_content.ts

key-decisions:
  - "Boss items use rare rarity with +1-2 stats over common equivalents"
  - "Each boss keeps 1-2 mundane items at lower weight as filler drops"
  - "Smolderveil Banshee gets 2 items (not 3) as planned to cover bard/druid/shaman archetypes"

patterns-established:
  - "BOSS_DROP_DEFS pattern: exported WorldDropItemDef[] in named_enemy_defs.ts for boss-specific items"

requirements-completed: [BOSS-LOOT-01]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Quick-302: Unique Magical Drops for Each Boss Summary

**35 unique rare-quality boss items across 12 named enemies, with tiered stats (+1-2 over common), thematic names, and class-appropriate restrictions covering all 14 classes**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T01:53:55Z
- **Completed:** 2026-02-24T01:58:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Defined 35 unique boss drop items in BOSS_DROP_DEFS array with thematic names tied to each boss
- Updated all 12 boss loot.entries to reference unique items at weight 20-25 with mundane filler at weight 8-10
- Added ensureBossDropTemplates seeding function and wired it into syncAllContent before ensureNamedEnemies
- Module publishes and seeds successfully on local SpacetimeDB

## Task Commits

Each task was committed atomically:

1. **Task 1: Define ~30 unique boss drop items in BOSS_DROP_DEFS** - `00608fa` (feat)
2. **Task 2: Add ensureBossDropTemplates seeding and wire into syncAllContent** - `82abacc` (feat)

## Files Created/Modified
- `spacetimedb/src/data/named_enemy_defs.ts` - Added BOSS_DROP_DEFS with 35 WorldDropItemDef items, updated all 12 boss loot entries
- `spacetimedb/src/seeding/ensure_items.ts` - Added ensureBossDropTemplates function following same upsert pattern
- `spacetimedb/src/seeding/ensure_content.ts` - Wired ensureBossDropTemplates call before ensureNamedEnemies

## Decisions Made
- Boss items use "rare" rarity with stats slightly above common tier equivalents (+1-2 AC, +1-2 damage, +1-3 stat bonuses)
- Each boss keeps 1-2 mundane filler items at lower weight (8-10) so loot tables aren't too narrow
- Tier 1 items (Hollowmere bosses 1-4): requiredLevel 1n, tier 1n, vendorValue 15n
- Tier 2 items (Embermarch bosses 5-12): requiredLevel 11n, tier 2n, vendorValue 30n
- Smolderveil Banshee has 2 unique items (rapier + cloth chest) per plan specification

## Class Coverage

| Boss | Classes Served | Items |
|------|---------------|-------|
| Rotfang | rogue, druid, ranger | dagger, leather chest, earrings |
| Mirewalker Thane | paladin, cleric, shaman | mace, chain chest, neck |
| Thornmother | wizard, enchanter, necromancer, summoner | staff, cloth chest, earrings |
| Ashwright | all (universal accessories) | neck, earrings, cloak |
| Crag Tyrant | warrior, paladin | greatsword, plate chest, plate hands |
| Hexweaver Nyx | enchanter, necromancer, summoner, wizard | staff, cloth legs, dagger |
| Scorchfang | spellblade, reaver, rogue | blade, leather chest, leather legs |
| Warden of Ash | warrior, reaver, beastmaster | axe, chain chest, chain wrists |
| Smolderveil Banshee | bard, druid, shaman | rapier, cloth chest |
| Pyrelord Kazrak | warrior, paladin, spellblade | greatsword, plate chest, plate head |
| Sootveil Archon | wizard, necromancer, enchanter | staff, dagger, cloth head |
| Emberclaw Matriarch | ranger, rogue, druid | bow, leather chest, leather boots |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Rolldown emits a warning about WorldDropItemDef not being "exported" by item_defs.ts when imported in named_enemy_defs.ts. This is a benign TypeScript interface erasure warning -- the interface IS exported, but rolldown's tree-shaking reports it since interfaces have no runtime value. Module compiles and publishes without errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 12 named bosses now have unique rare drops instead of mundane placeholders
- Boss items are seeded as ItemTemplates before enemy loot resolution
- Ready for further boss content expansion (legendary tier, set items, etc.)
- Pending MEMORY.md update: boss loot is no longer placeholder

## Self-Check: PASSED

All files verified present. All commit hashes verified in git history.

---
*Phase: quick-302*
*Completed: 2026-02-24*
