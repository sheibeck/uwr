---
phase: quick-186
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "Discover Recipes only discovers consumable/food recipes (recipeType === 'consumable')"
    - "Gear recipes (weapon/armor/accessory) are NOT discovered via Discover Recipes"
    - "Gear recipes remain discoverable via salvaging and recipe scrolls (unchanged)"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Filtered research_recipes reducer"
      contains: "recipeType.*consumable"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "RecipeTemplate.recipeType"
      via: "skip non-consumable recipes in research_recipes loop"
      pattern: "recipeType.*!==.*consumable"
---

<objective>
Filter gear recipes out of the Discover Recipes button so only consumable and food recipes are auto-discovered.

Purpose: Gear recipes (weapons, armor, accessories) should only be discovered via salvaging items or finding recipe scrolls -- not via the Discover Recipes button. This preserves the intended progression where gear crafting knowledge is earned through gameplay, while consumable recipes remain freely discoverable.

Output: Updated research_recipes reducer that skips gear recipes.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/items.ts (lines 964-1023, research_recipes reducer)
@spacetimedb/src/schema/tables.ts (lines 376-393, RecipeTemplate schema with recipeType field)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Filter gear recipes from research_recipes reducer</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In the `research_recipes` reducer (line 964), inside the `for (const recipe of ctx.db.recipeTemplate.iter())` loop (line 983), add a guard AFTER the `discovered.has()` check (line 984) that skips gear recipes:

```typescript
// Skip gear recipes — only consumables are auto-discoverable
// Gear recipes require salvaging or recipe scrolls
const isGearRecipe = recipe.recipeType && recipe.recipeType !== 'consumable';
if (isGearRecipe) continue;
```

This reuses the exact same `isGearRecipe` pattern already established at line 1100 in the `craft_recipe` reducer. The `recipeType` field is set on all RecipeTemplate rows:
- Gear recipes have recipeType = 'weapon' | 'armor' | 'accessory'
- Consumable recipes have recipeType = 'consumable' (default from addRecipeTemplate seeding)

No imports needed -- this is a pure field check on the already-iterated recipe row.

Do NOT modify any other reducer (craft_recipe, learn_recipe_from_scroll, etc.) -- only research_recipes needs this filter.
  </action>
  <verify>
1. Read the modified reducer and confirm the guard is in the correct position (after discovered check, before material count checks).
2. Run `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify no type errors.
3. Publish: `spacetime publish uwr --project-path spacetimedb` (no --clear-database needed, this is logic-only, no schema change).
  </verify>
  <done>
The research_recipes reducer skips all recipes where recipeType is 'weapon', 'armor', or 'accessory'. Only 'consumable' recipes (Bandages, Simple Rations, Torch, foods, potions) are auto-discovered via the Discover Recipes button. Module compiles and publishes successfully.
  </done>
</task>

</tasks>

<verification>
- Discover Recipes button only discovers consumable/food recipes
- Gear recipes (15 total: weapons, armor, accessories) are excluded from auto-discovery
- Gear recipes still appear in crafting panel when discovered via salvage or scroll learning (unchanged code paths)
- No type errors, module publishes cleanly
</verification>

<success_criteria>
- research_recipes reducer contains guard that skips non-consumable recipeType
- Module compiles with no TypeScript errors
- Module publishes successfully to SpacetimeDB
</success_criteria>

<output>
After completion, create `.planning/quick/186-filter-gear-recipes-from-discover-recipe/186-SUMMARY.md`
</output>
