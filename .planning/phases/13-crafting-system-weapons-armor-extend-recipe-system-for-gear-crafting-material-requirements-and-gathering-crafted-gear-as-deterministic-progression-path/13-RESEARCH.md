# Phase 13: Crafting System - Weapons & Armor - Research

**Researched:** 2026-02-17
**Domain:** SpacetimeDB TypeScript backend + Vue 3 frontend crafting/gear system
**Confidence:** HIGH

## Summary

This phase extends an existing crafting skeleton into a full material-driven gear crafting system. The codebase already has the critical infrastructure: `RecipeTemplate`, `RecipeDiscovered`, `ItemTemplate`, `ItemInstance`, `ItemAffix`, and the `craft_recipe` / `salvage_item` reducers. The existing system is consumables-only (Bandage, Rations, etc.) — this phase adds gear recipes driven by material types that deterministically control affix pools and quality tiers.

The key architectural insight is that gear crafting in this game produces items with known affixes — this is NOT the existing random-affix loot drop system. Instead, the `materialType` field on the recipe (or its ingredients) drives which affixes are baked in, and `materialTier` drives the quality level. This means crafted gear needs a different output path from the existing `addItemToInventory` helper: it must write `qualityTier`, `displayName`, and `ItemAffix` rows at craft time — the same way `take_loot` does it for drops.

The salvage system currently grants gold only. Phase 13 changes it to yield material item instances instead, and adds a high-probability recipe discovery roll on salvage. This touches `salvage_item` reducer in `reducers/items.ts` and the `InventoryPanel.vue` confirm dialog text.

**Primary recommendation:** Extend `RecipeTemplate` with a `recipeType` string column and a `materialType` string column. Introduce 8–12 material `ItemTemplate` rows in `ensure_items.ts`. Define gear recipes in `ensure_recipe_templates_gear()`. Modify `salvage_item` to yield materials and trigger recipe discovery. Rework the `craft_recipe` reducer to apply affixes deterministically based on material type. Extend the Vue `CraftingPanel` with type filter chips and show-all/craftable toggle.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Material Acquisition**
- Materials come from TWO sources: world gathering nodes (mineral/plant types) AND enemy drops (hide, bone, essence types)
- Materials are tiered — higher-tier materials produce higher-quality gear (Tier 1 → common, Tier 2 → uncommon, Tier 3 → rare, etc.)
- Medium material taxonomy: 8–12 distinct material types giving meaningful choice (Claude defines exact types to fit existing zone/enemy structure)
- Salvage system upgraded: salvaging gear now yields materials ONLY (gold yield removed). Crafted gear salvages the same as any dropped gear — no special recycle path back to original materials

**Recipe Discovery**
- Recipes discovered via THREE paths: drop from enemies/exploration (passive search can surface recipe scrolls), awarded as quest rewards (faction-adjacent quests), and salvaging an item has a high chance to teach the recipe for that item type
- Salvage-to-recipe: salvaging a Longsword (regardless of quality) rolls a high-probability chance to add the Longsword recipe to the character's known recipes
- Recipes are per-item-type, NOT per-rarity — one recipe covers all quality tiers (material tier determines output quality)
- Recipes are character-specific; alts discover independently
- Any character can craft any discovered recipe — no class restriction
- Learning is automatic: recipe immediately added with a Log entry ("You have learned: [Recipe Name]")
- Recipes have types for sorting/filtering: Weapon, Armor, Consumable (and any other relevant categories)

**Crafted Gear Power & Identity**
- Material TYPE determines the affix pool — e.g. darksteel enables STR affixes, moonweave enables INT/WIS affixes
- Material TIER determines quality tier of output — Tier 1 → common, Tier 2 → uncommon, Tier 3 → rare
- Output is FULLY DETERMINISTIC — given recipe + material type + material tier always produces same item with same affixes. Zero RNG
- Power parity with drops: same stat budget as dropped gear of same quality tier
- Crafting is one-way: crafted gear cannot be salvaged back into original materials (treated same as any dropped gear)

**Crafting UI & Workflow**
- Crafting requires a crafting-enabled location (`location.craftingAvailable === true`)
- Crafting is instant on confirmation — no cast bar
- Uses the existing Crafting panel, extended
- Panel layout: single scrollable recipe list with type filter chips (All / Weapon / Armor / Consumable / etc.)
- All known recipes always visible regardless of materials owned. Missing materials shown in red. Craft button disabled when requirements unmet
- Toggle to hide recipes you can't currently craft (default: show all)

