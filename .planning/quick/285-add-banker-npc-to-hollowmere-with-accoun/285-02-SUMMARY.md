---
phase: 285-bank
plan: "02"
subsystem: client-ui
tags: [bank, inventory, npc, context-menu, panel]
dependency_graph:
  requires: [285-01]
  provides: [bank-panel-ui, bank-npc-context-menu, deposit-withdraw-flow]
  affects: [LocationGrid, InventoryPanel, CharacterInfoPanel, App]
tech_stack:
  added: []
  patterns: [floating-panel, bagGrid-slot-style, npc-context-menu-extend, prop-threading]
key_files:
  created:
    - src/components/BankPanel.vue
  modified:
    - src/composables/useGameData.ts
    - src/components/LocationGrid.vue
    - src/components/InventoryPanel.vue
    - src/components/CharacterInfoPanel.vue
    - src/App.vue
    - src/module_bindings/index.ts
    - src/module_bindings/bank_slot_table.ts (new untracked → committed)
    - src/module_bindings/bank_slot_type.ts (new untracked → committed)
    - src/module_bindings/my_bank_slots_table.ts (new untracked → committed)
    - src/module_bindings/my_bank_slots_type.ts (new untracked → committed)
    - src/module_bindings/deposit_to_bank_reducer.ts (new untracked → committed)
    - src/module_bindings/withdraw_from_bank_reducer.ts (new untracked → committed)
decisions:
  - "Used context-menu approach (not double-click) for deposit: avoids double-click conflict with equip/use"
  - "bankOpen prop threaded through CharacterInfoPanel → InventoryPanel to show Deposit to Bank option"
  - "BankPanel resolves items by building slot index map from bankSlots rows (0-39)"
  - "qualityBorderStyle uses instance.qualityTier falling back to template.rarity for display"
metrics:
  duration: "~25 minutes"
  completed: "2026-02-22"
  tasks_completed: 2
  files_changed: 12
---

# Phase 285 Plan 02: Bank Panel UI Summary

BankPanel UI component + NPC context menu + deposit/withdraw flow using same bagGrid/bagSlot visual style as InventoryPanel. Players right-click Thurwick (banker NPC) to open the vault, right-click inventory items (while bank is open) to deposit, and double-click bank items to withdraw.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Generate bindings + useGameData bankSlots | 497fa3c | useGameData.ts, module_bindings/* |
| 2 | BankPanel + LocationGrid + App wiring | 0004b63 | BankPanel.vue, LocationGrid.vue, InventoryPanel.vue, CharacterInfoPanel.vue, App.vue |

## What Was Built

### BankPanel.vue
- 40-slot grid using exact `bagGrid` / `bagSlot` / `bagSlotFilled` styles from InventoryPanel
- Resolves each slot by building an index map (slot 0-39) from `bankSlots` rows, then looking up ItemInstance and ItemTemplate
- Shows item name (with displayName override), slot type label, quantity for stacks
- Quality border and rarity color matching InventoryPanel
- Double-click on filled slot: emits `withdraw` with bankSlotId
- Right-click context menu: "Withdraw" option
- Header shows "Bank Vault — X / 40 slots"

### LocationGrid.vue
- Added `open-bank` emit to defineEmits
- In `openNpcContextMenu`: after vendor check, `npc.npcType === 'banker'` block pushes "Access Bank" item that emits `open-bank`

### InventoryPanel.vue
- Added `bankOpen?: boolean` prop
- Added `deposit-to-bank` emit
- In `openItemContextMenu`: when `props.bankOpen` is true, prepends "Deposit to Bank" option that emits `deposit-to-bank` with item.id

### CharacterInfoPanel.vue
- Added `bankOpen?: boolean` prop (passed through to InventoryPanel via `:bank-open="bankOpen"`)
- Added `deposit-to-bank` event (bubbled up from InventoryPanel via `@deposit-to-bank="$emit('deposit-to-bank', $event)"`)

### App.vue
- Imports `BankPanel`
- Destructures `bankSlots` from `useGameData()`
- `openBank(_npcId)`: calls `openPanel('bank')`
- `depositToBank(instanceId)`: calls `window.__db_conn?.reducers.depositToBank({ characterId, instanceId })`
- `withdrawFromBank(bankSlotId)`: calls `window.__db_conn?.reducers.withdrawFromBank({ characterId, bankSlotId })`
- LocationGrid gets `@open-bank="openBank"`
- CharacterInfoPanel gets `:bank-open="panels.bank?.open ?? false"` and `@deposit-to-bank="depositToBank"`
- Bank panel div in floating panel system (wide, with drag/resize handles, close button)

## Deviations from Plan

None — plan executed as written. The context-menu approach for deposit (vs double-click) was the plan's recommended "simpler approach."

## Self-Check

- [x] `src/components/BankPanel.vue` exists
- [x] `src/composables/useGameData.ts` exports `bankSlots`
- [x] `src/components/LocationGrid.vue` has `open-bank` emit and banker check
- [x] `src/components/InventoryPanel.vue` has `bankOpen` prop and `deposit-to-bank` emit
- [x] `src/App.vue` has BankPanel import, openBank/depositToBank/withdrawFromBank functions, bank panel template
- [x] Commits 497fa3c and 0004b63 exist
- [x] No TypeScript errors in modified files (pre-existing errors in other composables are out of scope)

## Self-Check: PASSED
