---
phase: quick-23
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/InventoryPanel.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Backpack displays a 5-column grid of slots showing all 20 bag positions"
    - "Empty bag slots are visually distinct (darker/dimmed placeholder squares)"
    - "Filled slots show item name with rarity color and stack count"
    - "Right-clicking a filled bag slot opens a context menu with item actions (Equip/Use/Eat/Delete)"
    - "Long item names wrap properly within grid cells instead of overflowing"
    - "Capacity is visually obvious from filled vs empty slots"
  artifacts:
    - path: "src/components/InventoryPanel.vue"
      provides: "Grid-based bag UI with context menus"
    - path: "src/ui/styles.ts"
      provides: "Bag grid slot styles"
  key_links:
    - from: "src/components/InventoryPanel.vue"
      to: "src/components/ContextMenu.vue"
      via: "ContextMenu component for right-click actions"
      pattern: "ContextMenu"
---

<objective>
Redesign the inventory panel's backpack section from a list layout to a grid-based RPG bag with visible slot squares, right-click context menus for item actions, and proper text wrapping.

Purpose: Give the inventory a traditional RPG bag feel where players can see capacity at a glance (filled vs empty squares) and interact via right-click menus matching the LocationGrid pattern.
Output: Updated InventoryPanel.vue with grid bag slots and ContextMenu integration, plus new styles in styles.ts.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/InventoryPanel.vue
@src/components/LocationGrid.vue
@src/components/ContextMenu.vue
@src/composables/useInventory.ts
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add bag grid styles to styles.ts</name>
  <files>src/ui/styles.ts</files>
  <action>
Add the following new style entries to the styles object in `src/ui/styles.ts`, before the closing `} as const`:

1. `bagGrid` — CSS Grid container for the bag slots:
   - `display: 'grid'`
   - `gridTemplateColumns: 'repeat(5, 1fr)'` (5 columns)
   - `gap: '0.35rem'`

2. `bagSlot` — Base style for each bag cell (both empty and filled):
   - `aspectRatio: '1'` (square cells)
   - `borderRadius: '8px'`
   - `border: '1px solid rgba(255,255,255,0.08)'`
   - `background: 'rgba(16, 20, 28, 0.5)'`
   - `display: 'flex'`
   - `flexDirection: 'column'`
   - `alignItems: 'center'`
   - `justifyContent: 'center'`
   - `padding: '0.25rem'`
   - `overflow: 'hidden'`
   - `position: 'relative'`
   - `userSelect: 'none'`

3. `bagSlotFilled` — Override for slots containing an item:
   - `border: '1px solid rgba(76, 125, 240, 0.25)'`
   - `background: 'rgba(76, 125, 240, 0.08)'`
   - `cursor: 'pointer'`

4. `bagSlotName` — Item name text inside a filled slot:
   - `fontSize: '0.65rem'`
   - `textAlign: 'center'`
   - `lineHeight: '1.2'`
   - `wordBreak: 'break-word'` (fixes text wrapping for long names)
   - `overflowWrap: 'break-word'`
   - `maxWidth: '100%'`

5. `bagSlotQuantity` — Stack count badge:
   - `position: 'absolute'`
   - `bottom: '2px'`
   - `right: '4px'`
   - `fontSize: '0.6rem'`
   - `color: 'rgba(230,232,239,0.8)'`
   - `background: 'rgba(0,0,0,0.6)'`
   - `borderRadius: '3px'`
   - `padding: '0 3px'`

6. `bagSlotSlotLabel` — Tiny slot-type label at top of filled cells:
   - `fontSize: '0.5rem'`
   - `textTransform: 'uppercase'`
   - `letterSpacing: '0.05em'`
   - `color: 'rgba(230,232,239,0.4)'`
   - `marginBottom: '0.1rem'`

Also fix the existing `equipmentSlotName` style to ensure text wrapping on the equipment side by adding:
- `wordBreak: 'break-word'`
- `overflowWrap: 'break-word'`
  </action>
  <verify>Check that `styles.ts` compiles without TypeScript errors by running `npx vue-tsc --noEmit` or verifying no red squiggles. Confirm the 6 new style keys and the equipmentSlotName fix are present.</verify>
  <done>Six new bag-related style entries exist in styles.ts (bagGrid, bagSlot, bagSlotFilled, bagSlotName, bagSlotQuantity, bagSlotSlotLabel) and equipmentSlotName has word-break properties.</done>
</task>

<task type="auto">
  <name>Task 2: Redesign InventoryPanel backpack to grid bag with context menus</name>
  <files>src/components/InventoryPanel.vue</files>
  <action>
Rewrite the backpack section of InventoryPanel.vue (the `inventoryColumnWide` div, lines 39-97) to use a grid-based bag layout with right-click context menus. Keep the equipment column (left side) unchanged.

**Import ContextMenu component:**
Add `import ContextMenu from './ContextMenu.vue';` and `import { ref, computed } from 'vue';` at the top of the script section.