### Claude's Discretion
- Exact material type names and taxonomy (8–12 types fitting the existing zone/enemy roster)
- Which specific affixes map to which material types
- How many materials per recipe (cost balance)
- Which locations get the crafting-bench flag seeded
- How recipe scrolls enter the loot table and quest reward system technically

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

---

## Standard Stack

### Core
| Component | File(s) | Purpose | Notes |
|-----------|---------|---------|-------|
| SpacetimeDB TypeScript server | `spacetimedb/src/` | Backend reducers + tables | All data mutations happen here |
| Vue 3 composables | `src/composables/useCrafting.ts` | Frontend crafting state | Already exists, needs extension |
| Vue 3 component | `src/components/CraftingPanel.vue` | Crafting UI | Already exists, needs extension |
| Seeding helpers | `spacetimedb/src/seeding/ensure_items.ts` | Material + recipe seed data | Add new gear material types + gear recipes |

### Existing Infrastructure (HIGH confidence — read from source)

| System | Status | Key Details |
|--------|--------|-------------|
| `RecipeTemplate` table | Exists | Fields: `id`, `key`, `name`, `outputTemplateId`, `outputCount`, `req1TemplateId`, `req1Count`, `req2TemplateId`, `req2Count`, `req3TemplateId?`, `req3Count?`. Max 3 ingredient slots. |
| `RecipeDiscovered` table | Exists | Fields: `id`, `characterId`, `recipeTemplateId`, `discoveredAt`. Index: `by_character`. |
| `craft_recipe` reducer | Exists | Validates location (`craftingAvailable`), checks discovery, consumes materials, adds item via `addItemToInventory`. Currently no affix generation. |
| `salvage_item` reducer | Exists | Currently deletes item + ItemAffix rows, grants gold by quality tier. Needs rework to yield materials + trigger recipe discovery. |
| `ItemTemplate` table | Exists | All stats baked in: `slot`, `armorType`, `rarity`, `tier`, `strBonus`, `dexBonus`, etc. Stackable flag exists. |
| `ItemInstance` table | Exists | `qualityTier?`, `displayName?`, `isNamed?`. These optional fields drive the quality display. |
| `ItemAffix` table | Exists | `itemInstanceId`, `affixType`, `affixKey`, `affixName`, `statKey`, `magnitude`. Written per-item at loot time. |
| `addItemToInventory` helper | Exists | Creates stackable or non-stackable instances. Does NOT set qualityTier or affixes. |
| `generateAffixData` helper | Exists in `helpers/items.ts` | Generates random affixes from PREFIXES/SUFFIXES catalog by slot, quality tier, and seed. This is the RNG path — NOT suitable for deterministic crafting. |
| `EQUIPMENT_SLOTS` set | Exists | head, chest, wrists, hands, belt, legs, boots, earrings, neck, cloak, mainHand, offHand |
| `craftingAvailable` on Location | Exists | Checked by `craft_recipe` and `research_recipes`. Already set to true for Hollowmere and one other town (line 830 in ensure_world.ts). |
| Resource gathering nodes | Exists | `ResourceNode` table with `itemTemplateId`, `locationId`, `state`. Personal nodes deleted after gather. |
| Existing resources | Exists | 21 resource items in `ensureResourceItemTemplates`: Flax, Herbs, Wood, Resin, Copper Ore, Stone, Iron Shard, etc. |
| Enemy creature types | Exists | animal, beast, spirit, humanoid, undead, construct |
| Terrain types | Exists | town, plains, swamp, woods, mountains, dungeon |
| `research_recipes` reducer | Exists — to be removed/kept | Currently: character at crafting station runs research, discovers recipes they can make from materials on hand. This mechanic is being replaced by automatic salvage-to-recipe discovery. |

---

## Architecture Patterns

### Pattern 1: Deterministic Gear Output from `craft_recipe`

The existing `craft_recipe` reducer calls `addItemToInventory`, which creates a basic `ItemInstance` with no quality or affixes. For gear crafting, the pattern from `take_loot` in `reducers/items.ts` (lines 265–298) must be adapted:

