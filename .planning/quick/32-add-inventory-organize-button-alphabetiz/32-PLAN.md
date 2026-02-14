---
phase: quick-32
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
  - src/composables/useInventory.ts
  - src/components/InventoryPanel.vue
  - src/App.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "An Organize button is visible in the Backpack header row of the inventory panel"
    - "Clicking Organize consolidates multiple stacks of the same stackable item into single stacks"
    - "After organizing, items are sorted by rarity (most rare first) then alphabetically within same rarity"
    - "The organize action works via a server-side reducer so state is persisted and consistent"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "consolidate_stacks reducer"
      contains: "consolidate_stacks"
    - path: "src/composables/useInventory.ts"
      provides: "organizeInventory function and rarity-then-alpha sort"
      contains: "organizeInventory"
    - path: "src/components/InventoryPanel.vue"
      provides: "Organize button in backpack header"
      contains: "Organize"
  key_links:
    - from: "src/components/InventoryPanel.vue"
      to: "src/App.vue"
      via: "organize emit"
      pattern: "organize"
    - from: "src/App.vue"
      to: "src/composables/useInventory.ts"
      via: "organizeInventory call"
      pattern: "organizeInventory"
    - from: "src/composables/useInventory.ts"
      to: "spacetimedb/src/reducers/items.ts"
      via: "consolidate_stacks reducer call"
      pattern: "consolidateStacks"
---

<objective>
Add an "Organize" button to the inventory panel that consolidates stackable item stacks and sorts inventory by rarity (most rare first) then alphabetically.

Purpose: Help players manage cluttered inventories -- merging split stacks frees bag slots, and sorted display makes finding items faster.
Output: Working Organize button with backend stack consolidation and client-side rarity-priority sorting.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/items.ts (item reducers -- split_stack pattern to follow for consolidate_stacks)
@spacetimedb/src/index.ts (ItemInstance/ItemTemplate table schemas, addItemToInventory helper)
@src/composables/useInventory.ts (inventory composable -- current sort, reducer wiring)
@src/components/InventoryPanel.vue (inventory UI -- backpack header, bag grid, context menu)
@src/App.vue (parent wiring -- InventoryPanel props/events)
@src/ui/styles.ts (style definitions)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add consolidate_stacks reducer and rarity-priority sort on client</name>
  <files>
    spacetimedb/src/reducers/items.ts
    src/composables/useInventory.ts
  </files>
  <action>
**Backend -- spacetimedb/src/reducers/items.ts:**

Add a new reducer `consolidate_stacks` inside `registerItemReducers`, following the same pattern as `split_stack`. Place it right after the `split_stack` reducer (around line 357).

```typescript
spacetimedb.reducer('consolidate_stacks', { characterId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  // Group all unequipped stackable instances by templateId
  const stacks = new Map<string, any[]>();
  for (const instance of ctx.db.itemInstance.by_owner.filter(character.id)) {
    if (instance.equippedSlot) continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template || !template.stackable) continue;
    const key = instance.templateId.toString();
    if (!stacks.has(key)) stacks.set(key, []);
    stacks.get(key)!.push(instance);
  }
  let merged = 0;
  for (const [, instances] of stacks) {
    if (instances.length <= 1) continue;
    // Sum all quantities into the first instance, delete the rest
    let totalQty = 0n;
    for (const inst of instances) {
      totalQty += inst.quantity ?? 1n;
    }
    ctx.db.itemInstance.id.update({ ...instances[0], quantity: totalQty });
    for (let i = 1; i < instances.length; i++) {
      ctx.db.itemInstance.id.delete(instances[i].id);
      merged++;
    }
  }
  if (merged > 0) {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `Inventory organized: ${merged} stack(s) consolidated.`);
  } else {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'Inventory organized.');
  }
});
```

**Client -- src/composables/useInventory.ts:**

1. Add `consolidateStacks` reducer import alongside existing reducers (around line 89):
```typescript
const consolidateStacksReducer = useReducer(reducers.consolidateStacks);
```

2. Change the sort at the end of the `inventoryItems` computed (line 193, currently `.sort((a, b) => a.name.localeCompare(b.name))`) to sort by rarity descending first, then alphabetically within same rarity:
```typescript
.sort((a, b) => {
  const rarityOrder: Record<string, number> = {
    legendary: 0,
    epic: 1,
    rare: 2,
    uncommon: 3,
    common: 4,
  };
  const ra = rarityOrder[(a.rarity ?? 'common').toLowerCase()] ?? 5;
  const rb = rarityOrder[(b.rarity ?? 'common').toLowerCase()] ?? 5;
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);
})
```

