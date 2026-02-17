---
phase: 13-crafting-system
plan: "01"
subsystem: backend-data
tags:
  - crafting
  - materials
  - recipes
  - loot-tables
  - schema
dependency_graph:
  requires:
    - 14-loot-gear-progression (affix_catalog.ts for power parity reference)
    - seeding/ensure_items.ts (existing recipe infrastructure)
    - seeding/ensure_enemies.ts (existing loot table infrastructure)
  provides:
    - crafting_materials.ts data file
    - RecipeTemplate.recipeType and materialType columns
    - 9 material ItemTemplates (Rough Hide, Bone Shard, Iron Ore, Tanned Leather, Spirit Essence, Darksteel Ore, Moonweave Cloth, Shadowhide, Void Crystal)
    - 6 crafting base gear templates (helm, bracers, gauntlets, girdle, shield, cloak)
    - 15 gear RecipeTemplates (weapon/armor/accessory)
    - 15 Scroll ItemTemplates for recipe discovery
    - Material and scroll drops on all enemy loot tables
    - 3rd crafting station (Gloomspire Landing)
    - Crafting material entries in terrain gather pools
  affects:
    - 13-02-PLAN.md (craft_recipe reducer rework depends on this data)
    - 13-03-PLAN.md (frontend crafting UI depends on recipe/material tables)
tech_stack:
  added:
    - spacetimedb/src/data/crafting_materials.ts (new file, crafting data constants)
  patterns:
    - MATERIAL_DEFS array with MaterialDef interface
    - MATERIAL_AFFIX_MAP for deterministic quality-based affixes
    - getGatherableResourceTemplates terrain pool entries for personal node system
key_files:
  created:
    - spacetimedb/src/data/crafting_materials.ts
  modified:
    - spacetimedb/src/schema/tables.ts (RecipeTemplate schema extension)
    - spacetimedb/src/seeding/ensure_items.ts (4 new functions + addRecipe update)
    - spacetimedb/src/seeding/ensure_enemies.ts (ensureMaterialLootEntries)
    - spacetimedb/src/seeding/ensure_world.ts (Gloomspire craftingAvailable + new function)
    - spacetimedb/src/seeding/ensure_content.ts (call order update)
    - spacetimedb/src/helpers/location.ts (terrain gather pool entries for crafting materials)
decisions:
  - "Copper Ore (T1) already existed in ensureResourceItemTemplates — reused; Iron Ore is a new separate template from Iron Shard (which is a different item)"
  - "Static ResourceNode seeding skipped — personal node system (quick-118/119) handles node placement at runtime via passive search; instead updated getGatherableResourceTemplates terrain pools"
  - "ensureCraftingBaseGearTemplates added for gear slots with no existing world-drop templates (head, wrists, hands, belt, offHand shield, cloak slot)"
  - "15 gear recipes total (5 weapons + 7 armor + 3 accessories); materialType=undefined on recipes — Plan 02 reducer accepts any valid crafting material as req1"
  - "3rd crafting station: Gloomspire Landing (dungeon, already has bindStone) — logical for deep-dungeon crafting with darksteel ore found nearby"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-02-17"
  tasks: 2
  files: 7
---

# Phase 13 Plan 01: Crafting System Data Foundation Summary

**One-liner:** Established complete crafting data foundation: 10 crafting materials with deterministic affix mappings, 15 gear recipes across all equipment slots, 15 recipe scrolls as loot drops, and 3 crafting stations (starter/mid/dungeon).

## What Was Built

### Task 1: crafting_materials.ts + Schema Extension

Created `spacetimedb/src/data/crafting_materials.ts` as the core data reference for Phase 13:

- **10 material definitions** (MATERIAL_DEFS) across 3 tiers:
  - T1 (common quality): Copper Ore (STR, gather mountains/plains), Rough Hide (DEX, drop animal/beast), Bone Shard (HP+AC, drop undead/animal/humanoid)
  - T2 (uncommon quality): Iron Ore (STR+AC, gather mountains), Tanned Leather (DEX+HP, drop beast/animal), Spirit Essence (INT+WIS, drop spirit/undead/humanoid)
  - T3 (rare quality): Darksteel Ore (STR, gather dungeon/mountains), Moonweave Cloth (INT+WIS+manaRegen, gather swamp/woods), Shadowhide (DEX+cooldownReduction, drop beast/construct), Void Crystal (magicResistanceBonus+manaRegen, drop spirit/construct)

- **MATERIAL_AFFIX_MAP**: Deterministic affix arrays per material per quality tier (uncommon/rare/epic). Magnitudes match affix_catalog.ts dropped gear values for power parity: uncommon=1n stat (or 5n HP), rare=2n stat (or 8n HP), epic=3n stat (or 15n HP).

- **Helper functions**: materialTierToQuality, getCraftedAffixes, getMaterialForSalvage, SALVAGE_YIELD_BY_TIER

- **Schema**: RecipeTemplate extended with `recipeType: t.string().optional()` and `materialType: t.string().optional()`. Requires `--clear-database` on next publish.