```typescript
// Source: spacetimedb/src/reducers/items.ts (take_loot reducer, lines 265-298)

// After addItemToInventory creates the new instance, find it and set quality + affixes:
const newInstance = [...ctx.db.itemInstance.by_owner.filter(character.id)]
  .find(i => i.templateId === recipe.outputTemplateId && !i.equippedSlot && !i.qualityTier);

if (newInstance && qualityTier !== 'common') {
  const affixes = determineCraftedAffixes(materialType, qualityTier);
  for (const affix of affixes) {
    ctx.db.itemAffix.insert({
      id: 0n,
      itemInstanceId: newInstance.id,
      affixType: affix.affixType,
      affixKey: affix.affixKey,
      affixName: affix.affixName,
      statKey: affix.statKey,
      magnitude: affix.magnitude,
    });
  }
  const displayName = buildDisplayName(template.name, affixes);
  ctx.db.itemInstance.id.update({
    ...newInstance,
    qualityTier,
    displayName,
  });
}
```

The key difference from drops: NO random seed. The affix is looked up from a static map `MATERIAL_AFFIX_MAP[materialType][qualityTier]`.

### Pattern 2: Material Type Encoding in RecipeTemplate

The `RecipeTemplate` table currently has no `materialType` field. Two options:

**Option A (schema change):** Add `materialType: t.string().optional()` and `recipeType: t.string().optional()` to `RecipeTemplate`. Clean, requires schema migration (clear + republish).

**Option B (no schema change):** Encode material type in the recipe `key` field (e.g., `"sword_darksteel"`) and derive it client-side. More fragile.

**Recommendation: Option A.** Add `materialType` and `recipeType` to `RecipeTemplate`. This is a schema change but Phase 13 is explicitly a major crafting overhaul. The planner should include a `--clear-database` republish step.

### Pattern 3: Salvage-to-Material Yield

In `salvage_item` reducer, replace the gold grant with material item grants:

```typescript
// Source: spacetimedb/src/reducers/items.ts (salvage_item reducer, lines 1395-1439)
// Current: goldYield = baseGold * tierMultiplier; ctx.db.character.id.update({gold: ...})
// New: yield material items based on slot/armorType/tier

const materialTemplateId = getMaterialForGear(template.slot, template.armorType, tier);
const materialCount = getMaterialYieldCount(tier);
addItemToInventory(ctx, character.id, materialTemplateId, materialCount);

// Then recipe discovery roll
const recipeForSlot = findGearRecipeForTemplate(ctx, template.id);
if (recipeForSlot) {
  const alreadyKnown = [...ctx.db.recipeDiscovered.by_character.filter(character.id)]
    .some(r => r.recipeTemplateId === recipeForSlot.id);
  if (!alreadyKnown) {
    const roll = (ctx.timestamp.microsSinceUnixEpoch + character.id) % 100n;
    if (roll < 75n) {  // 75% discovery chance on salvage
      ctx.db.recipeDiscovered.insert({
        id: 0n, characterId: character.id,
        recipeTemplateId: recipeForSlot.id, discoveredAt: ctx.timestamp,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `You have learned: ${recipeForSlot.name}`);
    }
  }
}
```

### Pattern 4: Recipe Scroll as ItemTemplate with slot='recipe_scroll'

For the drop/exploration discovery path, the cleanest approach is an `ItemTemplate` with `slot: 'recipe_scroll'` (similar to existing 'resource' slot). The scroll is a stackable item. When the player "uses" the scroll at a crafting location (via `use_item` reducer or a new `learn_recipe_scroll` reducer), the recipe is added to `RecipeDiscovered`.

Alternative: treat scrolls as consumables processed via `use_item` key lookup. Simpler but adds more keys to `handledKeys` set.

**Recommendation:** New dedicated `learn_recipe_scroll` reducer. The scroll links to a recipe via its `name` (e.g., "Scroll: Iron Longsword") — the reducer parses the name or the `ItemTemplate` gets a new `linkedRecipeKey` string field.

Given schema complexity, the simplest approach is: recipe scrolls are stackable `resource`-slot items whose name matches a recipe key convention. The `use_item` reducer is extended with a new path for scrolls. The `lootTableEntry` system already handles item drops.

### Pattern 5: Vue Frontend Filter Chips