3. Add `organizeInventory` function after `splitStack` (around line 261):
```typescript
const organizeInventory = () => {
  if (!connActive.value || !selectedCharacter.value) return;
  consolidateStacksReducer({ characterId: selectedCharacter.value.id });
};
```

4. Add `organizeInventory` to the return object.
  </action>
  <verify>
Run `npm run build` from the project root to confirm no TypeScript compilation errors. Verify the reducer is defined correctly in items.ts. Verify the composable exports `organizeInventory`.
  </verify>
  <done>
consolidate_stacks reducer exists in items.ts that merges duplicate stackable stacks per character. Client sort uses rarity (legendary > epic > rare > uncommon > common) then alphabetical. organizeInventory function is exported from useInventory composable.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Organize button to inventory panel UI and wire up in App.vue</name>
  <files>
    src/components/InventoryPanel.vue
    src/App.vue
    src/ui/styles.ts
  </files>
  <action>
**InventoryPanel.vue:**

1. Add emit for organize to the `defineEmits` (around line 146):
```typescript
(e: 'organize'): void;
```

2. Add an "Organize" button in the Backpack header row (the `inventoryHeaderRow` div, around line 40-46). Place it between the "Backpack" title and the gold display:
```html
<div :style="styles.inventoryHeaderRow">
  <div :style="styles.panelSectionTitle">Backpack</div>
  <button
    :style="[styles.ghostButton, combatLocked ? styles.disabledButton : {}]"
    :disabled="combatLocked"
    @click="$emit('organize')"
  >
    Organize
  </button>
  <div v-if="selectedCharacter" :style="styles.goldRow">
    <span :style="styles.goldDot"></span>
    {{ selectedCharacter.gold }}
  </div>
</div>
```

**App.vue:**

1. In the InventoryPanel template usage (line ~163), add the organize event handler. Find the existing event handlers on InventoryPanel and add:
```
@organize="organizeInventory"
```

2. In the script section, make sure `organizeInventory` is destructured from the `useInventory` composable return value (find where `equipItem`, `unequipItem`, `useItem`, `splitStack` are destructured and add `organizeInventory` to the list).

**No style changes needed** -- the existing `ghostButton` style is already used for Unequip buttons in the inventory panel and matches the design language. The button will sit naturally in the header row thanks to the existing `inventoryHeaderRow` flexbox layout.
  </action>
  <verify>
Run `npm run build` to confirm no errors. Visually inspect: the Organize button should appear in the Backpack header between the title and gold display. It should use the ghost button style and be disabled during combat.
  </verify>
  <done>
Organize button visible in inventory Backpack header row. Clicking it calls the consolidate_stacks reducer via the organizeInventory composable function. Button is disabled during combat (combatLocked). After organize, inventory display reflects rarity-priority sorting and consolidated stacks.
  </done>
</task>

<task type="auto">
  <name>Task 3: Publish module, regenerate bindings, and verify</name>
  <files>
    src/module_bindings/
  </files>
  <action>
1. Publish the SpacetimeDB module with `--clear-database` to deploy the new consolidate_stacks reducer:
```bash
spacetime publish uwr --clear-database -y --project-path spacetimedb
```

2. Regenerate TypeScript client bindings so the new reducer is available:
```bash
spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```

3. Run `npm run build` to confirm everything compiles with the new bindings.

4. Check `spacetime logs uwr` for any module publish errors.

If publish fails due to server not running, run `spacetime start` first. If the default server is maincloud (check with `spacetime server list`), publish to maincloud directly.
  </action>
  <verify>
`spacetime logs uwr` shows no errors. `npm run build` passes. The generated module_bindings directory contains the consolidateStacks reducer type.
  </verify>
  <done>
Module published with consolidate_stacks reducer. Client bindings regenerated. Build passes. The full organize flow works end-to-end: button click -> reducer call -> stacks consolidated on server -> subscription updates client -> client displays sorted inventory.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` passes with no errors
2. `spacetime logs uwr` shows clean module initialization
3. The Organize button is visible in the inventory panel Backpack header
4. Clicking Organize when there are duplicate stacks of stackable items consolidates them into single stacks
5. Inventory items are sorted by rarity (legendary first, common last) then alphabetically within each rarity tier
6. The Organize button is disabled during combat
</verification>

<success_criteria>
- Organize button exists in inventory panel header row with ghost button styling
- consolidate_stacks reducer merges duplicate stackable item stacks per character
- Client-side sort orders by rarity (legendary > epic > rare > uncommon > common) then alphabetical
- Button disabled during combat (combatLocked prop)
- Module published and bindings regenerated
</success_criteria>

<output>
After completion, create `.planning/quick/32-add-inventory-organize-button-alphabetiz/32-SUMMARY.md`
</output>
