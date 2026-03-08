---
phase: quick-356
plan: 01
subsystem: narrative-commands
tags: [inventory, backpack, narrative, bracket-links, click-routing]
key-files:
  modified:
    - spacetimedb/src/reducers/intent.ts
    - src/App.vue
decisions:
  - Used 'look' event kind for both inventory and backpack (matches location look styling)
  - Skipped hotbar option per user request (deferred to next task)
metrics:
  duration: 3min
  completed: "2026-03-08T17:01:00Z"
---

# Quick Task 356: Narrative Inventory and Backpack Commands Summary

Rich narrative inventory/backpack commands with rarity-colored bracket links and click-to-act item management.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Server-side inventory and backpack narrative commands | 5271f0e | spacetimedb/src/reducers/intent.ts |
| 2 | Client-side click routing for inventory/backpack bracket links | baf4ee0 | src/App.vue |

## What Was Built

### Task 1: Server-side Commands
- `inventory` / `inv` / `i` -- Shows all 12 equipment slots (Head through Off Hand) with:
  - Rarity-colored bracket-link item names (common=#ffffff, uncommon=#22c55e, rare=#3b82f6, epic=#aa44ff, legendary=#ff8800)
  - Stat summaries (STR, DEX, INT, WIS, CHA, HP, Mana, AC, MR, weapon damage)
  - Empty slot indicators
  - Gold amount footer
- `backpack` / `bp` / `bag` -- Shows unequipped items with:
  - Rarity-colored bracket-link names
  - Slot type, stats, quantity for stacks
  - Item descriptions when available
  - Sorted by rarity (legendary first) then alphabetically
  - Item count header (N/50)
- Both use `appendPrivateEvent` with kind `'look'` for consistent styling
- Added inventory/backpack to help command text

### Task 2: Client-side Click Routing
- Clicking equipped item name -> shows unequip confirmation with clickable `[Unequip ItemName]` link
- Clicking backpack item name -> shows context-aware options:
  - `[Equip ItemName]` if item is equipable
  - `[Bank ItemName]` only if a banker NPC is at the current location
  - `[Use ItemName]` if item is usable or eatable
- Action keyword execution:
  - "Unequip X" -> calls `unequipItem(slot)`
  - "Equip X" -> calls `equipItem(instanceId)`
  - "Bank X" -> calls `depositToBank(instanceId)`
  - "Use X" -> calls `useItem(instanceId)` or `eatFood(instanceId)` based on type
- Hotbar option intentionally skipped per user request

## Deviations from Plan

### Intentional Omissions
- **Hotbar option skipped** per user constraint: "Skip hotbar management entirely. Do NOT implement the 'add to hotbar' option."

## Self-Check: PASSED

- Commit 5271f0e: FOUND
- Commit baf4ee0: FOUND
- spacetimedb/src/reducers/intent.ts: FOUND
- src/App.vue: FOUND