**Add context menu state** (same pattern as LocationGrid.vue):
```typescript
const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  title: string;
  subtitle: string;
  items: Array<{ label: string; disabled?: boolean; action: () => void }>;
}>({
  visible: false, x: 0, y: 0, title: '', subtitle: '', items: [],
});

const closeContextMenu = () => { contextMenu.value.visible = false; };
```

**Add helper to open context menu on right-click of a filled bag slot:**
```typescript
const openItemContextMenu = (event: MouseEvent, item: typeof props.inventoryItems[0]) => {
  const items: Array<{ label: string; disabled?: boolean; action: () => void }> = [];
  if (item.equipable) {
    items.push({ label: 'Equip', disabled: props.combatLocked, action: () => emit('equip', item.id) });
  }
  if (item.usable) {
    items.push({ label: 'Use', action: () => emit('use-item', item.id) });
  }
  if (item.eatable) {
    items.push({ label: 'Eat', action: () => emit('eat-food', item.id) });
  }
  items.push({ label: 'Delete', action: () => emit('delete-item', item.id) });
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    title: item.name,
    subtitle: `${item.rarity} ${item.slot}`,
    items,
  };
};
```

**Compute padded bag slots** (fill empty positions up to maxInventorySlots):
```typescript
const bagSlots = computed(() => {
  const slots: Array<typeof props.inventoryItems[0] | null> = [];
  for (const item of props.inventoryItems) {
    slots.push(item);
  }
  while (slots.length < props.maxInventorySlots) {
    slots.push(null);
  }
  return slots;
});
```

**Replace the backpack template section.** The `inventoryColumnWide` div should now contain:

1. The existing header row (Backpack title + gold display) — keep as-is.
2. The slots count line (keep as-is but change from `styles.subtle` to also showing as text above the grid).
3. Replace the `<ul>` / "No items" block with:

```html
<div :style="styles.bagGrid">
  <div
    v-for="(slot, idx) in bagSlots"
    :key="idx"
    :style="slot ? { ...styles.bagSlot, ...styles.bagSlotFilled } : styles.bagSlot"
    @contextmenu.prevent="slot && openItemContextMenu($event, slot)"
    @mouseenter="slot && $emit('show-tooltip', { item: slot, x: $event.clientX, y: $event.clientY })"
    @mousemove="slot && $emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
    @mouseleave="slot && $emit('hide-tooltip')"
  >
    <template v-if="slot">
      <div :style="styles.bagSlotSlotLabel">{{ slot.slot }}</div>
      <div :style="[styles.bagSlotName, rarityStyle(slot.rarity)]">{{ slot.name }}</div>
      <span v-if="slot.stackable && slot.quantity > 1n" :style="styles.bagSlotQuantity">
        x{{ slot.quantity }}
      </span>
    </template>
  </div>
</div>
```

4. Add the ContextMenu component at the end of the template (before the closing `</div>` of `panelSplit`):

```html
<ContextMenu
  :visible="contextMenu.visible"
  :x="contextMenu.x"
  :y="contextMenu.y"
  :title="contextMenu.title"
  :subtitle="contextMenu.subtitle"
  :items="contextMenu.items"
  :styles="styles"
  @close="closeContextMenu"
/>
```

**Update the emit declaration** to use `const emit = defineEmits<...>()` (assign to variable) so it can be referenced in `openItemContextMenu`. The existing `defineEmits` call on line 162 is not assigned — change to `const emit = defineEmits<...>()`.

**Do NOT change:** The equipment column (left side), the props interface, or the emit types. All existing events remain the same — they are just triggered from context menu actions instead of inline buttons.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` to verify no TypeScript errors.
2. Visual check: Open the inventory panel in-game. Confirm 5-column grid of squares is visible, filled slots show colored item names, empty slots appear as dim squares.
3. Right-click a filled slot — context menu appears with appropriate actions (Equip for equipment, Use for consumables, Eat for food, Delete for all).
4. Hover over filled slot — tooltip still appears.
5. Long item names wrap within their grid cell instead of overflowing.
  </verify>
  <done>Backpack section displays as a 5x4 grid of bag slots. Filled slots show rarity-colored item names with right-click context menus for actions. Empty slots are visually distinct dim squares. Text wraps properly. All existing functionality (equip, use, eat, delete, tooltips) preserved via context menu and hover events.</done>
</task>

</tasks>

<verification>
- Inventory panel shows equipment grid (unchanged) on left, bag grid on right
- Bag grid has 20 squares in 5 columns
- Items appear in rarity-colored text within filled squares
- Empty squares are dimmed/darker
- Right-click on item opens context menu with Equip/Use/Eat/Delete as appropriate
- Tooltips still work on hover
- Long item names wrap within cells
- Stack quantities show as badge overlay
- Gold display and slot count still visible
</verification>

<success_criteria>
- Grid-based bag with 5 columns and visual empty slots replaces the list
- Context menus provide all item actions previously handled by inline buttons
- Text wrapping works for long item names in both equipment and bag slots
- No regressions in equip/unequip/use/eat/delete functionality
</success_criteria>

<output>
After completion, create `.planning/quick/23-redesign-inventory-panel-grid-based-bag-/23-SUMMARY.md`
</output>
