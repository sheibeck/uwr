---
phase: quick-166
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/seeding/ensure_items.ts
  - spacetimedb/src/helpers/location.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
must_haves:
  truths:
    - "All material metadata (names, tiers, vendor values, gather terrains, drop creature types) lives in MATERIAL_DEFS in crafting_materials.ts"
    - "All recipe definitions (consumable and gear) are defined as data arrays in crafting_materials.ts, not inline in seeding functions"
    - "Seeding functions derive their values from the centralized data, not duplicate them"
    - "Essence drop logic in combat.ts reads tier thresholds from MATERIAL_DEFS, not hardcoded"
    - "Gather terrain pools in location.ts are generated from MATERIAL_DEFS.gatherTerrains, not hardcoded per material"
  artifacts:
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "CONSUMABLE_RECIPES, GEAR_RECIPES arrays; ESSENCE_TIER_THRESHOLDS; vendorValue on MaterialDef; all recipe metadata centralized"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "ensureGearMaterialItemTemplates reads from MATERIAL_DEFS; ensureRecipeTemplates reads from CONSUMABLE_RECIPES; ensureGearRecipeTemplates reads from GEAR_RECIPES; GEAR_RECIPE_NAMES derived from GEAR_RECIPES"
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "getGatherableResourceTemplates injects crafting materials into terrain pools from MATERIAL_DEFS.gatherTerrains"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Essence drop logic uses ESSENCE_TIER_THRESHOLDS from crafting_materials.ts"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "spacetimedb/src/data/crafting_materials.ts"
      via: "import MATERIAL_DEFS, CONSUMABLE_RECIPES, GEAR_RECIPES"
      pattern: "import.*CONSUMABLE_RECIPES.*GEAR_RECIPES.*from.*crafting_materials"
    - from: "spacetimedb/src/helpers/location.ts"
      to: "spacetimedb/src/data/crafting_materials.ts"
      via: "import MATERIAL_DEFS for terrain pool injection"
      pattern: "import.*MATERIAL_DEFS.*from.*crafting_materials"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/data/crafting_materials.ts"
      via: "import ESSENCE_TIER_THRESHOLDS"
      pattern: "import.*ESSENCE_TIER_THRESHOLDS.*from.*crafting_materials"
---

<objective>
Refactor the crafting system to consolidate all recipe and material metadata into a single source of truth in `crafting_materials.ts`. Currently, recipe definitions are inline in seeding functions, material data is duplicated between MATERIAL_DEFS and the seeding/location/combat code, and essence tier thresholds are hardcoded in combat.ts. After this refactor, every file that needs crafting data imports it from one place.

Purpose: Eliminate metadata fragmentation so future crafting changes (new recipes, new materials, rebalancing) only need edits in one file.
Output: Consolidated crafting data module with zero duplication across seeding, location, and combat files.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/crafting_materials.ts
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/reducers/items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Centralize all recipe and material metadata in crafting_materials.ts</name>
  <files>spacetimedb/src/data/crafting_materials.ts</files>
  <action>
Extend `crafting_materials.ts` with the following centralized data:

1. **Add `vendorValue` to `MaterialDef` interface** and populate on all 14 entries:
   - T1 materials: 2n (Copper Ore, Rough Hide, Bone Shard)
   - T2 materials: Iron Ore 4n, Tanned Leather 4n, Spirit Essence 5n
   - T3 materials: Darksteel/Moonweave/Shadowhide 8n, Void Crystal 10n
   - Essences: I=3n, II=6n, III=12n, IV=24n

