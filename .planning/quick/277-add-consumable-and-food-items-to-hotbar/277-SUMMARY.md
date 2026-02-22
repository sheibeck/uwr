---
phase: quick-277
plan: "01"
subsystem: inventory-hotbar
tags: [hotbar, inventory, consumables, food, ux]
dependency_graph:
  requires: []
  provides: [item-hotbar-slots]
  affects: [useHotbar, useInventory, InventoryPanel, CharacterInfoPanel, App]
tech_stack:
  added: []
  patterns: [item-prefix-key, context-menu-emit]
key_files:
  created: []
  modified:
    - src/composables/useHotbar.ts
    - src/composables/useInventory.ts
    - src/components/InventoryPanel.vue
    - src/components/CharacterInfoPanel.vue
    - src/App.vue
    - src/ui/styles.ts
key_decisions:
  - "Item slots use abilityKey prefix 'item:<templateId>' to distinguish from ability keys"
  - "Count is summed across all matching inventory instances (supports stacked items)"
  - "Slot assignment uses window.prompt for simplicity, no custom UI needed"
  - "eatFood uses existing eatFoodFn from App.vue rather than duplicating the reducer call"
metrics:
  duration: "~30 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  files_changed: 6
---

# Phase quick-277 Plan 01: Add Consumable and Food Items to Hotbar Summary

Consumable and food items can now be assigned to hotbar slots via right-click context menu. Slots show item name and remaining quantity count, and activating a slot calls the correct reducer (use_item or eat_food) for the first matching inventory instance.

## What Was Built

Item slots in the hotbar use the key prefix convention `item:<templateId>` stored in the HotbarSlot row's `abilityKey` column. This distinguishes item slots from ability slots at a glance and requires no schema changes.

### useHotbar.ts

Added `InventoryItemRef` type and two new optional args to `UseHotbarArgs`:
- `inventoryItems?: Ref<InventoryItemRef[]>` — provides live item counts
- `eatFoodFn?: (itemInstanceId: bigint) => void` — callback for food items

`HotbarDisplaySlot` gains two optional fields:
- `itemCount?: number` — total quantity of that item across all instances
- `itemTemplateId?: bigint | null` — the parsed template ID

`hotbarAssignments` resolves item names from `inventoryItems` for `item:` prefixed keys.

`hotbarDisplay` sets `kind: 'item'`, zeroes out cooldown fields, and populates `itemCount` and `itemTemplateId`.

`onHotbarClick` handles `item:` prefixed keys: finds the first inventory instance with quantity > 0, calls `eat_food` for food items or `conn.reducers.useItem` for consumables, and shows the pulse animation.

### useInventory.ts

Added `templateId: bigint` to the `InventoryItem` type and the `.map()` return object. This exposes `instance.templateId` so it flows through to the hotbar.

### InventoryPanel.vue

- Added `templateId: bigint` to the `inventoryItems` prop type
- Added `add-to-hotbar` emit definition
- Added "Add to Hotbar" context menu option for items where `item.usable || item.eatable`

### CharacterInfoPanel.vue

- Added `add-to-hotbar` emit definition
- Passes `@add-to-hotbar` event through from `InventoryPanel` to parent

### App.vue

- Moved `eatFoodReducer` / `eatFood` before `useHotbar` call to avoid use-before-declaration
- Added `inventoryItems` and `eatFoodFn: eatFood` to the `useHotbar()` call
- Added `onAddItemToHotbar(templateId, itemName)` — prompts player for slot number (1-10) and calls `setHotbarSlot`
- Added `@add-to-hotbar="onAddItemToHotbar"` on `CharacterInfoPanel`
- Hotbar button now shows `<span v-if="slot.kind === 'item' && slot.itemCount != null">x{{ slot.itemCount }}</span>`
- Slot is disabled when `slot.kind === 'item' && itemCount === 0`

### styles.ts

Added `hotbarSlotCount` style for the item count badge.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] src/composables/useHotbar.ts modified with item-slot support
- [x] src/composables/useInventory.ts exposes templateId
- [x] src/components/InventoryPanel.vue adds "Add to Hotbar" context menu
- [x] src/components/CharacterInfoPanel.vue passes add-to-hotbar through
- [x] src/App.vue wired — eatFood moved before useHotbar, onAddItemToHotbar added
- [x] src/ui/styles.ts has hotbarSlotCount

Commits:
- bf8b889: feat(quick-277): add item-slot support to useHotbar
- c7238bd: feat(quick-277): wire inventory items to hotbar and add context menu option
