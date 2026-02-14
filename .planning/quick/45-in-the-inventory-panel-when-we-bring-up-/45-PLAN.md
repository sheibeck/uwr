---
phase: quick-45
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/InventoryPanel.vue
autonomous: true

must_haves:
  truths:
    - "Right-clicking an inventory item and selecting Delete shows a confirmation dialog before destroying the item"
    - "Cancelling the confirmation dialog does NOT delete the item"
    - "Confirming the dialog deletes the item as before"
  artifacts:
    - path: "src/components/InventoryPanel.vue"
      provides: "Delete confirmation in context menu"
      contains: "confirm"
  key_links:
    - from: "InventoryPanel.vue context menu Delete action"
      to: "emit('delete-item')"
      via: "window.confirm gate"
      pattern: "confirm.*Delete"
---

<objective>
Add a confirmation dialog before deleting inventory items from the context menu.

Purpose: Prevent accidental item deletion -- currently right-click > Delete immediately destroys the item with no confirmation, which can be frustrating for valuable items.
Output: Updated InventoryPanel.vue with confirm() guard on the Delete action.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/InventoryPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add confirmation dialog to Delete context menu action</name>
  <files>src/components/InventoryPanel.vue</files>
  <action>
In the `openItemContextMenu` function (line ~210), the Delete menu item currently fires the emit immediately:

```typescript
items.push({ label: 'Delete', action: () => emit('delete-item', item.id) });
```

Wrap the emit in a `window.confirm()` call that includes the item name and quantity (if stacked) so the user knows what they are about to destroy. Pattern follows the existing Split action which already uses `window.prompt()` for user input:

```typescript
items.push({
  label: 'Delete',
  action: () => {
    const desc = item.stackable && item.quantity > 1n
      ? `${item.name} x${item.quantity}`
      : item.name;
    if (window.confirm(`Delete ${desc}? This cannot be undone.`)) {
      emit('delete-item', item.id);
    }
  },
});
```

This is a purely client-side change. No backend or bindings changes needed.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` to confirm no type errors.
2. Manual test: right-click an inventory item, click Delete, verify a browser confirm dialog appears.
3. Click Cancel -- item remains in inventory.
4. Click OK -- item is deleted as before.
  </verify>
  <done>
Clicking Delete in the inventory context menu shows a confirmation dialog with the item name (and quantity for stacks). Cancelling preserves the item. Confirming deletes it.
  </done>
</task>

</tasks>

<verification>
- Right-click any inventory item: Delete option still appears in context menu
- Clicking Delete shows browser confirm dialog with item name
- Cancel leaves item untouched
- OK deletes the item
- Stacked items show "ItemName x3" format in the dialog
</verification>

<success_criteria>
- No item can be deleted from the inventory context menu without explicit user confirmation
- Confirmation message includes the item name and stack quantity
- No regressions to other context menu actions (Equip, Use, Eat, Split)
</success_criteria>

<output>
After completion, create `.planning/quick/45-in-the-inventory-panel-when-we-bring-up-/45-SUMMARY.md`
</output>