### Task 2: Seeding — Materials, Recipes, Loot, Gather Pools, Crafting Stations

**ensureGearMaterialItemTemplates**: Seeds 9 new material ItemTemplates (Copper Ore already existed). All: slot='resource', stackable=true, rarity='common', tiered 1-3.

**ensureCraftingBaseGearTemplates**: Seeds 6 base gear templates needed for recipe output:
- Iron Helm (head, plate), Leather Bracers (wrists), Iron Gauntlets (hands, plate)
- Rough Girdle (belt, leather), Wooden Shield (offHand), Simple Cloak (neck, cloth)

**ensureGearRecipeTemplates**: Seeds 15 RecipeTemplates with recipeType field:
- Weapons (weapon): Longsword, Dagger, Staff, Mace, Shield
- Armor (armor): Helm, Breastplate, Bracers, Gauntlets, Girdle, Greaves, Sabatons
- Accessories (accessory): Ring, Amulet, Cloak

**ensureRecipeScrollItemTemplates**: Seeds 15 Scroll: {Name} ItemTemplates (slot='resource', rarity='uncommon') for recipe discovery via enemy loot.

**ensureMaterialLootEntries**: Adds to all terrain/creature-type loot tables:
- Material drops: animal/beast → rough_hide (20n), tanned_leather (15n mid+), shadowhide (10-12n high+)
- Material drops: undead/humanoid → bone_shard (15-18n), spirit_essence (12-15n mid+)
- Material drops: spirit → bone_shard (T1) or spirit_essence (mid+), void_crystal (12n high+)
- Material drops: construct → shadowhide (15n mid+), void_crystal (12n high+)
- Scroll drops: mid-tier zones weight 3-5n (weapon/armor type-appropriate), high-tier weight 5-8n (multi-scroll)

**getGatherableResourceTemplates** pool updates (location.ts): Added crafting materials to terrain gather pools — Iron Ore (weight 2n) and Darksteel Ore (weight 1n) for mountains; Moonweave Cloth (weight 1n, night) for woods and swamp; Copper Ore (weight 2n) for plains. Personal node system handles spawning at runtime.

**Crafting stations**: Gloomspire Landing (dungeon) now has craftingAvailable=true, joining Hollowmere (starter) and Slagstone Waystation (mid-tier border).

**ensureRecipeTemplates update**: addRecipe helper now includes recipeType/materialType fields; existing consumable recipes get recipeType='consumable' on next sync.

**Seeding order in syncAllContent**: materials → crafting base gear → gear recipes → scrolls → enemy loot (correct dependency order for ID resolution).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Arch Adapt] Static ResourceNode seeding replaced with terrain pool updates**
- **Found during:** Task 2 Part C
- **Issue:** Plan called for seeding static ResourceNode rows for crafting materials at terrain locations. However, quick-118 (Feb 2026) converted the resource system to personal per-character nodes spawned via passive search — static nodes are no longer used. Seeding static rows would create stale data.
- **Fix:** Added crafting materials to `getGatherableResourceTemplates` terrain pools in `helpers/location.ts`. These pools are used at runtime when passive search spawns personal nodes. Effect is identical: crafting materials appear at terrain-appropriate locations when players search.
- **Files modified:** `spacetimedb/src/helpers/location.ts`

**2. [Rule 2 - Missing Functionality] Added ensureCraftingBaseGearTemplates**
- **Found during:** Task 2 Part A (ensureGearRecipeTemplates)
- **Issue:** Plan called for gear recipes referencing existing ItemTemplates for all equipment slots, but no world-drop templates existed for: head, wrists, hands, belt, offHand (shield), cloak. Without output templates, gear recipes could not be seeded.
- **Fix:** Added `ensureCraftingBaseGearTemplates` to seed 6 simple base gear templates for these missing slots.
- **Files modified:** `spacetimedb/src/seeding/ensure_items.ts`, `spacetimedb/src/seeding/ensure_content.ts`

## Self-Check: PASSED

Files confirmed created/modified:
- spacetimedb/src/data/crafting_materials.ts — exists, 356 lines, 10 MATERIAL_DEFS, complete MATERIAL_AFFIX_MAP, all helper functions
- spacetimedb/src/schema/tables.ts — RecipeTemplate has recipeType + materialType columns
- spacetimedb/src/seeding/ensure_items.ts — ensureGearMaterialItemTemplates, ensureCraftingBaseGearTemplates, ensureGearRecipeTemplates, ensureRecipeScrollItemTemplates present
- spacetimedb/src/seeding/ensure_enemies.ts — ensureMaterialLootEntries present
- spacetimedb/src/seeding/ensure_world.ts — Gloomspire Landing craftingAvailable=true
- spacetimedb/src/seeding/ensure_content.ts — all 5 new functions imported and called in correct order
- spacetimedb/src/helpers/location.ts — terrain pools updated with crafting materials

Commits verified:
- d77e83a: feat(13-01): create crafting_materials.ts and extend RecipeTemplate schema
- b6364e5: feat(13-01): seed material items, gear recipes, loot drops, and crafting locations
