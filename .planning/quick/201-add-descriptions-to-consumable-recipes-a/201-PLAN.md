---
phase: quick-201
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
requirements: [QUICK-201]

must_haves:
  truths:
    - "crafting_materials.ts is the single source of truth for all consumable output item metadata"
    - "All 14 CONSUMABLE_RECIPES entries carry description, outputSlot, outputVendorValue, and optional foodBuff fields"
    - "ensure_items.ts seeds consumable item templates by looping CONSUMABLE_RECIPES — no separate craftItems array, no separate Bandage line, no separate ensureFoodItemTemplates inline array"
    - "Food items still receive wellFedDurationMicros, wellFedBuffType, wellFedBuffMagnitude from the foodBuff field on the recipe"
    - "No existing item descriptions or buff data are lost"
  artifacts:
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "Extended ConsumableRecipeDef interface + all 14 recipe entries with full metadata"
      contains: "outputSlot"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "Loop over CONSUMABLE_RECIPES for non-food and food item template seeding"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "spacetimedb/src/data/crafting_materials.ts"
      via: "CONSUMABLE_RECIPES import"
      pattern: "CONSUMABLE_RECIPES"
---

<objective>
Extend ConsumableRecipeDef with description, outputSlot, outputVendorValue, and optional foodBuff, populate all 14 entries, then replace the three separate seeding paths in ensure_items.ts (standalone Bandage line, craftItems array, ensureFoodItemTemplates inline array) with a single loop over CONSUMABLE_RECIPES.

Purpose: crafting_materials.ts becomes the single source of truth — adding a new consumable recipe only requires one edit.
Output: Updated crafting_materials.ts and ensure_items.ts; no schema changes required.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/crafting_materials.ts
@spacetimedb/src/seeding/ensure_items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend ConsumableRecipeDef and populate all 14 CONSUMABLE_RECIPES entries</name>
  <files>spacetimedb/src/data/crafting_materials.ts</files>
  <action>
Extend the ConsumableRecipeDef interface (around line 222) with four new fields:

```typescript
export interface ConsumableRecipeDef {
  key: string;
  name: string;
  outputName: string;
  outputCount: bigint;
  req1Name: string;
  req1Count: bigint;
  req2Name: string;
  req2Count: bigint;
  req3Name?: string;
  req3Count?: bigint;
  description: string;
  outputSlot: string;
  outputVendorValue: bigint;
  foodBuff?: {
    buffType: string;
    magnitude: bigint;
    durationMicros: bigint;
  };
}
```

Then update all 14 entries in CONSUMABLE_RECIPES with the following data (preserve all existing fields, add new ones):

- bandage: description='Strips of clean cloth used to bind wounds. Restores a small amount of health.', outputSlot='consumable', outputVendorValue=2n
- simple_rations: description='Basic preserved food. Staves off hunger but grants no special effects.', outputSlot='consumable', outputVendorValue=2n
- torch: description='A wooden shaft wrapped in oil-soaked cloth. Provides light in dark places.', outputSlot='utility', outputVendorValue=2n
- basic_poultice: description='A moist herbal compress that speeds natural healing.', outputSlot='consumable', outputVendorValue=2n
- travelers_tea: description='A warm herbal infusion that restores stamina on the road.', outputSlot='consumable', outputVendorValue=2n
- whetstone: description='A coarse grinding stone used to sharpen blades before battle.', outputSlot='utility', outputVendorValue=2n
- kindling_bundle: description='A bundle of dry twigs and bark. Starts campfires quickly.', outputSlot='utility', outputVendorValue=1n
- rough_rope: description='Braided plant fibers twisted into a sturdy rope.', outputSlot='utility', outputVendorValue=2n
- charcoal: description='Blackened wood remnants. Burns hotter than raw timber.', outputSlot='resource', outputVendorValue=1n
- crude_poison: description='A noxious paste distilled from bitter herbs. Applied to weapon edges.', outputSlot='consumable', outputVendorValue=3n
- herb_broth: description='A fragrant broth steeped with wild herbs. Boosts mana regeneration while Well Fed.', outputSlot='food', outputVendorValue=2n, foodBuff={ buffType: 'mana_regen', magnitude: 1n, durationMicros: 2_700_000_000n }
- roasted_roots: description='Hearty roasted tubers seasoned with salt. Boosts strength while Well Fed.', outputSlot='food', outputVendorValue=2n, foodBuff={ buffType: 'str', magnitude: 1n, durationMicros: 2_700_000_000n }
- travelers_stew: description='A thick stew of meat and vegetables. Boosts stamina regeneration while Well Fed.', outputSlot='food', outputVendorValue=2n, foodBuff={ buffType: 'stamina_regen', magnitude: 1n, durationMicros: 2_700_000_000n }
- foragers_salad: description="A crisp mix of berries and greens. Boosts dexterity while Well Fed.", outputSlot='food', outputVendorValue=2n, foodBuff={ buffType: 'dex', magnitude: 1n, durationMicros: 2_700_000_000n }

