---
phase: 30
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
  - src/components/InventoryPanel.vue
  - src/composables/useInventory.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Stackable items with quantity > 1 show a 'Split' option in the right-click context menu"
    - "Clicking Split on a full backpack shows log message: Not enough room to split this stack"
    - "Clicking Split with room prompts for quantity and creates a new stack in the backpack"
    - "Original stack quantity is reduced by the split amount"
    - "Non-stackable items or stacks of 1 do not show Split option"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "split_stack reducer"
      contains: "split_stack"
    - path: "src/components/InventoryPanel.vue"
      provides: "Split context menu option and split-stack emit"
    - path: "src/composables/useInventory.ts"
      provides: "splitStack function calling reducer"
    - path: "src/App.vue"
      provides: "split-stack event wiring"
  key_links:
    - from: "src/components/InventoryPanel.vue"
      to: "src/App.vue"
      via: "emit('split-stack', itemInstanceId, quantity)"
      pattern: "split-stack"
    - from: "src/App.vue"
      to: "src/composables/useInventory.ts"
      via: "splitStack function"
      pattern: "splitStack"
    - from: "src/composables/useInventory.ts"
      to: "spacetimedb/src/reducers/items.ts"
      via: "reducers.splitStack reducer call"
      pattern: "splitStack"
---

<objective>
Add inventory stack splitting so players can right-click a stackable item, choose "Split", specify a quantity, and create a new stack in an available backpack slot.

Purpose: Better inventory management for stackable items (resources, consumables, food).
Output: Working split-stack feature across backend reducer and client UI.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/items.ts (item reducers, pattern for new reducer)
@spacetimedb/src/index.ts (addItemToInventory, getInventorySlotCount, deps assembly ~line 6200-6296)
@src/components/InventoryPanel.vue (context menu, bag grid)
@src/composables/useInventory.ts (inventory composable, reducer wiring)
@src/App.vue (event wiring between InventoryPanel and composable)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add split_stack backend reducer</name>
  <files>spacetimedb/src/reducers/items.ts, spacetimedb/src/index.ts</files>
  <action>
In `spacetimedb/src/reducers/items.ts`, add a new reducer `split_stack` inside the `registerItemReducers` function (after the `delete_item` reducer around line 323).

The reducer signature:
```
spacetimedb.reducer('split_stack', { characterId: t.u64(), itemInstanceId: t.u64(), quantity: t.u64() }, (ctx, args) => { ... });
```

Implementation:
1. `const character = requireCharacterOwnedBy(ctx, args.characterId);`
2. Find the item instance: `const instance = ctx.db.itemInstance.id.find(args.itemInstanceId);`
3. Validate instance exists, belongs to character, is not equipped (same pattern as `delete_item`)
4. Find the template: `const template = ctx.db.itemTemplate.id.find(instance.templateId);`
5. Validate template exists and `template.stackable === true` -- if not stackable, `return failItem(ctx, character, 'This item cannot be split.');`
6. Validate `instance.quantity > 1n` and `args.quantity > 0n` and `args.quantity < instance.quantity` -- if not, `return failItem(ctx, character, 'Invalid split quantity.');`
7. Check inventory space: `if (getInventorySlotCount(ctx, character.id) >= 20) return failItem(ctx, character, 'Not enough room to split this stack.');`
8. Reduce original stack: `ctx.db.itemInstance.id.update({ ...instance, quantity: instance.quantity - args.quantity });`
9. Create new stack: `ctx.db.itemInstance.insert({ id: 0n, templateId: instance.templateId, ownerCharacterId: character.id, equippedSlot: undefined, quantity: args.quantity });`
10. Log: `appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', \`You split off ${args.quantity} ${template.name}.\`);`

Note: Do NOT use `addItemToInventory` because it merges back into existing stacks. We need a NEW separate row.

No changes needed to deps assembly in index.ts -- the reducer is registered via `registerItemReducers(deps)` which is already called.
  </action>
  <verify>
Run `spacetime publish uwr --clear-database -y --project-path spacetimedb` -- module compiles and publishes without errors. Then run `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` to regenerate bindings. Confirm `src/module_bindings/split_stack_type.ts` and `src/module_bindings/split_stack_reducer.ts` are generated.
  </verify>
  <done>split_stack reducer exists, module publishes, client bindings generated with splitStack reducer available.</done>
