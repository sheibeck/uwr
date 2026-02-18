---
phase: quick-168
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCrafting.ts
  - src/components/CraftingPanel.vue
  - src/App.vue
autonomous: true

must_haves:
  truths:
    - "Hovering over a recipe card in the Crafting panel shows a tooltip with the output item's stats, rarity color, description, allowed classes, and armor/weapon type"
    - "Moving the mouse updates the tooltip position, leaving the recipe card hides the tooltip"
    - "Consumable recipes show name and description only (no gear stats)"
  artifacts:
    - path: "src/composables/useCrafting.ts"
      provides: "outputItem tooltip data on each recipe entry"
      contains: "outputItem"
    - path: "src/components/CraftingPanel.vue"
      provides: "mouseenter/mousemove/mouseleave handlers emitting tooltip events"
      contains: "show-tooltip"
    - path: "src/App.vue"
      provides: "tooltip event wiring for CraftingPanel"
      contains: "show-tooltip"
  key_links:
    - from: "src/composables/useCrafting.ts"
      to: "src/components/CraftingPanel.vue"
      via: "outputItem field on recipe objects passed as props"
      pattern: "recipe\\.outputItem"
    - from: "src/components/CraftingPanel.vue"
      to: "src/App.vue"
      via: "show-tooltip/move-tooltip/hide-tooltip event emits"
      pattern: "show-tooltip"
---

<objective>
Add hover tooltips to crafting recipe cards so players can see the output item's full details (rarity, stats, description, class restrictions) before crafting.

Purpose: Players currently see only the recipe name and material requirements -- they have no way to evaluate the output item's stats without crafting it first.
Output: Hovering any recipe card in CraftingPanel shows the same tooltip used by inventory/vendor/loot panels.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCrafting.ts
@src/components/CraftingPanel.vue
@src/App.vue
@src/composables/useInventory.ts (stats array pattern reference)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add outputItem tooltip data to useCrafting recipe entries</name>
  <files>src/composables/useCrafting.ts</files>
  <action>
In the `recipes` computed property (around line 55-108), after the existing recipe mapping that produces `{ id, name, outputName, outputCount, requirements, canCraft, recipeType, materialType }`, add an `outputItem` field to each recipe entry.

The `output` variable (line 61) already holds the `ItemTemplateRow` for the recipe's output. Build the `outputItem` object from it:

```typescript
const outputItem = output ? {
  name: output.name,
  rarity: output.rarity,
  qualityTier: output.rarity,
  slot: output.slot,
  armorType: output.armorType,
  allowedClasses: output.allowedClasses,
  requiredLevel: output.requiredLevel,
  description: output.description ?? null,
  stats: [
    output.armorClassBonus ? { label: 'Armor Class', value: `+${output.armorClassBonus}` } : null,
    output.weaponBaseDamage ? { label: 'Weapon Damage', value: `${output.weaponBaseDamage}` } : null,
    output.weaponDps ? { label: 'Weapon DPS', value: `${output.weaponDps}` } : null,
    output.weaponType ? { label: 'Type', value: output.weaponType } : null,
    output.strBonus ? { label: 'STR', value: `+${output.strBonus}` } : null,
    output.dexBonus ? { label: 'DEX', value: `+${output.dexBonus}` } : null,
    output.chaBonus ? { label: 'CHA', value: `+${output.chaBonus}` } : null,
    output.wisBonus ? { label: 'WIS', value: `+${output.wisBonus}` } : null,
    output.intBonus ? { label: 'INT', value: `+${output.intBonus}` } : null,
    output.hpBonus ? { label: 'HP', value: `+${output.hpBonus}` } : null,
    output.manaBonus ? { label: 'Mana', value: `+${output.manaBonus}` } : null,
    output.magicResistanceBonus ? { label: 'Magic Resist', value: `+${output.magicResistanceBonus}` } : null,
    output.requiredLevel && output.requiredLevel > 0n ? { label: 'Required Level', value: `${output.requiredLevel}` } : null,
  ].filter(Boolean) as { label: string; value: string }[],
  affixStats: [],
} : null;
```