2. **Add `CONSUMABLE_RECIPES` array** with type `ConsumableRecipeDef[]`:
   ```ts
   export interface ConsumableRecipeDef {
     key: string;
     name: string;
     outputName: string;  // matches ItemTemplate.name
     outputCount: bigint;
     req1Name: string;    // matches ItemTemplate.name
     req1Count: bigint;
     req2Name: string;
     req2Count: bigint;
     req3Name?: string;
     req3Count?: bigint;
   }
   ```
   Move all 14 consumable recipe definitions from `ensureRecipeTemplates()` in ensure_items.ts:
   bandage, simple_rations, torch, basic_poultice, travelers_tea, whetstone, kindling_bundle, rough_rope, charcoal, crude_poison, herb_broth, roasted_roots, travelers_stew, foragers_salad.

3. **Add `GEAR_RECIPES` array** with type `GearRecipeDef[]`:
   ```ts
   export interface GearRecipeDef {
     key: string;
     name: string;
     outputName: string;  // matches ItemTemplate.name for the base gear output
     recipeType: 'weapon' | 'armor' | 'accessory';
     req1Name: string;    // default primary material (Copper Ore)
     req1Count: bigint;
     req2Name: string;    // default secondary material (Rough Hide)
     req2Count: bigint;
     req3Name: string;    // Essence I
     req3Count: bigint;
   }
   ```
   Move all 15 gear recipe definitions from `ensureGearRecipeTemplates()` in ensure_items.ts.

4. **Derive `GEAR_RECIPE_NAMES` from `GEAR_RECIPES`**:
   ```ts
   export const GEAR_RECIPE_NAMES = GEAR_RECIPES.map(r => r.name);
   ```

5. **Add `ESSENCE_TIER_THRESHOLDS`** for combat.ts to import:
   ```ts
   export const ESSENCE_TIER_THRESHOLDS: { minLevel: bigint; essenceName: string }[] = [
     { minLevel: 31n, essenceName: 'Essence IV' },
     { minLevel: 21n, essenceName: 'Essence III' },
     { minLevel: 11n, essenceName: 'Essence II' },
     { minLevel: 1n,  essenceName: 'Essence I' },
   ];
   ```
   (Ordered highest-first for early-return matching in combat.)

6. **Add gather terrain weight data to `MaterialDef`** interface:
   ```ts
   gatherWeight?: bigint;       // weight in terrain gather pools (default: tier-based)
   gatherTimeOfDay?: string;    // 'any' | 'day' | 'night'
   ```
   Populate for gatherable materials:
   - Copper Ore: weight 3n (mountains), 2n (plains), timeOfDay 'any'
   - Iron Ore: weight 2n (mountains), timeOfDay 'any'
   - Darksteel Ore: weight 1n (mountains), 2n (dungeon), timeOfDay 'any'
   - Moonweave Cloth: weight 1n (swamp, woods), timeOfDay 'night'

   NOTE: Since a single material can appear in multiple terrains with different weights, use a more flexible structure:
   ```ts
   gatherEntries?: { terrain: string; weight: bigint; timeOfDay: string }[];
   ```
   Add this field to MaterialDef and populate for all gatherable materials. Non-gatherable materials omit this field.
  </action>
  <verify>TypeScript compiles: `cd spacetimedb && npx tsc --noEmit`. All arrays export correctly and have correct item counts: CONSUMABLE_RECIPES.length === 14, GEAR_RECIPES.length === 15, GEAR_RECIPE_NAMES.length === 15, ESSENCE_TIER_THRESHOLDS.length === 4.</verify>
  <done>All recipe definitions, material vendor values, essence tier thresholds, and gather terrain entries are defined in crafting_materials.ts as exported constants.</done>
</task>

<task type="auto">
  <name>Task 2: Refactor seeding, location, and combat to consume centralized data</name>
  <files>spacetimedb/src/seeding/ensure_items.ts, spacetimedb/src/helpers/location.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
**ensure_items.ts changes:**