The `CraftingPanel.vue` currently shows a flat list filtered by `discoveredRecipeIds`. Extension adds:

```vue
<!-- Filter chips: All | Weapon | Armor | Consumable | ... -->
<div v-for="type in recipeTypes" :key="type">
  <button @click="activeFilter = type">{{ type }}</button>
</div>
<!-- Toggle -->
<label><input type="checkbox" v-model="showOnlyCraftable" /> Show only craftable</label>
```

The `useCrafting.ts` composable adds a `recipeType` field from `RecipeTemplate.recipeType`, and the `recipes` computed adds `canCraft` and `requirements` with `hasMaterial` boolean for red/green display.

### Anti-Patterns to Avoid

- **Using `generateAffixData` for crafted gear:** This uses a random seed and produces RNG output. Crafted gear must use a static lookup map (`MATERIAL_AFFIX_MAP`) — deterministic, no seed.
- **Treating `research_recipes` as the discovery mechanic for gear:** The old `research_recipes` reducer discovers consumable recipes by checking if materials are on hand. Gear recipe discovery is passive (salvage trigger, scroll drop, quest reward) — not a manual research action.
- **Using existing resources (Flax, Herbs, Wood) as crafting materials:** These already have recipes for consumables. Gear materials should be new, distinct items to avoid collision and clarity. However, existing mineral resources (Copper Ore, Iron Shard) can serve double-duty as Tier 1 metallic gear materials without ambiguity.
- **Multi-column index filter on RecipeTemplate:** The RecipeTemplate table currently has no indexes. Do not add a multi-column index and use filter — broken (see CLAUDE.md). Single-column or `iter()` is fine given small data set.
- **Setting quality on non-gear crafted items:** Consumable recipes should not get quality tiers or affixes. Only gear slot recipes get the quality+affix treatment.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Affix application logic | Custom affix writer | Reuse `ctx.db.itemAffix.insert` pattern from `take_loot` | Already tested, handles all stat keys |
| Inventory management | Custom stack/slot logic | `addItemToInventory`, `removeItemFromInventory` | Edge cases handled (stackable merge, slot limits) |
| Quality tier strings | Custom enum | Existing `QUALITY_TIERS` constant from `affix_catalog.ts` | common/uncommon/rare/epic/legendary already defined |
| Display name generation | Custom string format | Existing `buildDisplayName(name, affixes)` in `helpers/items.ts` | Handles prefix+name+suffix pattern |
| Crafting location check | Custom guard | Existing `location.craftingAvailable` check in `craft_recipe` | Already in place |
| Vue composable pattern | Custom state management | Extend `useCrafting.ts` composable following existing pattern | Established pattern for connActive/selectedCharacter/useReducer |

---

## Common Pitfalls

### Pitfall 1: `addItemToInventory` Doesn't Set QualityTier

**What goes wrong:** Calling `addItemToInventory` for a crafted gear item creates an `ItemInstance` with `qualityTier: undefined`. The item won't show quality borders or affixes in the UI.

**Why it happens:** `addItemToInventory` is designed for simple items (consumables, resources). It doesn't accept quality or affix parameters.

**How to avoid:** After `addItemToInventory`, immediately find the new instance by owner+templateId+!qualityTier, then update it and write `ItemAffix` rows — exactly as `take_loot` does (lines 265–298 in `reducers/items.ts`).

**Warning signs:** Crafted gear shows "common" quality with no affixes even when Tier 2+ materials used.

### Pitfall 2: Recipe Discovery Duplicate Check

**What goes wrong:** Salvaging multiple items of the same type triggers multiple `recipeDiscovered` inserts, creating duplicate rows and confusing the client.

**Why it happens:** The duplicate check requires iterating `recipeDiscovered.by_character` and checking if the recipe ID already exists — easy to miss.

**How to avoid:** Always check `alreadyKnown` before inserting a `RecipeDiscovered` row. Pattern already established in `research_recipes` reducer (lines 802–806 in `reducers/items.ts`).

### Pitfall 3: Schema Migration on RecipeTemplate

**What goes wrong:** Adding `materialType` and `recipeType` columns to `RecipeTemplate` breaks existing published module without `--clear-database`.

**Why it happens:** SpacetimeDB does not support runtime column additions. Adding optional columns to an existing published table requires republishing.