Add `outputItem` to the returned object alongside existing fields. This mirrors the exact stats pattern from useInventory.ts (lines 185-197) so the App.vue tooltip renderer handles it identically.

Note: `affixStats` is empty because crafted items get affixes at craft time (based on materials used), not on the template. The tooltip shows base template stats only, which is correct for a pre-craft preview.
  </action>
  <verify>Run `npx vue-tsc --noEmit` from the client directory to confirm no TypeScript errors.</verify>
  <done>Each recipe entry in the `recipes` computed array includes an `outputItem` object with name, rarity, slot, armorType, allowedClasses, description, and a stats array built from the output ItemTemplate's bonus fields. Consumable templates with no gear stats produce an empty stats array.</done>
</task>

<task type="auto">
  <name>Task 2: Wire tooltip events on CraftingPanel recipe cards and App.vue</name>
  <files>src/components/CraftingPanel.vue, src/App.vue</files>
  <action>
**CraftingPanel.vue changes:**

1. Update the `recipes` prop type to include `outputItem`:
```typescript
recipes: {
  id: bigint;
  name: string;
  outputName: string;
  outputCount: bigint;
  requirements: { name: string; required: bigint; available: bigint; hasMaterial: boolean }[];
  canCraft: boolean;
  recipeType: string;
  materialType?: string;
  outputItem: {
    name: string;
    rarity: string;
    qualityTier: string;
    slot: string;
    armorType: string;
    allowedClasses: string;
    description: string | null;
    stats: { label: string; value: string }[];
    affixStats: { label: string; value: string; affixName: string }[];
  } | null;
}[];
```

2. Add three new emits to `defineEmits`:
```typescript
(e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
(e: 'move-tooltip', value: { x: number; y: number }): void;
(e: 'hide-tooltip'): void;
```

3. On each recipe `<li>` element (line 42), add mouse event handlers. The existing `<li v-for="recipe in recipes"...>` line gets these three handlers added:
```
@mouseenter="recipe.outputItem && $emit('show-tooltip', { item: recipe.outputItem, x: $event.clientX, y: $event.clientY })"
@mousemove="recipe.outputItem && $emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
@mouseleave="recipe.outputItem && $emit('hide-tooltip')"
```

This matches the exact pattern used by InventoryPanel.vue (lines 60-62) and VendorPanel.vue (lines 59-61).

**App.vue changes:**

4. On the CraftingPanel element (line 185), add the three tooltip event bindings. The existing CraftingPanel tag already has many event bindings -- append these three:
```
@show-tooltip="showTooltip"
@move-tooltip="moveTooltip"
@hide-tooltip="hideTooltip"
```

This matches the pattern used for LootPanel (line 227) and VendorPanel (line 234) which already wire to the same `showTooltip`/`moveTooltip`/`hideTooltip` handlers.
  </action>
  <verify>Run `npx vue-tsc --noEmit` from the client directory. Then open the app in a browser, open the Crafting panel, and hover over a recipe card -- the tooltip should appear showing the output item's name (colored by rarity), stats, and class restrictions.</verify>
  <done>Hovering over any recipe card in the Crafting panel shows the standard item tooltip with output item details. Moving the mouse updates position. Leaving the card hides the tooltip. The tooltip displays name with rarity color, gear stats (AC/damage/DPS/attribute bonuses), description, allowed classes, and armor type -- identical to inventory tooltips.</done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no type errors
2. Hover a gear recipe (e.g., Iron Sword) -- tooltip shows weapon damage, DPS, type, and any stat bonuses
3. Hover an armor recipe (e.g., Chain Hauberk) -- tooltip shows Armor Class and any stat bonuses
4. Hover a consumable recipe (e.g., Bandage) -- tooltip shows name and description, no gear stats
5. Tooltip follows mouse and disappears when leaving the recipe card
6. Tooltip title color matches the output item's rarity (common=white, uncommon=green, etc.)
</verification>

<success_criteria>
- Recipe cards in the Crafting panel show item tooltips on hover
- Tooltip data comes from the output ItemTemplate (base stats, not crafted affixes)
- No new components created -- reuses existing App.vue tooltip pipeline
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/168-add-recipe-hover-tooltip-to-crafting-pan/168-SUMMARY.md`
</output>
