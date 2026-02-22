---
phase: quick-277
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useHotbar.ts
  - src/composables/useInventory.ts
  - src/components/InventoryPanel.vue
  - src/App.vue
autonomous: true
requirements: [QUICK-277]

must_haves:
  truths:
    - "Right-clicking a consumable or food item in inventory shows an 'Add to Hotbar' submenu"
    - "Selecting a hotbar slot from the submenu assigns that item to the slot"
    - "The hotbar slot displays the item name and remaining quantity"
    - "Clicking or pressing the hotkey calls use_item (consumable) or eat_food (food) for the first matching inventory instance"
    - "The slot shows 'Empty' or is disabled when the item is fully depleted"
  artifacts:
    - path: "src/composables/useHotbar.ts"
      provides: "Item hotbar slot rendering and click handler"
    - path: "src/composables/useInventory.ts"
      provides: "inventoryItems passed through to hotbar for count lookup"
    - path: "src/components/InventoryPanel.vue"
      provides: "Add to Hotbar context menu option"
    - path: "src/App.vue"
      provides: "Wiring — inventory items passed to useHotbar, emit handler"
  key_links:
    - from: "src/components/InventoryPanel.vue"
      to: "src/App.vue"
      via: "emit('add-to-hotbar', item.slot, item.templateId)"
      pattern: "add-to-hotbar"
    - from: "src/composables/useHotbar.ts"
      to: "conn.reducers.useItem / conn.reducers.eatFood"
      via: "item: prefix in abilityKey, templateId lookup in inventoryItems"
      pattern: "item:\\d+"
---

<objective>
Allow consumable and food items to be assigned to hotbar slots via a right-click context menu. When the slot is activated, it consumes the first matching inventory instance. The slot shows item name and remaining quantity.

Purpose: Core QoL feature — lets players use potions/food without opening inventory.
Output: Working item hotbar slots with count display, wired to use_item and eat_food reducers.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useHotbar.ts
@src/composables/useInventory.ts
@src/components/InventoryPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add item-slot support to useHotbar</name>
  <files>src/composables/useHotbar.ts</files>
  <action>
Item slots are stored in `HotbarSlot.abilityKey` using the prefix convention `item:<templateId>` (e.g., `item:42`). This distinguishes them from ability keys (which never contain a colon).

1. **Extend `UseHotbarArgs`** — add `inventoryItems: Ref<Array<{ id: bigint; name: string; slot: string; quantity: bigint; stackable: boolean; usable: boolean; eatable: boolean; templateId: bigint }>>`. Also add `eatFoodFn: (itemInstanceId: bigint) => void`.

2. **Update `hotbarDisplay`** — after resolving `assignment`, check if `assignment.abilityKey` starts with `item:`. If so:
   - Parse `templateId = BigInt(assignment.abilityKey.split(':')[1])`
   - Find matching items: `const matches = inventoryItems.value.filter(i => i.templateId === templateId)`
   - Total quantity: sum of all matching item quantities (or 0 if none)
   - Name: first match's name, or `assignment.name` (from hotbarAssignments which stores the abilityKey as name if not resolved — we need to handle this)
   - Set `kind: 'item'`, `cooldownRemaining: 0`, `cooldownSeconds: 0n`
   - Add two extra fields to the return object: `itemCount: number` (total quantity as Number) and `itemTemplateId: bigint | null`

   The `HotbarDisplaySlot` type needs two new optional fields: `itemCount?: number` and `itemTemplateId?: bigint | null`.

3. **Update `hotbarAssignments`** — when a `hotbarSlot.abilityKey` starts with `item:`, look up template name from inventoryItems (find first matching templateId). Set `name` to the item name (or the raw key as fallback). This ensures the display name appears correctly.

   Since `inventoryItems` contains full item data including `name`, do:
   ```ts
   if (row.abilityKey.startsWith('item:')) {
     const templateId = BigInt(row.abilityKey.split(':')[1]);
     const match = inventoryItems.value.find(i => i.templateId === templateId);
     target.name = match?.name ?? row.abilityKey;
   } else {
     target.name = ability?.name ?? row.abilityKey;
   }
   ```

4. **Update `onHotbarClick`** — add an item handler branch before the `useAbility` call:
   ```ts
   if (slot.abilityKey?.startsWith('item:') && slot.itemTemplateId != null) {
     const templateId = slot.itemTemplateId;
     const conn = window.__db_conn;
     const charId = selectedCharacter.value?.id;
     if (!conn || !charId) return;
     // Find first matching inventory instance
     const match = inventoryItems.value.find(i => i.templateId === templateId && i.quantity > 0n);
     if (!match) {
       addLocalEvent?.('blocked', 'No more of that item.');
       return;
     }
     hotbarPulseKey.value = slot.abilityKey;
     window.setTimeout(() => {
       if (hotbarPulseKey.value === slot.abilityKey) hotbarPulseKey.value = null;
     }, 800);
     if (match.eatable) {
       eatFoodFn(match.id);
     } else {
       conn.reducers.useItem({ characterId: charId, itemInstanceId: match.id });
     }
     return;
   }
   ```

   The `inventoryItems` ref must be available in closure — pass it in via `UseHotbarArgs`.

5. **Return `hotbarDisplay`** from the composable (it already is returned — just ensure the updated type flows through).

