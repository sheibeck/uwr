---
phase: quick-187
plan: 01
subsystem: inventory
tags: [inventory, constants, refactor, capacity]
dependency_graph:
  requires: []
  provides: [MAX_INVENTORY_SLOTS constant, 50-slot backpack capacity]
  affects: [spacetimedb/src/helpers/items.ts, spacetimedb/src/reducers/items.ts, spacetimedb/src/reducers/commands.ts, spacetimedb/src/index.ts, src/composables/useInventory.ts]
tech_stack:
  added: []
  patterns: [centralized constant, single source of truth]
key_files:
  modified:
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/commands.ts
    - src/composables/useInventory.ts
decisions:
  - MAX_INVENTORY_SLOTS = 50 as the new backpack capacity
  - Client uses separate hardcoded constant (no server import path) changed to 50 in useInventory.ts
metrics:
  duration: ~3min
  completed: 2026-02-18
  tasks: 2
  files: 5
---

# Quick Task 187: Centralize MAX_INVENTORY_SLOTS = 50 Summary

**One-liner:** Centralized backpack capacity into `MAX_INVENTORY_SLOTS = 50` constant, replacing 7 server-side hardcoded `20`s and 1 client-side `20`.

## What Was Done

Eliminated the magic number `20` scattered across server reducers and the client composable. All backpack capacity checks now reference a single `MAX_INVENTORY_SLOTS` constant set to 50.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Centralize and export MAX_INVENTORY_SLOTS, replace all server hardcoded 20s | a60034f | helpers/items.ts, index.ts, reducers/items.ts, reducers/commands.ts |
| 2 | Update client maxInventorySlots to 50 | b34f6a9 | src/composables/useInventory.ts |

## Changes Made

### Server (Task 1)

**`spacetimedb/src/helpers/items.ts`**
- Changed `MAX_INVENTORY_SLOTS = 20` to `MAX_INVENTORY_SLOTS = 50`
- `hasInventorySpace()` was already using `MAX_INVENTORY_SLOTS` (line 346) — no change needed

**`spacetimedb/src/index.ts`**
- Added `MAX_INVENTORY_SLOTS` to import from `./helpers/items`
- Added `MAX_INVENTORY_SLOTS` to `reducerDeps` object passed to all reducers

**`spacetimedb/src/reducers/items.ts`**
- Added `MAX_INVENTORY_SLOTS` to destructured deps
- Replaced 5 hardcoded `>= 20` capacity checks:
  - `buy_item` reducer (line 153)
  - `take_loot` reducer (line 282)
  - `take_all_loot` loop (line 361)
  - `split_stack` reducer (line 516)
  - Trade space check `<= 20` (line 1490)

**`spacetimedb/src/reducers/commands.ts`**
- Added `MAX_INVENTORY_SLOTS` to destructured deps
- Replaced 2 hardcoded `>= 20` capacity checks:
  - `create_test_item` reducer (line 396)
  - `create_recipe_scroll` reducer (line 450)
- Updated comment from "max 20 non-equipped items" to "max non-equipped items"

### Client (Task 2)

**`src/composables/useInventory.ts`**
- Changed `maxInventorySlots: 20` to `maxInventorySlots: 50`
- InventoryPanel now shows "X / 50" and renders 50 slot placeholders

## Verification

```
grep -rn "MAX_INVENTORY_SLOTS" spacetimedb/src/
```
Result: 12 references — 1 definition (helpers/items.ts:330), 1 existing use (helpers/items.ts:346), 1 import (index.ts:107), 1 deps entry (index.ts:442), 1 deps destructure in items.ts, 5 uses in items.ts, 1 deps destructure in commands.ts, 2 uses in commands.ts.

```
grep -n "itemCount >= 20\|>= 20\|<= 20\|max 20" spacetimedb/src/reducers/items.ts spacetimedb/src/reducers/commands.ts
```
Result: zero matches — no remaining hardcoded inventory capacity 20s.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/helpers/items.ts:330: export const MAX_INVENTORY_SLOTS = 50;` — FOUND
- `src/composables/useInventory.ts:387: maxInventorySlots: 50,` — FOUND
- Commit a60034f — FOUND
- Commit b34f6a9 — FOUND