**How to avoid:** The plan must include a `spacetime publish --clear-database` step. Warn that this wipes all existing game data (acceptable for dev, must note for production).

### Pitfall 4: Salvage Confirm Dialog Text

**What goes wrong:** The `InventoryPanel.vue` salvage context menu shows "You will receive gold." This text is hardcoded and will be wrong after Phase 13.

**Why it happens:** The confirm text is in `InventoryPanel.vue` line 236: `"Salvage ${item.name}? You will receive gold. This cannot be undone."`.

**How to avoid:** Update the confirm dialog text to "Salvage ${item.name}? You will receive crafting materials. This cannot be undone."

### Pitfall 5: `research_recipes` Reducer Becomes Orphaned

**What goes wrong:** The existing `research_recipes` reducer and its "Research Recipes" button in `CraftingPanel.vue` become meaningless if gear recipe discovery is now passive (salvage-triggered). Leaving the button causes confusion.

**Why it happens:** The button calls `researchReducer({ characterId })` which iterates all recipes and adds ones where the character has matching materials. For gear recipes with materialType requirements, this won't work correctly.

**How to avoid:** Remove or repurpose the "Research Recipes" button. If keeping it for legacy consumable discovery, restrict it to `recipeType === 'consumable'` recipes only. Consider removing it entirely if salvage-to-recipe covers consumables too.

### Pitfall 6: Resource Node itemTemplateId Conflicts

**What goes wrong:** Adding new material item templates to `ensureResourceItemTemplates` and then assigning them to resource nodes requires the templates to exist before node creation runs. If seeding order is wrong, the template lookup returns null.

**Why it happens:** `ensureWorldLayout` and `ensureResourceNodes` call `findItemTemplateByName` — if the template doesn't exist yet, the node creation silently skips.

**How to avoid:** In `syncAllContent`, call `ensureResourceItemTemplates` (which now includes gear materials) before `ensureWorldLayout` / node seeding. Check existing seeding order in `ensure_content.ts`.

---

## Code Examples

### Example 1: Deterministic Affix Lookup Map

```typescript
// To add to: spacetimedb/src/data/crafting_materials.ts (new file)

export interface MaterialDef {
  key: string;            // matches ItemTemplate name lowercased
  name: string;           // e.g. 'Darksteel Ore'
  tier: bigint;           // 1n=common, 2n=uncommon, 3n=rare
  slot: 'resource';
  sources: ('gather' | 'drop')[];
  dropCreatureTypes?: string[];   // which creature types drop this
  affinityStats: string[];        // which statKeys this material unlocks for crafted gear
}

// MATERIAL_AFFIX_MAP[materialKey][qualityTier] → deterministic affix list
// qualityTier = 'uncommon' | 'rare' | 'epic' (common = no affixes)
export const MATERIAL_AFFIX_MAP: Record<string, Record<string, { affixKey: string; statKey: string; affixName: string; affixType: 'prefix' | 'suffix'; magnitude: bigint }[]>> = {
  'darksteel_ore': {
    'uncommon': [{ affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 1n }],
    'rare':      [{ affixKey: 'fierce', statKey: 'strBonus', affixName: 'Fierce', affixType: 'prefix', magnitude: 2n },
                  { affixKey: 'of_strength', statKey: 'strBonus', affixName: 'of Strength', affixType: 'suffix', magnitude: 2n }],
    'epic':      [/* ... */],
  },
  // ... other materials
};
```

### Example 2: Material Tier → Quality Tier Conversion

```typescript
// In craft_recipe reducer or a helper function
function materialTierToQuality(tier: bigint): string {
  if (tier >= 3n) return 'rare';
  if (tier >= 2n) return 'uncommon';
  return 'common';
}
```

### Example 3: Salvage Yield Logic

```typescript
// In salvage_item reducer, replacing gold yield
// Material yield: 2–4 units of the material matching the item's primary material type
const SALVAGE_MATERIAL_YIELD_BY_TIER: Record<number, bigint> = {
  1: 2n,
  2: 2n,
  3: 3n,
  4: 4n,
};

// Map slot+armorType → primary material template name
const gearMaterialName = getGearPrimaryMaterial(template.slot, template.armorType, tier);
const materialTemplate = findItemTemplateByName(ctx, gearMaterialName);
if (materialTemplate) {
  const yieldCount = SALVAGE_MATERIAL_YIELD_BY_TIER[Number(tier)] ?? 2n;
  addItemToInventory(ctx, character.id, materialTemplate.id, yieldCount);
}
```

