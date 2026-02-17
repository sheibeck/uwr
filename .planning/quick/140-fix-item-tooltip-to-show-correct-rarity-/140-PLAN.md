---
phase: quick-140
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/composables/useInventory.ts
  - src/composables/useCombat.ts
autonomous: true

must_haves:
  truths:
    - "Item tooltip title text is colored by rarity (white=common, green=uncommon, blue=rare, purple=epic, orange=legendary)"
    - "Item tooltip description line shows the correct qualityTier (not template rarity) and correct tier number"
    - "Weapons do not show 'none' in tooltip description for armor type; they show weapon type or omit it"
  artifacts:
    - path: "src/App.vue"
      provides: "Rarity-colored tooltip title"
      contains: "rarityColor"
    - path: "src/composables/useInventory.ts"
      provides: "Correct description with qualityTier, filtered armorType"
    - path: "src/composables/useCombat.ts"
      provides: "Correct description with qualityTier, filtered armorType"
  key_links:
    - from: "src/App.vue"
      to: "tooltip.item.qualityTier"
      via: "dynamic style color on tooltip title"
      pattern: "rarityColor.*qualityTier"
---

<objective>
Fix three bugs in the item hover tooltip:

1. Item name in tooltip always displays as white (common) regardless of actual rarity
2. Description line always shows "common" and "Tier 1" regardless of actual qualityTier/tier
3. Weapons show "none" in the description where armor type would be

Purpose: Items that drop as uncommon/rare/epic/legendary should visually communicate their rarity in the tooltip. The description line should accurately reflect the item instance's quality, not the base template defaults.

Output: Corrected tooltip rendering in App.vue, corrected description construction in useInventory.ts and useCombat.ts
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/App.vue (lines 474-511: tooltip template)
@src/composables/useInventory.ts (lines 107-239: inventoryItems, lines 241-287: equippedSlots)
@src/composables/useCombat.ts (lines 245-317: pendingLoot)
@src/ui/styles.ts (lines 1289-1302: rarityCommon through rarityLegendary color definitions)
@src/module_bindings/item_instance_type.ts (qualityTier is optional string on instance)
@src/module_bindings/item_template_type.ts (rarity, tier, armorType, weaponType on template)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Color tooltip title by rarity and fix description construction</name>
  <files>
    src/App.vue
    src/composables/useInventory.ts
    src/composables/useCombat.ts
  </files>
  <action>
**Bug 1 — Tooltip title rarity color (App.vue)**

In the tooltip template (around line 482), the title div currently has:
```html
<div :style="styles.tooltipTitle">{{ tooltip.item?.name ?? 'Item' }}</div>
```

Change it to apply rarity color dynamically. Add a computed-style helper or inline the rarity color lookup. The tooltip item objects already have `qualityTier` (from inventory) or `rarity` (from vendor). Use `qualityTier ?? rarity ?? 'common'` to determine the color.

Add a `tooltipRarityColor` helper function in the script section (near the existing tooltip functions around line 2022):

```typescript
const tooltipRarityColor = (item: any): Record<string, string> => {
  const key = ((item?.qualityTier ?? item?.rarity ?? 'common') as string).toLowerCase();
  const map: Record<string, string> = {
    common: '#ffffff',
    uncommon: '#22c55e',
    rare: '#3b82f6',
    epic: '#aa44ff',
    legendary: '#ff8800',
  };
  return { color: map[key] ?? '#ffffff' };
};
```

Update the title div to:
```html
<div :style="{ ...styles.tooltipTitle, ...tooltipRarityColor(tooltip.item) }">{{ tooltip.item?.name ?? 'Item' }}</div>
```

**Bug 2 — Description shows wrong rarity and tier (useInventory.ts and useCombat.ts)**

