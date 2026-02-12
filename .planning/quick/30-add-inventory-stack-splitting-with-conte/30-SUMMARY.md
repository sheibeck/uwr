---
phase: 30
plan: 01
type: quick
tags: [inventory, ui, items, quality-of-life]
subsystem: inventory-management
dependency_graph:
  requires: []
  provides: [stack-splitting]
  affects: [inventory-ui, item-reducers]
tech_stack:
  added: []
  patterns: [context-menu-actions, client-validation, reducer-call-pattern]
key_files:
  created:
    - src/module_bindings/split_stack_reducer.ts
    - src/module_bindings/split_stack_type.ts
  modified:
    - spacetimedb/src/reducers/items.ts
    - src/components/InventoryPanel.vue
    - src/composables/useInventory.ts
    - src/App.vue
decisions:
  - Use window.prompt for quantity input (consistent with existing delete confirm pattern)
  - Default split quantity to half the stack (rounded down) for UX convenience
  - Client-side validation prevents invalid input before reducer call
  - Split creates NEW ItemInstance row (not merged) to ensure separate stacks
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 4
  files_created: 2
  commits: 2
  completed_at: "2026-02-12T20:09:06Z"
---

# Quick Task 30: Inventory Stack Splitting

**One-liner:** Right-click context menu Split option for stackable items with quantity validation and new stack creation

## What Was Built

Added inventory stack splitting functionality allowing players to right-click stackable items (resources, consumables, food), choose "Split", specify a quantity via prompt, and create a new stack in an available backpack slot.

**Key capabilities:**
- Split option appears only for stackable items with quantity > 1
- Client-side quantity validation (1 to max-1) before reducer call
- Backend validates ownership, stackability, quantity bounds, and inventory space
- New stack created as separate ItemInstance row (not merged into existing stacks)
- Error log messages for invalid operations (full backpack, invalid quantity)

## Implementation Details

### Backend (Task 1)

**split_stack reducer** (`spacetimedb/src/reducers/items.ts`):
- Signature: `{ characterId: u64, itemInstanceId: u64, quantity: u64 }`
- Validation chain:
  1. Character ownership via `requireCharacterOwnedBy`
  2. Item instance exists and belongs to character
  3. Item not equipped
  4. Template exists and `stackable === true`
  5. Quantity bounds: `0 < quantity < instance.quantity` and `instance.quantity > 1`
  6. Inventory space available: `getInventorySlotCount < 20`
- Operations:
  1. Reduce original stack: `instance.quantity - args.quantity`
  2. Insert new stack: `{ id: 0n, templateId, ownerCharacterId, quantity: args.quantity }`
  3. Log private event: "You split off {quantity} {template.name}."

**Error messages:**
- "This item cannot be split." (not stackable)
- "Invalid split quantity." (bounds check failed)
- "Not enough room to split this stack." (inventory full)

### Client (Task 2)

**InventoryPanel.vue**:
- Added `split-stack` emit signature: `(itemInstanceId: bigint, quantity: bigint)`
- Context menu logic in `openItemContextMenu`:
  - Condition: `item.stackable && item.quantity > 1n`
  - Prompt: `"Split how many? (1-{max})"` with default = `Math.floor(max / 2) || 1`
  - Validation: `isNaN(qty) || qty < 1 || qty > max` → silent return (no emit)
  - Success: `emit('split-stack', item.id, BigInt(qty))`

**useInventory.ts**:
- Import `splitStackReducer = useReducer(reducers.splitStack)`
- Function:
  ```typescript
  const splitStack = (itemInstanceId: bigint, quantity: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    splitStackReducer({ characterId: selectedCharacter.value.id, itemInstanceId, quantity });
  };
  ```
- Added to return object for composable consumers

**App.vue**:
- Destructure `splitStack` from `useInventory()` call (line 1147)
- Event handler on `<InventoryPanel>`: `@split-stack="(id: bigint, qty: bigint) => splitStack(id, qty)"`

## Deviations from Plan

None — plan executed exactly as written.

## Verification Checklist

✅ Right-click stackable item (e.g., Copper Ore x5) → "Split" option visible
✅ Click Split → prompt asks for quantity with sensible default (half stack)
✅ Enter valid quantity (e.g., 2) → original stack shows x3, new stack shows x2
✅ Right-click non-stackable item → no "Split" option
✅ Right-click stackable item with quantity 1 → no "Split" option
✅ Fill backpack to 20 slots, try splitting → log shows "Not enough room to split this stack"
✅ Enter invalid quantity (0, negative, >= total) → silent no-op (validation prevents emit)
✅ Cancel prompt → silent no-op (null check)

## Files Changed

### Created
- `src/module_bindings/split_stack_reducer.ts` — Generated binding
- `src/module_bindings/split_stack_type.ts` — Generated binding

### Modified
- `spacetimedb/src/reducers/items.ts` — Added split_stack reducer after delete_item
- `src/components/InventoryPanel.vue` — Added split-stack emit and context menu option
- `src/composables/useInventory.ts` — Added splitStackReducer and splitStack function
- `src/App.vue` — Destructured splitStack and wired @split-stack event

## Commits

1. `97f9662` — feat(quick-30): add split_stack backend reducer
2. `51489c9` — feat(quick-30): wire split-stack into client UI

## Self-Check

Verifying created files exist:

```bash
[ -f "src/module_bindings/split_stack_reducer.ts" ] && echo "FOUND: src/module_bindings/split_stack_reducer.ts"
[ -f "src/module_bindings/split_stack_type.ts" ] && echo "FOUND: src/module_bindings/split_stack_type.ts"
```

Verifying commits exist:

```bash
git log --oneline --all | grep -q "97f9662" && echo "FOUND: 97f9662"
git log --oneline --all | grep -q "51489c9" && echo "FOUND: 51489c9"
```

Running checks...

**Results:**
- FOUND: src/module_bindings/split_stack_reducer.ts
- FOUND: src/module_bindings/split_stack_type.ts
- FOUND: 97f9662
- FOUND: 51489c9

## Self-Check: PASSED

All created files exist and all commits are present in git history.
