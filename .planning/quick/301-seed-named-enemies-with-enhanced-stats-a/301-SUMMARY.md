---
phase: quick-301
plan: 01
subsystem: enemies/loot
tags: [named-enemies, boss, loot-tables, seeding]
dependency-graph:
  requires: [item_defs, ensure_enemies, ensure_content, combat]
  provides: [named_enemy_defs, ensureNamedEnemies, boss-loot-routing]
  affects: [combat-loot-drops, enemy-spawning]
tech-stack:
  added: []
  patterns: [boss-tier-loot-tables, named-enemy-seeding]
key-files:
  created:
    - spacetimedb/src/data/named_enemy_defs.ts
  modified:
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/seeding/ensure_content.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - Used tier=2n loot tables with terrainType "named_<snake_name>" for unique routing per boss
  - Placed ensureNamedEnemies after ensureLootTables in pipeline so item templates are available
  - Boss loot tables have high gear chance (70-80%) and low junk chance (10-15%)
metrics:
  duration: ~6min
  completed: 2026-02-24
  tasks: 3/3
  files-created: 1
  files-modified: 3
---

# Quick 301: Seed Named Enemies with Enhanced Stats Summary

12 named boss enemies seeded across 3 regions with isBoss=true, 2-3x enhanced stats, and dedicated tier-2 loot tables containing class-specific gear drops covering all 14 classes.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create named enemy definitions data file | 27af245 | spacetimedb/src/data/named_enemy_defs.ts |
| 2 | Add ensureNamedEnemies seeding and wire into pipeline | 715bd3f | ensure_enemies.ts, ensure_content.ts, combat.ts |
| 3 | Verify class coverage and publish | (verification only, no changes needed) | -- |

## What Was Built

### Named Enemy Definitions (spacetimedb/src/data/named_enemy_defs.ts)

12 named enemies with enhanced boss-tier stats:

**Hollowmere Vale (Starter, levels 4-5):**
- Rotfang (beast/swamp, L5, HP 120) -- rogue, druid, ranger loot (dagger, leather)
- Mirewalker Thane (humanoid/swamp, L5, HP 150) -- paladin, cleric, shaman loot (mace, chain)
- Thornmother (beast/woods, L4, HP 90) -- wizard, enchanter, necromancer, summoner loot (staff, cloth)
- Ashwright (spirit/plains, L5, HP 100) -- universal loot (accessories)

**Embermarch Fringe (Border, levels 10-12):**
- Crag Tyrant (beast/mountains, L10, HP 300) -- warrior, paladin loot (greatsword, plate)
- Hexweaver Nyx (humanoid/woods, L10, HP 250) -- enchanter, necromancer, summoner, wizard loot (staff, cloth)
- Scorchfang (beast/plains, L11, HP 320) -- spellblade, reaver, rogue loot (blade, sword, leather)
- Warden of Ash (construct/mountains, L12, HP 400) -- warrior, reaver loot (axe, chain)
- Smolderveil Banshee (spirit/swamp, L11, HP 280) -- bard, druid, shaman loot (rapier, mace, cloth)

**Embermarch Depths (Dungeon, levels 14-16):**
- Pyrelord Kazrak (humanoid/dungeon, L15, HP 600) -- warrior, paladin, spellblade loot (greatsword, plate)
- Sootveil Archon (undead/dungeon, L14, HP 450) -- wizard, necromancer, enchanter loot (staff, cloth, dagger)
- Emberclaw Matriarch (beast/dungeon, L16, HP 700) -- ranger, rogue, druid loot (bow, leather)

### Seeding Function (ensure_enemies.ts)

`ensureNamedEnemies(ctx)` function that:
- Seeds EnemyTemplate rows with isBoss=true and enhanced stats
- Creates EnemyRoleTemplate rows for each named enemy
- Creates dedicated LootTable rows (tier=2n, terrainType="named_<name>")
- Populates LootTableEntry rows referencing existing item templates

### Boss Loot Routing (combat.ts)

Updated `findLootTable` to check for named-specific loot tables (tier 2) when enemy has isBoss=true, falling back to normal tier-1 tables for regular enemies.

### Pipeline Integration (ensure_content.ts)

Added `ensureNamedEnemies(ctx)` call after `ensureLootTables` and before `ensureMaterialLootEntries`.

## Class Coverage Verification

All 14 classes have >= 2 named enemies with drops they can equip:

| Class | Named Enemies with Usable Drops |
|-------|-------------------------------|
| warrior | Crag Tyrant, Pyrelord Kazrak, Warden of Ash, Scorchfang |
| paladin | Mirewalker Thane, Crag Tyrant, Pyrelord Kazrak |
| cleric | Mirewalker Thane, Smolderveil Banshee, Crag Tyrant, Pyrelord Kazrak |
| reaver | Scorchfang, Warden of Ash, Pyrelord Kazrak |
| ranger | Rotfang, Emberclaw Matriarch, Scorchfang, many more |
| rogue | Rotfang, Scorchfang, Smolderveil Banshee |
| wizard | Thornmother, Hexweaver Nyx, Sootveil Archon |
| enchanter | Thornmother, Hexweaver Nyx, Sootveil Archon |
| necromancer | Thornmother, Hexweaver Nyx, Sootveil Archon |
| summoner | Thornmother, Hexweaver Nyx, Sootveil Archon |
| shaman | Mirewalker Thane, Smolderveil Banshee, Thornmother |
| spellblade | Scorchfang, Pyrelord Kazrak, Warden of Ash |
| druid | Rotfang, Thornmother, Smolderveil Banshee, Emberclaw Matriarch |
| bard | Smolderveil Banshee, Mirewalker Thane, Crag Tyrant |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- named_enemy_defs.ts: FOUND
- Commit 27af245: FOUND
- Commit 715bd3f: FOUND