NOTE: The ensureFoodItemTemplates function in ensure_items.ts also contains a 5th food item "Healer's Porridge" with wellFedBuffType='health_regen'. That item has no corresponding CONSUMABLE_RECIPES entry. Do NOT add it to CONSUMABLE_RECIPES — it will remain handled by ensureFoodItemTemplates or a future task. Focus only on the 14 existing CONSUMABLE_RECIPES entries here.
  </action>
  <verify>Run: grep -c "outputSlot" spacetimedb/src/data/crafting_materials.ts — should return at least 15 (1 in interface + 14 in array entries). Also verify TypeScript compiles: cd spacetimedb && npx tsc --noEmit 2>&1 | head -20</verify>
  <done>ConsumableRecipeDef has description, outputSlot, outputVendorValue, foodBuff? fields. All 14 CONSUMABLE_RECIPES entries have all four fields populated with correct values matching existing ensure_items.ts data.</done>
</task>

<task type="auto">
  <name>Task 2: Replace three separate seeding paths in ensure_items.ts with a single CONSUMABLE_RECIPES loop</name>
  <files>spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
In ensureCraftableItemTemplates (the function containing the craftItems array):

1. Remove the standalone `upsertResourceByName` call for Bandage (line ~485).
2. Remove the `craftItems` inline array and its `for` loop (lines ~487-500).
3. Replace both with a single loop over CONSUMABLE_RECIPES that skips food items (those with foodBuff defined), since food items need wellFed columns seeded in a separate pass:

```typescript
for (const recipe of CONSUMABLE_RECIPES) {
  if (recipe.foodBuff) continue; // food items handled by ensureFoodItemTemplates
  upsertResourceByName({
    name: recipe.outputName,
    slot: recipe.outputSlot,
    vendorValue: recipe.outputVendorValue,
    description: recipe.description,
  });
}
```

In ensureFoodItemTemplates:

4. Replace the four hard-coded food entries (Herb Broth, Roasted Roots, Traveler's Stew, Forager's Salad) with a loop over CONSUMABLE_RECIPES filtered to those with foodBuff. Preserve the existing "Healer's Porridge" entry exactly — it has no CONSUMABLE_RECIPES entry and must remain inline. The result:

```typescript
export function ensureFoodItemTemplates(ctx: any) {
  // Food items from CONSUMABLE_RECIPES (have foodBuff data)
  const recipeFoodItems = CONSUMABLE_RECIPES
    .filter(r => r.foodBuff)
    .map(r => ({
      name: r.outputName,
      wellFedDurationMicros: r.foodBuff!.durationMicros,
      wellFedBuffType: r.foodBuff!.buffType,
      wellFedBuffMagnitude: r.foodBuff!.magnitude,
      description: r.description,
    }));

  // Additional food items not in CONSUMABLE_RECIPES
  const extraFoodItems = [
    {
      name: "Healer's Porridge",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'health_regen',
      wellFedBuffMagnitude: 1n,
      description: 'A soothing oat porridge infused with restorative herbs. Boosts health regeneration while Well Fed.',
    },
  ];

  const foodItems = [...recipeFoodItems, ...extraFoodItems];

  for (const food of foodItems) {
    // ... existing upsert/insert logic unchanged ...
  }
}
```

Ensure CONSUMABLE_RECIPES is imported at the top of ensure_items.ts (it likely already is from ensureRecipeTemplates usage — confirm before adding a duplicate import).
  </action>
  <verify>Run: grep -n "craftItems\|upsertResourceByName.*Bandage" spacetimedb/src/seeding/ensure_items.ts — should return 0 matches. Run: cd spacetimedb && npx tsc --noEmit 2>&1 | head -20 — should be clean.</verify>
  <done>No standalone Bandage upsert line. No craftItems array. ensureFoodItemTemplates derives its first 4 food items from CONSUMABLE_RECIPES and still seeds Healer's Porridge inline. TypeScript compiles without errors.</done>
</task>

</tasks>

<verification>
After both tasks, confirm:
1. `grep -c "outputSlot" spacetimedb/src/data/crafting_materials.ts` returns >= 15
2. `grep "craftItems" spacetimedb/src/seeding/ensure_items.ts` returns nothing
3. `grep "name: 'Bandage'" spacetimedb/src/seeding/ensure_items.ts` returns nothing (Bandage now comes from CONSUMABLE_RECIPES loop)
4. `grep "Healer" spacetimedb/src/seeding/ensure_items.ts` still returns the Healer's Porridge entry
5. `cd spacetimedb && npx tsc --noEmit` exits cleanly
</verification>

<success_criteria>
- crafting_materials.ts ConsumableRecipeDef interface has description, outputSlot, outputVendorValue, foodBuff? fields
- All 14 CONSUMABLE_RECIPES entries carry those fields with correct values
- ensure_items.ts has no craftItems array and no standalone Bandage upsert
- ensureFoodItemTemplates builds its list from CONSUMABLE_RECIPES (4 food items) + inline extra (Healer's Porridge)
- TypeScript compiles without errors
- Adding a new consumable recipe in future requires only one edit: a new entry in CONSUMABLE_RECIPES
</success_criteria>

<output>
After completion, create `.planning/quick/201-add-descriptions-to-consumable-recipes-a/201-SUMMARY.md`
</output>