### Example 4: useCrafting.ts Extension for recipeType Filter

```typescript
// Extend useCrafting.ts — add recipeType field to recipe objects
const recipes = computed(() =>
  recipeTemplates.value
    .filter(r => discoveredRecipeIds.value.has(r.id.toString()))
    .map(recipe => ({
      // ... existing fields ...
      recipeType: (recipe as any).recipeType ?? 'consumable',
      materialType: (recipe as any).materialType ?? '',
      canCraft: /* existing logic */,
    }))
    .filter(r => !showOnlyCraftable.value || r.canCraft)
    .filter(r => activeFilter.value === 'All' || r.recipeType === activeFilter.value)
);
```

### Example 5: RecipeTemplate Schema Addition

```typescript
// In spacetimedb/src/schema/tables.ts — extend RecipeTemplate
export const RecipeTemplate = table(
  { name: 'recipe_template', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    key: t.string(),
    name: t.string(),
    recipeType: t.string(),             // NEW: 'weapon' | 'armor' | 'consumable' | 'accessory'
    materialType: t.string().optional(), // NEW: e.g. 'darksteel_ore' — which material determines affixes
    outputTemplateId: t.u64(),
    outputCount: t.u64(),
    req1TemplateId: t.u64(),
    req1Count: t.u64(),
    req2TemplateId: t.u64(),
    req2Count: t.u64(),
    req3TemplateId: t.u64().optional(),
    req3Count: t.u64().optional(),
  }
);
```

---

## Recommended Material Taxonomy (Claude's Discretion)

Based on existing creature types (animal, beast, spirit, humanoid, undead, construct) and terrain types (plains, swamp, woods, mountains, dungeon), and existing resource items (Copper Ore, Iron Shard already exist as Tier 1 minerals):

### 10 Material Types (8–12 range, fits world structure)

| Material Key | Display Name | Tier | Source | Drop Source | Affix Theme |
|---|---|---|---|---|---|
| `copper_ore` | Copper Ore | 1 | gather (mountains/plains) | — | Already exists (T1 mineral → STR gear) |
| `rough_hide` | Rough Hide | 1 | enemy drop | animal, beast | DEX gear |
| `bone_shard` | Bone Shard | 1 | enemy drop | undead, animal | HP/armor gear |
| `iron_ore` | Iron Ore | 2 | gather (mountains) | — | STR/armor gear |
| `tanned_leather` | Tanned Leather | 2 | enemy drop | beast, animal (T2 zones) | DEX/armor gear |
| `spirit_essence` | Spirit Essence | 2 | enemy drop | spirit, undead | INT/WIS gear |
| `darksteel_ore` | Darksteel Ore | 3 | gather (dungeon/deep mountains) | — | STR + weapon damage |
| `moonweave_cloth` | Moonweave Cloth | 3 | gather (swamp/woods) | — | INT/WIS/mana gear |
| `shadowhide` | Shadowhide | 3 | enemy drop | beast, construct (T3 zones) | DEX/crit gear |
| `void_crystal` | Void Crystal | 3 | enemy drop | spirit, construct (dungeon) | magic resist/mana |

**Notes:**
- Copper Ore and Iron Shard already exist as `ItemTemplate` resources. Treat Copper Ore as Tier 1 metallic. Iron Shard (existing) overlaps with new Iron Ore — either reuse Iron Shard as Tier 2 metallic or add Iron Ore as new. Recommend reusing Iron Shard since it's already in loot tables as a 2n vendor value item, just rename it in seeding to "Iron Ore" or treat Iron Shard as the T1 variant and add Iron Ore as T2.
- Materials that are enemy drops need `LootTableEntry` rows added to appropriate creature type loot tables.
- Tier 3 materials come from danger zones (dungeon, high-danger mountains/swamp).

### Material → Affix Mapping

