---
phase: 13-crafting-system
verified: 2026-02-17T12:00:00Z
status: passed
score: 22/22 must-haves verified
re_verification: false
---

# Phase 13: Crafting System Verification Report

**Phase Goal:** Material-driven gear crafting system where players gather tiered materials from world nodes and enemy drops, discover recipes through salvage (75% chance), loot scrolls, and quest rewards, and craft fully deterministic gear with affixes controlled by material type and quality controlled by material tier. Salvage reworked from gold yield to material yield. Crafting UI extended with type filter chips and show-only-craftable toggle.
**Verified:** 2026-02-17T12:00:00Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | RecipeTemplate has recipeType and materialType columns | VERIFIED | tables.ts lines 388-389: recipeType and materialType as optional string columns |
| 2  | 10 material definitions in crafting_materials.ts | VERIFIED | MATERIAL_DEFS: copper_ore, rough_hide, bone_shard, iron_ore, tanned_leather, spirit_essence, darksteel_ore, moonweave_cloth, shadowhide, void_crystal |
| 3  | Gear recipes seeded for all major equipment slots | VERIFIED | ensureGearRecipeTemplates seeds 15 recipes (5 weapon, 7 armor, 3 accessory) |
| 4  | Existing consumable recipes tagged recipeType=consumable | VERIFIED | addRecipe helper defaults recipeType to consumable |
| 5  | Enemy loot tables include material drops | VERIFIED | ensureMaterialLootEntries adds drops by creature type (animal/beast/undead/spirit/construct/humanoid) |
| 6  | Enemy loot tables include scroll drops on mid/high-tier enemies | VERIFIED | Scroll: items with weights 3-8n on mid/high-tier loot tables |
| 7  | Scroll ItemTemplates exist for each gear recipe type | VERIFIED | GEAR_RECIPE_NAMES (15 entries), ensureRecipeScrollItemTemplates creates each |
| 8  | Gatherable materials added to terrain pools | VERIFIED | location.ts: Copper Ore (mountains/plains), Iron Ore (mountains), Darksteel Ore (mountains/dungeon), Moonweave Cloth (woods/swamp) |
| 9  | Multiple locations have craftingAvailable=true | VERIFIED | Hollowmere (T1 town), Slagstone Waystation (T2 town), Gloomspire Landing (T3 dungeon) |
| 10 | Salvaging gear yields crafting materials instead of gold | VERIFIED | salvage_item uses getMaterialForSalvage + SALVAGE_YIELD_BY_TIER; no gold grant in salvage reducer |
| 11 | Salvaging has 75% recipe discovery chance | VERIFIED | Deterministic roll (timestamp + characterId) % 100n < 75n |
| 12 | Recipe discovery creates log entry with recipe name | VERIFIED | appendPrivateEvent with recipe name in message at line 1618 |
| 13 | Crafting gear recipe produces deterministic affixes based on material type | VERIFIED | craft_recipe: req1 template name -> materialKey -> MATERIAL_DEFS lookup -> getCraftedAffixes |
| 14 | Material tier determines output quality tier | VERIFIED | materialTierToQuality: T1=common, T2=uncommon, T3=rare |
| 15 | Crafted gear has qualityTier, displayName, and ItemAffix rows | VERIFIED | ItemAffix.insert loop, buildDisplayName, ItemInstance.id.update with qualityTier+displayName |
| 16 | Consumable recipes bypass affix logic | VERIFIED | isGearRecipe: recipeType !== consumable guards affix path |
| 17 | learn_recipe_scroll reducer exists and works | VERIFIED | Line 1042: validates Scroll: prefix, extracts recipe name, inserts RecipeDiscovered, consumes scroll |
| 18 | CraftingPanel shows type filter chips | VERIFIED | v-for over recipeTypes, active chip highlighted #4a6 green |
| 19 | CraftingPanel has show-only-craftable toggle | VERIFIED | Checkbox bound to showOnlyCraftable |
| 20 | Missing materials shown red, available green | VERIFIED | req.hasMaterial ? #4a6 : #c44 |
| 21 | Craft button disabled when requirements not met | VERIFIED | :disabled with !recipe.canCraft guard |
| 22 | Research Recipes button removed; salvage text and Learn Recipe action updated | VERIFIED | No Research in CraftingPanel.vue; crafting materials text in InventoryPanel; learnRecipeScroll wired |

