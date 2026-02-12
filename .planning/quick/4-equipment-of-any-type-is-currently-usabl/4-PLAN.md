---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useInventory.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Equipment with armor type restrictions is not equipable by classes that cannot wear that armor type (e.g. wizard cannot equip plate armor)"
    - "Equip button is hidden for items the current class cannot use (both allowedClasses and armor type proficiency)"
    - "Hovering over any equipment item shows which classes can use it in the tooltip"
  artifacts:
    - path: "src/composables/useInventory.ts"
      provides: "Armor type proficiency check in equipable computation"
    - path: "src/App.vue"
      provides: "Class restriction info in tooltip display"
  key_links:
    - from: "src/composables/useInventory.ts"
      to: "CLASS_ARMOR map"
      via: "local constant duplicating server-side CLASS_ARMOR"
      pattern: "CLASS_ARMOR"
---

<objective>
Fix equipment class restrictions: add client-side armor type proficiency check so the Equip button is properly hidden for items a class cannot wear, and enhance item tooltips to show class restriction information (allowed classes and armor type).

Purpose: The backend equip_item reducer already enforces isClassAllowed and isArmorAllowedForClass, but the client-side equipable flag only checks allowedClasses (which is 'any' for all armor). This means a wizard sees "Equip" on plate armor -- clicking it fails silently on the backend. The tooltip also lacks class restriction info, making it unclear who can use an item.

Output: Updated useInventory.ts with armor proficiency check, updated App.vue tooltip with class/armor info.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useInventory.ts
@src/App.vue (tooltip section lines 536-552, showTooltip lines 1760-1785)
@src/components/InventoryPanel.vue
@spacetimedb/src/data/class_stats.ts (CLASS_ARMOR map, lines 61-78)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add armor type proficiency check to client-side equipable flag</name>
  <files>src/composables/useInventory.ts</files>
  <action>
Add a CLIENT-SIDE copy of the CLASS_ARMOR map from spacetimedb/src/data/class_stats.ts to useInventory.ts (as a const at module level). This map defines which armor types each class can wear:

```typescript
const CLASS_ARMOR: Record<string, string[]> = {
  bard: ['cloth'],
  enchanter: ['cloth'],
  cleric: ['cloth'],
  wizard: ['cloth'],
  druid: ['cloth'],
  necromancer: ['cloth'],
  summoner: ['cloth'],
  rogue: ['leather', 'cloth'],
  monk: ['leather', 'cloth'],
  spellblade: ['leather', 'cloth'],
  reaver: ['leather', 'cloth'],
  beastmaster: ['leather', 'cloth'],
  ranger: ['chain', 'leather', 'cloth'],
  shaman: ['chain', 'leather', 'cloth'],
  warrior: ['plate', 'chain', 'leather', 'cloth'],
  paladin: ['plate', 'chain', 'leather', 'cloth'],
};
```

Then in the `inventoryItems` computed, after the existing `classAllowed` check (line ~119-122), add an `armorAllowed` check:

```typescript
const armorAllowed =
  !template?.armorType ||
  template.armorType === 'none' ||
  (CLASS_ARMOR[normalizedClass] ?? ['cloth']).includes(template.armorType.toLowerCase());
```

Update the `equipable` calculation to include `armorAllowed`:

```typescript
const equipable =
  EQUIPMENT_SLOTS.includes(slot as ...) &&
  !isJunk &&
  (!selectedCharacter.value || selectedCharacter.value.level >= (template?.requiredLevel ?? 1n)) &&
  classAllowed &&
  armorAllowed;
```

Also add `allowedClasses` field to the `EquippedSlot` type and populate it in the `equippedSlots` computed so equipped items can show class info in tooltips too. Add it as: `allowedClasses: template?.allowedClasses ?? 'any'` in the return object of the equippedSlots map function.

Do NOT modify any backend files. This is a client-side only change.
  </action>
  <verify>Run `npx vue-tsc --noEmit` from project root to confirm TypeScript compiles. Visually verify: a wizard character should NOT see an "Equip" button on plate/chain/leather armor items in inventory.</verify>
  <done>Equip button is hidden for items whose armor type is not in the character's class armor proficiency list. The equipable flag respects both allowedClasses and armor type proficiency.</done>
</task>

<task type="auto">
  <name>Task 2: Add class restriction info to item hover tooltips</name>
  <files>src/App.vue</files>
  <action>
In App.vue, find the tooltip rendering section (around lines 536-552). After the stats section and before the closing `</div>`, add a new line showing class restriction information. The tooltip currently shows: name, description, stats.

Add after the stats block:

```html
<div v-if="tooltip.item?.allowedClasses && tooltip.item.allowedClasses !== 'any'" :style="styles.tooltipLine">
  Classes: {{ tooltip.item.allowedClasses }}
</div>
<div v-if="tooltip.item?.armorType && tooltip.item.armorType !== 'none'" :style="styles.tooltipLine">
  Armor: {{ tooltip.item.armorType.charAt(0).toUpperCase() + tooltip.item.armorType.slice(1) }}
</div>
```

This shows:
- "Classes: warrior" or "Classes: paladin,cleric" when allowedClasses is NOT 'any' (weapons with class restrictions)
- "Armor: Plate" or "Armor: Cloth" when armorType is NOT 'none' (armor items -- users can infer class restrictions from armor type)
- Nothing extra for items with allowedClasses='any' and armorType='none' (accessories, consumables, junk)

The tooltip.item object already has allowedClasses (from InventoryItem type in useInventory) and armorType (from both InventoryItem and EquippedSlot types). The data is already passed through the show-tooltip event from InventoryPanel, VendorPanel, and CombatPanel.

Do NOT add new styles -- reuse the existing `styles.tooltipLine` style.
  </action>
  <verify>Run `npx vue-tsc --noEmit` from project root. Hover over a weapon item (e.g. Training Sword) in inventory -- tooltip should show "Classes: warrior". Hover over armor item (e.g. Vanguard Cuirass) -- tooltip should show "Armor: Plate". Hover over a consumable -- no extra class/armor lines shown.</verify>
  <done>Item tooltips display class restrictions (allowedClasses) and armor type when applicable, giving players clear information about who can use each item.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors: `npx vue-tsc --noEmit`
- A class that cannot wear plate armor (e.g. wizard) does NOT see an Equip button on plate armor items
- A class that cannot use a weapon (e.g. wizard with Training Sword) does NOT see an Equip button
- Hovering over class-restricted weapons shows "Classes: ..." in tooltip
- Hovering over armor shows "Armor: ..." type in tooltip
- Hovering over consumables/junk shows no extra class/armor lines
- Backend equip_item reducer behavior unchanged (already enforces restrictions)
</verification>

<success_criteria>
- Equip button respects both allowedClasses AND armor type proficiency client-side
- Tooltips show class restrictions and armor type for relevant items
- No TypeScript compilation errors
- No changes to backend code
</success_criteria>

<output>
After completion, create `.planning/quick/4-equipment-of-any-type-is-currently-usabl/4-SUMMARY.md`
</output>