| Material | Tier | Stats Enabled |
|---|---|---|
| Copper Ore | 1 | strBonus |
| Rough Hide | 1 | dexBonus |
| Bone Shard | 1 | hpBonus, armorClassBonus |
| Iron Ore | 2 | strBonus + armorClassBonus |
| Tanned Leather | 2 | dexBonus + hpBonus |
| Spirit Essence | 2 | intBonus, wisBonus |
| Darksteel Ore | 3 | strBonus + weaponBaseDamage |
| Moonweave Cloth | 3 | intBonus + wisBonus + manaBonus |
| Shadowhide | 3 | dexBonus + cooldownReduction |
| Void Crystal | 3 | magicResistanceBonus + manaRegen |

### Recipe Cost Guideline (Claude's Discretion)

- **Tier 1 gear recipe:** 4x primary material + 2x secondary material (e.g., 4x Copper Ore + 2x Rough Hide for leather-type sword handle)
- **Tier 2 gear recipe:** 4x primary material + 2x secondary material + 2x Tier 1 secondary material
- **Tier 3 gear recipe:** 6x primary material + 3x secondary material
- All gear recipes produce 1x output item

This means gathering 2–3 full node harvests (2–6 items each) provides enough for one craft, creating meaningful effort without excessive grind.

---

## Seeding Changes Summary

### Files That Need Changes

1. **`spacetimedb/src/schema/tables.ts`**
   - Add `recipeType: t.string()` and `materialType: t.string().optional()` to `RecipeTemplate`

2. **`spacetimedb/src/seeding/ensure_items.ts`**
   - Add `ensureGearMaterialItemTemplates()` with the 8–10 new material types
   - Add `ensureGearRecipeTemplates()` seeding gear recipes for all gear slots
   - Update `ensureRecipeTemplates()` to set `recipeType: 'consumable'` on existing recipes

3. **`spacetimedb/src/seeding/ensure_enemies.ts`**
   - Add `LootTableEntry` rows for Rough Hide, Bone Shard, Tanned Leather, Spirit Essence, Shadowhide, Void Crystal by creature type

4. **`spacetimedb/src/seeding/ensure_world.ts`** or a new `ensure_resource_nodes_gear.ts`
   - Add resource node entries for mineable/gatherable materials (Copper Ore nodes already implied; add Iron Ore, Darksteel Ore, Moonweave Cloth to appropriate terrain locations)
   - Add 1–2 more `craftingAvailable: true` locations beyond Hollowmere (e.g., a town in the midgame zones)

5. **`spacetimedb/src/reducers/items.ts`**
   - Rework `salvage_item`: remove gold yield, add material yield + recipe discovery roll
   - Extend `craft_recipe`: after addItemToInventory, apply deterministic affixes for gear slots
   - Add `learn_recipe_scroll` reducer OR extend `use_item` for scroll consumption

6. **`spacetimedb/src/data/crafting_materials.ts`** (new file)
   - `MATERIAL_DEFS` array
   - `MATERIAL_AFFIX_MAP` lookup
   - `getMaterialForGear(slot, armorType, tier)` helper
   - `getCraftedAffixes(materialType, qualityTier)` helper

7. **`src/components/CraftingPanel.vue`**
   - Add type filter chips (All / Weapon / Armor / Consumable / Accessory)
   - Add show-only-craftable toggle
   - Show material costs with red/green availability
   - Remove "Research Recipes" button (or repurpose for legacy consumables)

8. **`src/composables/useCrafting.ts`**
   - Add `activeFilter` ref and `showOnlyCraftable` ref
   - Extend recipe computed to include `recipeType`, `materialType`
   - Filter by type chip and craftable toggle

9. **`src/components/InventoryPanel.vue`**
   - Update salvage confirm dialog text (line 236)

---

## Open Questions

1. **Does `research_recipes` stay or go?**
   - What we know: The button exists in `CraftingPanel.vue` and calls `research_recipes` reducer. The reducer discovers recipes based on having materials on hand. Gear recipes discovered via salvage don't use this mechanic.
   - What's unclear: Should the button be removed entirely, kept for consumable recipes, or repurposed?
   - Recommendation: Remove the "Research Recipes" button from the UI. Keep `research_recipes` reducer working for backward compat but don't surface it. The salvage-to-recipe path is the primary discovery mechanism for all recipe types.