**Score:** 22/22 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| spacetimedb/src/data/crafting_materials.ts | Material definitions, affix map, helper functions | VERIFIED | 354 lines; MATERIAL_DEFS (10), MATERIAL_AFFIX_MAP (10 materials x 3 quality tiers), materialTierToQuality, getCraftedAffixes, getMaterialForSalvage, SALVAGE_YIELD_BY_TIER |
| spacetimedb/src/schema/tables.ts | RecipeTemplate with recipeType and materialType | VERIFIED | Lines 388-389: both optional string columns present |
| spacetimedb/src/seeding/ensure_items.ts | All gear seeding functions | VERIFIED | ensureGearMaterialItemTemplates (1789), ensureCraftingBaseGearTemplates (1850), ensureGearRecipeTemplates (1900), ensureRecipeScrollItemTemplates (1985) |
| spacetimedb/src/seeding/ensure_enemies.ts | ensureMaterialLootEntries | VERIFIED | Line 112: full creature-type material and scroll drop mapping |
| spacetimedb/src/seeding/ensure_world.ts | Gloomspire Landing craftingAvailable=true | VERIFIED | Line 1006 confirmed |
| spacetimedb/src/seeding/ensure_content.ts | Correct seeding order | VERIFIED | materials(89)->base gear(93)->recipes(96)->scrolls(97)->enemy loot(106) |
| spacetimedb/src/helpers/location.ts | Terrain pool updates for crafting materials | VERIFIED | Mountains (Copper Ore w:3n, Iron Ore w:2n, Darksteel Ore w:1n), plains (Copper Ore w:2n), woods+swamp (Moonweave Cloth w:1n night), dungeon (Darksteel Ore w:2n) |
| spacetimedb/src/reducers/items.ts | Reworked salvage_item, extended craft_recipe, learn_recipe_scroll | VERIFIED | salvage_item (1564): material yield + recipe discovery; craft_recipe (980): affix logic; learn_recipe_scroll (1042): new reducer |
| src/composables/useCrafting.ts | Filter state and derived recipe data | VERIFIED | activeFilter (25), showOnlyCraftable (26), hasMaterial (69-92), recipeTypes (110), filteredRecipes (115), all exported |
| src/components/CraftingPanel.vue | Filter chips, toggle, red/green requirements | VERIFIED | Filter chips v-for (16), toggle checkbox (36), hasMaterial coloring (49), no Research button |
| src/components/InventoryPanel.vue | Salvage text, isRecipeScroll, learnRecipeFromScroll, Learn Recipe button | VERIFIED | isRecipeScroll (98), handler (101-105), Learn Recipe button (228), crafting materials text (248) |
| src/App.vue | Extracts and passes filter state to CraftingPanel | VERIFIED | Lines 1661-1664 extract from composable; line 186 passes all 4 filter props with update handlers |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| crafting_materials.ts | ensure_items.ts | MATERIAL_DEFS for seeding | VERIFIED | Material names match MaterialDef.name convention used in seeding |
| ensure_items.ts | ensure_content.ts | New seeding functions in syncAllContent | VERIFIED | All 4 functions imported and called in correct dependency order |
| reducers/items.ts | crafting_materials.ts | Full import of 5 exports | VERIFIED | Line 4: getMaterialForSalvage, SALVAGE_YIELD_BY_TIER, MATERIAL_DEFS, getCraftedAffixes, materialTierToQuality |
| useCrafting.ts | CraftingPanel.vue | Filter props via App.vue | VERIFIED | App.vue passes activeFilter, showOnlyCraftable, recipeTypes, filteredRecipes with update event handlers |
| InventoryPanel.vue | conn.reducers.learnRecipeScroll | Learn Recipe button | VERIFIED | Line 104: conn.reducers.learnRecipeScroll({ characterId, itemInstanceId: item.id }) |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments, no empty implementations, no stub handlers detected in any phase 13 modified files.

### Human Verification Required

#### 1. Salvage Material Yield

**Test:** Salvage a piece of Tier 2 plate armor on a live character
**Expected:** Receive 2x Iron Ore. Event log shows salvage + material receipt message.
**Why human:** Requires live SpacetimeDB connection with published module

#### 2. Recipe Discovery via Salvage

**Test:** Salvage the same item type multiple times
**Expected:** On approximately 75% of first-time salvages, event log shows recipe learned. Duplicate discovery blocked on subsequent salvages of same type.
**Why human:** RNG behavior needs runtime validation; requires live connection

#### 3. Gear Crafting Affix Output

**Test:** Craft a gear item using Tier 2 material (Iron Ore) once recipe is discovered
**Expected:** Item shows uncommon quality with correct deterministic affixes (e.g., Fierce strBonus+1, Sturdy acBonus+1) matching MATERIAL_AFFIX_MAP for iron_ore
**Why human:** Requires live connection, recipe discovery, and material acquisition

#### 4. CraftingPanel Filter Chips Visual

**Test:** Open Crafting panel with multiple recipe types known
**Expected:** Filter chips (All, Weapon, Armor, Accessory, Consumable) visible at top, active chip green, clicking filters list to matching recipe types
**Why human:** Visual rendering and interactivity require browser environment

#### 5. Learn Recipe Scroll Flow

**Test:** Acquire a Scroll item from enemy loot. Use Learn Recipe context action in inventory.
**Expected:** Recipe learned (event log), scroll consumed (stack -1), recipe now appears in CraftingPanel.
**Why human:** Scroll drops are rare (weight 3-8n); full flow requires live connection

### Gaps Summary

No gaps found. All 22 observable truths verified against actual code in the repository.

The phase delivered all specified outcomes:
- Data foundation: crafting_materials.ts with 10 MATERIAL_DEFS, complete MATERIAL_AFFIX_MAP, and all helper functions
- Schema: RecipeTemplate extended with recipeType and materialType optional string columns
- Seeding: 9 new material templates, 6 base gear templates, 15 gear recipes, 15 scroll items, material/scroll loot entries by creature type, 3 crafting stations at T1/T2/T3 zones
- Reducers: salvage_item (material yield + recipe discovery, no gold), craft_recipe (deterministic affixes), learn_recipe_scroll (new reducer)
- Frontend: useCrafting composable (filter state, filteredRecipes, hasMaterial), CraftingPanel (chips + toggle + red/green display), InventoryPanel (Learn Recipe action + salvage text update), App.vue wiring complete

Architectural deviation correctly applied: static ResourceNode seeding replaced with terrain pool updates in helpers/location.ts because the personal node system handles node placement at runtime via passive search.

All 7 documented commits verified: d77e83a, b6364e5, ce94d7b, 3322d3e, 6b9044b, 2f16912, 0004e07

---

_Verified: 2026-02-17T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