1. **`ensureGearMaterialItemTemplates()`**: Instead of hardcoding each material's name/tier/vendorValue, loop over `MATERIAL_DEFS` and derive everything:
   ```ts
   import { MATERIAL_DEFS, CONSUMABLE_RECIPES, GEAR_RECIPES, GEAR_RECIPE_NAMES } from '../data/crafting_materials';

   export function ensureGearMaterialItemTemplates(ctx: any) {
     for (const mat of MATERIAL_DEFS) {
       if (findItemTemplateByName(ctx, mat.name)) continue;
       ctx.db.itemTemplate.insert({
         id: 0n, name: mat.name, slot: 'resource', armorType: 'none',
         rarity: 'common', tier: mat.tier, isJunk: false,
         vendorValue: mat.vendorValue, requiredLevel: 1n, allowedClasses: 'any',
         strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n,
         hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, magicResistanceBonus: 0n,
         weaponBaseDamage: 0n, weaponDps: 0n, weaponType: '', stackable: true,
         wellFedDurationMicros: 0n, wellFedBuffType: '', wellFedBuffMagnitude: 0n,
       });
     }
   }
   ```

2. **`ensureRecipeTemplates()`**: Replace all 14 inline recipe definitions with a loop over `CONSUMABLE_RECIPES`:
   ```ts
   export function ensureRecipeTemplates(ctx: any) {
     for (const recipe of CONSUMABLE_RECIPES) {
       const output = findItemTemplateByName(ctx, recipe.outputName);
       const req1 = findItemTemplateByName(ctx, recipe.req1Name);
       const req2 = findItemTemplateByName(ctx, recipe.req2Name);
       const req3 = recipe.req3Name ? findItemTemplateByName(ctx, recipe.req3Name) : undefined;
       addRecipeTemplate(ctx, {
         key: recipe.key,
         name: recipe.name,
         output, outputCount: recipe.outputCount,
         req1, req1Count: recipe.req1Count,
         req2, req2Count: recipe.req2Count,
         req3, req3Count: recipe.req3Count,
       });
     }
   }
   ```

3. **`ensureGearRecipeTemplates()`**: Replace all 15 inline definitions with a loop over `GEAR_RECIPES`:
   ```ts
   export function ensureGearRecipeTemplates(ctx: any) {
     for (const recipe of GEAR_RECIPES) {
       const output = findItemTemplateByName(ctx, recipe.outputName);
       const req1 = findItemTemplateByName(ctx, recipe.req1Name);
       const req2 = findItemTemplateByName(ctx, recipe.req2Name);
       const req3 = findItemTemplateByName(ctx, recipe.req3Name);
       if (!req1 || !req2) continue;
       addRecipeTemplate(ctx, {
         key: recipe.key,
         name: recipe.name,
         output, outputCount: 1n,
         req1, req1Count: recipe.req1Count,
         req2, req2Count: recipe.req2Count,
         req3, req3Count: recipe.req3Count,
         recipeType: recipe.recipeType,
       });
     }
   }
   ```

4. **`ensureRecipeScrollItemTemplates()`**: Replace the local `GEAR_RECIPE_NAMES` constant with the imported one from crafting_materials.ts. Delete the local array declaration on lines ~1987-1991.

**location.ts changes:**

5. **`getGatherableResourceTemplates()`**: Keep the existing non-material entries (Stone, Sand, Flax, Herbs, etc.) as-is in the hardcoded pools. Then, AFTER building the base pool for the terrain type, inject crafting material entries from MATERIAL_DEFS:
   ```ts
   import { MATERIAL_DEFS } from '../data/crafting_materials';

   // After getting base entries from pools[key]:
   // Inject gatherable crafting materials from MATERIAL_DEFS
   for (const mat of MATERIAL_DEFS) {
     if (!mat.gatherEntries) continue;
     for (const entry of mat.gatherEntries) {
       if (entry.terrain === key) {
         entries.push({ name: mat.name, weight: entry.weight, timeOfDay: entry.timeOfDay });
       }
     }
   }
   ```
   Then REMOVE the material entries that are now injected (Copper Ore, Iron Ore, Darksteel Ore, Moonweave Cloth) from the hardcoded pools. Keep non-material resources (Stone, Sand, Wood, Herbs, etc.) in the hardcoded pools since they are not crafting materials tracked in MATERIAL_DEFS.