</task>

<task type="auto">
  <name>Task 2: Wire split into client UI - context menu, composable, and App.vue</name>
  <files>src/components/InventoryPanel.vue, src/composables/useInventory.ts, src/App.vue</files>
  <action>
**InventoryPanel.vue changes:**

1. Add a new emit to the `defineEmits` block:
   `(e: 'split-stack', itemInstanceId: bigint, quantity: bigint): void;`

2. In `openItemContextMenu`, after the eatable check and before the Delete push (~line 188), add the Split option:
   ```
   if (item.stackable && item.quantity > 1n) {
     items.push({
       label: 'Split',
       action: () => {
         const max = Number(item.quantity) - 1;
         const input = window.prompt(`Split how many? (1-${max})`, String(Math.floor(max / 2) || 1));
         if (input === null) return;
         const qty = parseInt(input, 10);
         if (isNaN(qty) || qty < 1 || qty > max) return;
         emit('split-stack', item.id, BigInt(qty));
       },
     });
   }
   ```
   This shows "Split" only for stackable items with quantity > 1. Uses `window.prompt` for quantity input (consistent with the existing `window.confirm` pattern for delete). The action validates the input client-side before emitting.

**useInventory.ts changes:**

1. Import `splitStack` reducer: add `reducers.splitStack` via `useReducer`:
   `const splitStackReducer = useReducer(reducers.splitStack);`

2. Add `splitStack` function:
   ```
   const splitStack = (itemInstanceId: bigint, quantity: bigint) => {
     if (!connActive.value || !selectedCharacter.value) return;
     splitStackReducer({ characterId: selectedCharacter.value.id, itemInstanceId, quantity });
   };
   ```

3. Return `splitStack` from the composable (add to the return object).

**App.vue changes:**

1. Destructure `splitStack` from the `useInventory` call (around line 1108, add `splitStack` alongside existing destructured values like `equipItem`, `unequipItem`, etc.)

2. On the `<InventoryPanel>` element (line 163), add the event handler:
   `@split-stack="(id: bigint, qty: bigint) => splitStack(id, qty)"`
   Insert it after `@delete-item="deleteItem"`.
  </action>
  <verify>
Run `npm run dev` (or the project's dev command). Open the app in browser. Right-click a stackable item with quantity > 1 in the backpack. Verify "Split" option appears in context menu. Click Split, enter a valid quantity, confirm the original stack is reduced and a new stack appears. Also verify: Split does NOT appear for non-stackable items or stacks of 1. Splitting when backpack is full shows the log message "Not enough room to split this stack."
  </verify>
  <done>
Split option appears in context menu for stackable items with quantity > 1. Clicking Split prompts for quantity. Valid input creates a new stack and reduces the original. Invalid input (cancel, 0, negative, >= total) is silently ignored. Full backpack shows error log message. Non-stackable items and single-quantity stacks do not show Split option.
  </done>
</task>

</tasks>

<verification>
1. Right-click a stackable item (e.g., Copper Ore x5) -- "Split" option visible in context menu
2. Click Split -- prompt asks for quantity with sensible default
3. Enter valid quantity (e.g., 2) -- original stack shows x3, new stack shows x2
4. Right-click a non-stackable item (e.g., a weapon) -- no "Split" option
5. Right-click a stackable item with quantity 1 -- no "Split" option
6. Fill backpack to 20 slots, try splitting -- log shows "Not enough room to split this stack"
7. Enter invalid quantity (0, negative, more than stack) in prompt -- nothing happens
8. Cancel prompt -- nothing happens
</verification>

<success_criteria>
- split_stack reducer deployed and accessible from client
- Context menu shows "Split" only for stackable items with quantity > 1
- Prompt allows quantity selection with client-side validation
- Backend validates ownership, stackability, quantity bounds, and inventory space
- New stack created as separate ItemInstance row (not merged into existing)
- Error cases produce appropriate log messages
</success_criteria>

<output>
After completion, create `.planning/quick/30-add-inventory-stack-splitting-with-conte/30-SUMMARY.md`
</output>