2. **Recipe scroll loot table integration**
   - What we know: `LootTable` and `LootTableEntry` drive combat drops via item template weights. Recipe scrolls need to enter the loot table.
   - What's unclear: Should each gear slot + tier combo have its own scroll `ItemTemplate` (many items), or should scrolls be generic "Recipe Scroll (Weapon)" types?
   - Recommendation: One scroll per gear item type (e.g., "Scroll: Iron Longsword Recipe"). This is verbose but gives players clear loot feedback. Total number: ~20–30 scroll types across all gear slots and tiers. They link to their recipe via name convention, parsed in the `learn_recipe_scroll` reducer.

3. **Backpack size impact of materials**
   - What we know: Backpack is capped at 20 slots. Materials are stackable (like existing resources). Multiple material types might pressure inventory.
   - What's unclear: Is 20 slots sufficient given new material stack types?
   - Recommendation: Note this as a known limitation. Materials stack, so 10 material types = 10 slots max for materials. With 20 total slots and 12 equipment slots for gear, this is tight. Consider flagging a future inventory expansion but don't block Phase 13 on it.

4. **Quest reward path for recipes**
   - What we know: `QuestTemplate` has `rewardXp` and no `rewardItem` field. Quest completion logic in `npc_interaction.ts` grants XP.
   - What's unclear: There's no existing mechanism for quest item rewards. Adding recipe scrolls as quest rewards requires either (a) adding a `rewardItemTemplateId` to QuestTemplate, or (b) having turn-in reducers grant specific recipe discoveries directly.
   - Recommendation: For Phase 13, implement quest recipe rewards as direct `RecipeDiscovered` inserts in the quest turn-in logic (simpler, doesn't require schema change to QuestTemplate). The quest template gets a `rewardRecipeKey` optional field or the turn-in reducer hardcodes which recipe key to grant for specific quest NPCs.

---

## Sources

### Primary (HIGH confidence — read directly from codebase)
- `C:/projects/uwr/spacetimedb/src/schema/tables.ts` — full table schema (RecipeTemplate, RecipeDiscovered, ItemTemplate, ItemInstance, ItemAffix, Location, ResourceNode)
- `C:/projects/uwr/spacetimedb/src/reducers/items.ts` — craft_recipe, salvage_item, take_loot reducers (complete logic)
- `C:/projects/uwr/spacetimedb/src/helpers/items.ts` — addItemToInventory, removeItemFromInventory, generateAffixData, buildDisplayName
- `C:/projects/uwr/spacetimedb/src/data/affix_catalog.ts` — PREFIXES, SUFFIXES, QUALITY_TIERS, AFFIX_COUNT_BY_QUALITY
- `C:/projects/uwr/spacetimedb/src/seeding/ensure_items.ts` — ensureResourceItemTemplates (21 existing resources), ensureRecipeTemplates (10 existing consumable recipes), ensureWorldDropGearTemplates
- `C:/projects/uwr/spacetimedb/src/seeding/ensure_world.ts` — location craftingAvailable flags, terrain types
- `C:/projects/uwr/spacetimedb/src/seeding/ensure_enemies.ts` — creature types, loot table structure
- `C:/projects/uwr/src/components/CraftingPanel.vue` — existing crafting panel UI
- `C:/projects/uwr/src/composables/useCrafting.ts` — existing crafting composable
- `C:/projects/uwr/src/components/InventoryPanel.vue` — salvage confirm dialog text (line 236)
- `C:/projects/uwr/src/module_bindings/resource_node_type.ts` — ResourceNode structure
- `C:/projects/uwr/src/module_bindings/location_type.ts` — craftingAvailable field confirmed on Location

### Supporting (MEDIUM confidence — inferred from patterns)
- SpacetimeDB TypeScript SDK patterns per `CLAUDE.md` rules (schema change requires --clear-database, single-column indexes only, object syntax for reducers)

---

## Metadata

**Confidence breakdown:**
- Existing infrastructure inventory: HIGH — read directly from source
- Schema change approach: HIGH — established pattern in this codebase
- Material taxonomy: MEDIUM — Claude's discretion area; fits zone/enemy data but not validated with user
- Affix mapping details: MEDIUM — derived from affix_catalog.ts but specific magnitudes need balancing
- Quest reward path: MEDIUM — QuestTemplate lacks rewardItem; workaround approach is reasonable but needs validation

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable codebase, 30-day validity)
