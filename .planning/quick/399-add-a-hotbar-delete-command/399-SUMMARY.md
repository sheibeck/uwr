---
phase: quick-399
plan: 01
subsystem: hotbar
tags: [hotbar, intent, reducer, client]
dependency_graph:
  requires: [hotbar CRUD (create, switch, swap already existed)]
  provides: [delete_hotbar reducer, hotbar delete intent command, deleteHotbar client function]
  affects: [spacetimedb/src/reducers/items.ts, spacetimedb/src/reducers/intent.ts, src/composables/useHotbar.ts]
tech_stack:
  added: []
  patterns: [TDD inline helper, intent command handler, useReducer composable pattern]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/items.test.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/intent.ts
    - src/composables/useHotbar.ts
decisions:
  - "Inline deleteHotbar helper in test file mirrors exact production logic for pure unit testing without SpacetimeDB imports"
  - "Bad-args catch for bare 'hotbar delete' placed after the full match check to avoid shadowing"
  - "Switch regex negative lookahead updated from clear|b to clear|b|delete|s to prevent 'hotbar delete X' being caught as a switch"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-03-10"
  tasks_completed: 1
  files_changed: 4
---

# Quick Task 399: Add Hotbar Delete Command Summary

**One-liner:** `hotbar delete <name>` command with guard against deleting last hotbar and auto-switch when active hotbar is deleted.

## What Was Built

Completed the hotbar CRUD by adding the missing delete operation:

- **`delete_hotbar` reducer** (`items.ts`): Finds hotbar by case-insensitive name, rejects if it's the last hotbar, deletes all `hotbar_slot` rows for that hotbar, deletes the hotbar row, and if the deleted hotbar was active, promotes the first remaining hotbar to active.

- **Intent command handler** (`intent.ts`): `hotbar delete <name>` is parsed before the generic switch pattern. Includes fail-fast guards (not found, only hotbar), success color feedback, and a bad-args catch for bare `hotbar delete`.

- **Switch regex update** (`intent.ts`): Negative lookahead updated from `(?!add\s|set\b|swap\b|clear\b)` to `(?!add\s|set\b|swap\b|clear\b|delete\s)` so `hotbar delete X` is no longer caught as a switch command.

- **Help text** (`intent.ts`): `hotbar delete {name}` line added after `hotbar add` in the help output.

- **Client wiring** (`useHotbar.ts`): `deleteHotbarReducer` registered, `deleteHotbar(hotbarName)` function added and exposed in the return object.

## Tests

10 new tests added (TDD approach):

- `delete_hotbar logic` describe block (5 tests): removes hotbar + slots, error on not-found, error on last hotbar, auto-switch on active delete, case-insensitive matching
- `hotbar delete <name> pattern` describe block (4 tests): matches with name, multi-word name, rejects bare command, case-insensitive
- Switch pattern exclusion test (1 test): `hotbar delete buffs` does not match switch pattern

All 47 tests pass.

## Commits

| Hash | Message |
|------|---------|
| dbb5358 | test(quick-399): add failing tests for delete_hotbar logic and intent pattern |
| 0c2c6b5 | feat(quick-399): add hotbar delete command, reducer, and client wiring |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- spacetimedb/src/reducers/items.ts contains `delete_hotbar` at line 676
- spacetimedb/src/reducers/intent.ts contains `hotbar delete` handler at line 1142, help text at line 80, bad-args catch at line 1272
- src/composables/useHotbar.ts exposes `deleteHotbar` in return object at line 535
- All 47 tests pass
- Commits dbb5358 and 0c2c6b5 exist