Note: Do NOT use optimistic cooldown prediction for item slots (items have no AbilityCooldown rows). The pulse animation is sufficient feedback.
  </action>
  <verify>TypeScript compiles: `npm run build 2>&1 | grep -i error | head -20`</verify>
  <done>useHotbar handles `item:` prefixed abilityKeys — resolves name/count from inventoryItems, calls use_item or eat_food on click, no TS errors.</done>
</task>

<task type="auto">
  <name>Task 2: Wire inventory items into useHotbar and add "Add to Hotbar" to context menu</name>
  <files>src/App.vue, src/components/InventoryPanel.vue</files>
  <action>
**In `src/App.vue`:**

1. Add `inventoryItems` and `eatFood` to the `useHotbar()` call arguments:
   ```ts
   const { ... } = useHotbar({
     ...existing args...
     inventoryItems,      // already in scope from useInventory()
     eatFoodFn: eatFood,  // already defined in App.vue
   });
   ```

2. In the hotbar button template (the floating `data-panel-id="hotbar"` section), update the slot display to show item count. The hotbar slots already show `slot.name` — add a count badge after the name:
   ```html
   <span v-if="slot.itemCount != null && slot.itemCount >= 0" :style="styles.hotbarSlotCount">
     {{ slot.itemCount > 0 ? slot.itemCount : 'x0' }}
   </span>
   ```
   Also disable the slot button when `slot.kind === 'item' && slot.itemCount === 0`.

3. Add `hotbarSlotCount` to the styles object in `src/styles.ts` (or wherever the styles object is defined — search for `hotbarSlot:` and add nearby):
   ```ts
   hotbarSlotCount: {
     fontSize: '0.65rem',
     color: 'rgba(200,230,200,0.85)',
     fontWeight: 600,
   }
   ```
   If styles are inline in App.vue, add it there.

4. Pass `hotbar` (the hotbarAssignments) and an `add-to-hotbar` emit handler to InventoryPanel — add new prop `hotbar` of type `{ slot: number; abilityKey: string; name: string }[]` and emit handler:
   ```ts
   const onAddItemToHotbar = (itemTemplateId: bigint, itemName: string) => {
     // Show a prompt to pick a slot 1-10
     const input = window.prompt(`Assign "${itemName}" to hotbar slot (1-10):`);
     if (input === null) return;
     const slotNum = parseInt(input, 10);
     if (isNaN(slotNum) || slotNum < 1 || slotNum > 10) return;
     setHotbarSlot(slotNum, `item:${itemTemplateId}`);
   };
   ```
   Wire to InventoryPanel: `@add-to-hotbar="onAddItemToHotbar"`.

**In `src/components/InventoryPanel.vue`:**

1. Add new emit: `(e: 'add-to-hotbar', templateId: bigint, name: string): void`

2. In `openItemContextMenu`, add an "Add to Hotbar" option for usable or eatable items (before the Delete option):
   ```ts
   if (item.usable || item.eatable) {
     items.push({
       label: 'Add to Hotbar',
       action: () => emit('add-to-hotbar', item.templateId, item.name),
     });
   }
   ```

   The `inventoryItems` prop items already have `usable` and `eatable` fields. They also need a `templateId: bigint` field — check if it exists in the prop type. If not, add it:
   In the `inventoryItems` prop type array, add `templateId: bigint`.

   In `useInventory.ts`, ensure `templateId` is included in the mapped `inventoryItems` computed. Look for where `inventoryItems` is built (it maps over itemInstances + templates). Add `templateId: template.id` if missing.

Note on `item.templateId`: Check `src/composables/useInventory.ts` — the `inventoryItems` computed maps `ItemInstanceRow` + `ItemTemplateRow`. The instance row has `templateId` (from `ItemInstance.itemTemplateId` or similar). Verify the field name by searching `ItemInstanceRow` in module_bindings or the composable, then expose it.
  </action>
  <verify>
1. `npm run build` completes without errors.
2. Right-click a consumable/food in inventory — context menu shows "Add to Hotbar".
3. Enter slot number — hotbar slot displays item name.
4. Clicking the slot calls use_item or eat_food (check browser network or game log).
  </verify>
  <done>
- "Add to Hotbar" appears in right-click context menu for usable/eatable items.
- Hotbar slot shows item name and quantity (e.g., "Bandage x3").
- Clicking the slot triggers use_item or eat_food for the first matching instance.
- Slot disables (greyed out) when count reaches 0.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` exits 0 with no TypeScript errors.
2. Right-click a Bandage or Travelers Tea in inventory — "Add to Hotbar" option appears.
3. Assign to slot — hotbar shows item name + quantity count.
4. Click slot — item is consumed (HP restored or buff applied), count decrements.
5. Right-click a food item (slot=food) — "Add to Hotbar" option appears; clicking slot calls eat_food.
6. When no items remain, slot button is disabled.
</verification>

<success_criteria>
Consumable and food items can be assigned to hotbar slots via right-click. The slot shows name and count. Activating the slot uses the item via the correct reducer. The feature works end-to-end without server changes.
</success_criteria>

<output>
After completion, create `.planning/quick/277-add-consumable-and-food-items-to-hotbar/277-SUMMARY.md` using the summary template.
</output>