In `useInventory.ts`, the `inventoryItems` computed (around line 133) builds description from `template?.rarity` and `template?.tier`. Fix it to use the instance-level `qualityTier` (already computed at line 199) and `template?.tier` (tier comes from template, which is correct since instances don't have their own tier).

Move the `qualityTier` computation BEFORE the description construction. Currently `qualityTier` is computed at line 199 but `description` is built at line 133. Reorder so qualityTier is available:

```typescript
const qualityTier = instance.qualityTier ?? template?.rarity ?? 'common';
```

Then in the description array, replace `template?.rarity` with `qualityTier`:
```typescript
const description = foodDescription || ([
  qualityTier,
  // armorType handling (see Bug 3 below)
  template?.slot,
  template?.tier ? `Tier ${template.tier}` : null,
].filter(...));
```

Similarly in the `equippedSlots` computed (around line 250), replace `template?.rarity` with `instance?.qualityTier ?? template?.rarity ?? 'common'` in the description array.

In `useCombat.ts`, the `pendingLoot` computed (line 282) already uses `qualityTier` for the rarity portion of description — this is correct. No change needed for Bug 2 in useCombat.ts.

**Bug 3 — Armor type "none" showing for weapons (useInventory.ts and useCombat.ts)**

In all three description construction sites, `template?.armorType` passes through the filter because "none" is a non-empty truthy string.

Fix: Replace the raw `template?.armorType` in the description array with a conditional that:
- For weapons (slot === 'weapon' or slot === 'mainHand' or slot === 'offHand'): show `template?.weaponType` instead (e.g., "sword", "axe", "staff"), capitalized. If weaponType is empty/falsy, omit it.
- For armor slots: show `template?.armorType` but filter out "none" explicitly.

In the description filter array, replace `template?.armorType` with:
```typescript
(template?.slot === 'weapon' || template?.slot === 'mainHand' || template?.slot === 'offHand')
  ? (template?.weaponType || null)
  : (template?.armorType && template.armorType !== 'none' ? template.armorType : null),
```

Apply this fix in all three locations:
1. `useInventory.ts` inventoryItems description (around line 133-142)
2. `useInventory.ts` equippedSlots description (around line 250-258)
3. `useCombat.ts` pendingLoot description (around line 282-290)

Also check if `useCombat.ts` has another description construction around line 210-218 (the `activeLoot` or similar) and apply the same fix there.
  </action>
  <verify>
    1. Run `npx vue-tsc --noEmit 2>&1 | head -30` to verify no TypeScript errors
    2. Run `npx vite build 2>&1 | tail -10` to verify build succeeds
    3. Manually inspect the tooltip template in App.vue to confirm rarity color is applied to title
    4. Manually inspect description construction in useInventory.ts to confirm qualityTier is used instead of template.rarity
    5. Manually inspect description construction to confirm armorType "none" is filtered for weapons
  </verify>
  <done>
    - Tooltip title text in App.vue is colored by the item's qualityTier (common=white, uncommon=green, rare=blue, epic=purple, legendary=orange)
    - Description line in inventory tooltip shows the instance's qualityTier (not template rarity)
    - Weapons do not show "none" in description; they show weaponType if available, or nothing
    - Armor items still correctly show their armorType when it is not "none"
    - Build passes with no errors
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation passes (`npx vue-tsc --noEmit`)
- Vite build succeeds (`npx vite build`)
- Tooltip title in App.vue applies rarity-based color from qualityTier
- Description arrays in useInventory.ts use qualityTier instead of template.rarity
- Description arrays filter out armorType "none" for weapons, show weaponType instead
- No regressions to existing tooltip functionality (stats, affixes, classes still display)
</verification>

<success_criteria>
- Hovering over an uncommon+ item shows the item name in the correct rarity color in the tooltip
- The description line shows the correct quality tier name (uncommon, rare, epic, legendary) instead of always "common"
- Weapons show their weapon type (sword, axe, etc.) or omit the type field entirely, instead of showing "none"
- All three tooltip sources (inventory, equipped, loot) produce correct descriptions
</success_criteria>

<output>
After completion, create `.planning/quick/140-fix-item-tooltip-to-show-correct-rarity-/140-SUMMARY.md`
</output>