**combat.ts changes:**

6. **Essence drop logic**: Replace the 4 hardcoded template lookups and the if/else level chain with:
   ```ts
   import { ESSENCE_TIER_THRESHOLDS } from '../data/crafting_materials';

   // Before the participant loop, build essence template map:
   const essenceTemplateMap = new Map<string, any>();
   for (const threshold of ESSENCE_TIER_THRESHOLDS) {
     const tmpl = [...ctx.db.itemTemplate.iter()].find(t => t.name === threshold.essenceName);
     if (tmpl) essenceTemplateMap.set(threshold.essenceName, tmpl);
   }

   // Inside the loot loop, replace the if/else chain:
   const enemyLevel = template.level ?? 1n;
   let essenceToDrop: any = null;
   for (const threshold of ESSENCE_TIER_THRESHOLDS) {
     if (enemyLevel >= threshold.minLevel) {
       essenceToDrop = essenceTemplateMap.get(threshold.essenceName);
       break;
     }
   }
   ```
   This eliminates the hardcoded `essenceITemplate`/`essenceIITemplate`/etc. variables and the `>= 31n`/`>= 21n`/`>= 11n` chain.
  </action>
  <verify>
1. TypeScript compiles: `cd spacetimedb && npx tsc --noEmit`
2. Publish module: `spacetime publish uwr --project-path spacetimedb` (no --clear-database needed since no schema changes, only seeding logic)
3. Check logs for seeding: `spacetime logs uwr 2>&1 | tail -20` shows no errors
  </verify>
  <done>
- ensureGearMaterialItemTemplates derives all material data from MATERIAL_DEFS (no hardcoded names/tiers/values)
- ensureRecipeTemplates iterates CONSUMABLE_RECIPES (no inline recipe definitions)
- ensureGearRecipeTemplates iterates GEAR_RECIPES (no inline recipe definitions)
- GEAR_RECIPE_NAMES is imported from crafting_materials.ts (no local duplicate)
- getGatherableResourceTemplates injects material entries from MATERIAL_DEFS.gatherEntries (no hardcoded material names in terrain pools)
- Essence drop logic uses ESSENCE_TIER_THRESHOLDS (no hardcoded level/name pairs)
- All crafting metadata changes only require editing crafting_materials.ts
  </done>
</task>

</tasks>

<verification>
1. `cd spacetimedb && npx tsc --noEmit` passes with no errors
2. `spacetime publish uwr --project-path spacetimedb` succeeds
3. `spacetime logs uwr` shows clean seeding with all 14 consumable recipes, 15 gear recipes, 14 materials, and 15 recipe scrolls
4. Grep for recipe metadata duplication:
   - `grep -r "Copper Ore" spacetimedb/src/seeding/` should find zero hardcoded vendor values
   - `grep -r "Essence I" spacetimedb/src/reducers/combat.ts` should find zero hardcoded name literals
   - `grep -r "GEAR_RECIPE_NAMES" spacetimedb/src/seeding/ensure_items.ts` should find import, not declaration
</verification>

<success_criteria>
- All crafting material metadata (14 materials with names, tiers, vendor values, gather terrains, affinities) defined exclusively in MATERIAL_DEFS
- All recipe metadata (14 consumable + 15 gear recipes with keys, names, ingredients, counts) defined exclusively in CONSUMABLE_RECIPES and GEAR_RECIPES
- Essence tier thresholds defined in ESSENCE_TIER_THRESHOLDS, not hardcoded in combat.ts
- Gather terrain material pools derived from MATERIAL_DEFS.gatherEntries, not hardcoded in location.ts
- No behavioral changes: same recipes, same materials, same drops, same crafting outcomes
- Module publishes and runs without errors
</success_criteria>

<output>
After completion, create `.planning/quick/166-pass-through-the-entire-crafting-system-/166-SUMMARY.md`
</output>
