---
phase: 034-narrative-ui-integration
plan: "02"
subsystem: narrative-ui
tags: [hotbar, multi-hotbar, schema-change, tdd]
dependency_graph:
  requires: [034-01]
  provides: [hotbar-parent-table, create-hotbar-reducer, switch-hotbar-reducer, swap-hotbar-slots-reducer, hotbar-intent-commands]
  affects: [spacetimedb/src/schema/tables.ts, spacetimedb/src/reducers/items.ts, spacetimedb/src/reducers/intent.ts, src/module_bindings/]
tech_stack:
  added: []
  patterns: [TDD red-green, inline helper logic in tests to avoid ESM protocol issues, ensureDefaultHotbar lazy creation pattern]
key_files:
  created:
    - spacetimedb/src/reducers/items.test.ts
    - src/module_bindings/hotbar_table.ts
    - src/module_bindings/create_hotbar_reducer.ts
    - src/module_bindings/switch_hotbar_reducer.ts
    - src/module_bindings/swap_hotbar_slots_reducer.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/intent.ts
    - src/module_bindings/hotbar_slot_table.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts
decisions:
  - "ensureDefaultHotbar creates 'main' hotbar lazily on first use — avoids requiring character creation to pre-populate hotbars"
  - "hotbar switch pattern uses negative lookahead /^hotbar\\s+(?!add\\s|set\\s|swap\\s)(.+)$/i to avoid conflicts with subcommands"
  - "set_hotbar_slot updated to use active hotbar via ensureDefaultHotbar and by_hotbar index instead of by_character"
  - "hotbar intent commands inline the logic directly (same as sell commands) rather than calling reducers via client"
metrics:
  duration: "5 minutes"
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_modified: 10
---

# Phase 034 Plan 02: Multiple Named Hotbars Summary

Added Hotbar parent table with CRUD reducers and full narrative intent command routing for managing up to 10 named hotbars per character.

## What Was Built

### Task 1: Hotbar table + HotbarSlot schema update

Added `Hotbar` parent table to `tables.ts` with `characterId`, `name`, `sortOrder`, `isActive`, `createdAt` columns and a `by_character` btree index. Updated `HotbarSlot` to include a `hotbarId` foreign key column and a `by_hotbar` btree index for efficient per-hotbar slot lookups. Added both tables to the `schema(...)` export. Published to local with `--clear-database` (required for schema changes).

### Task 2: Hotbar reducers, intent commands, tests, and bindings

**Reducers in items.ts:**

- `ensureDefaultHotbar(ctx, character)` — lazy helper that creates a "main" hotbar if none exists, returns the active one
- `create_hotbar` — validates max 10 per character, deactivates all existing, creates new with auto-assigned `sortOrder`
- `switch_hotbar` — case-insensitive name match, sets target `isActive=true`, all others `false`
- `swap_hotbar_slots` — operates on active hotbar; handles populated-to-populated, populated-to-empty, empty-to-populated, and empty-to-empty cases
- `set_hotbar_slot` — updated to use `ensureDefaultHotbar` and `by_hotbar` index instead of `by_character`

**Intent commands in intent.ts:**

Added a HOTBAR COMMANDS block after sell commands and before CAMP/REST:
- `hotbars` — lists all hotbars with slot contents (ability names via `ability_template` lookup)
- `hotbar` (bare) — shows active hotbar slots
- `hotbar add <name>` — creates named hotbar (max 10)
- `hotbar set <slot> <ability>` — assigns ability by partial name match to active hotbar slot
- `hotbar swap <slot1> <slot2>` — swaps slots on active hotbar
- `hotbar <name>` — switches active hotbar (negative lookahead prevents conflicts with subcommands)

Added hotbar entries to the help text.

**Tests (37 tests in items.test.ts):**

- `create_hotbar` logic: success, deactivation of existing, auto sortOrder, 10-limit rejection, exactly-10 allowed
- `switch_hotbar` logic: activation, deactivation of others, case-insensitivity, not-found error
- `swap_hotbar_slots` logic: two-slot swap, move to empty, empty no-op, no-hotbar error
- `ensureDefaultHotbar` helper: creates main, returns existing, no duplicates
- Intent routing patterns: hotbar add/set/swap/switch/bare, hotbars, negative lookahead disambiguation

**Client bindings regenerated** via `spacetime generate`.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- [x] `spacetimedb/src/schema/tables.ts` — Hotbar table + updated HotbarSlot
- [x] `spacetimedb/src/reducers/items.ts` — create_hotbar, switch_hotbar, swap_hotbar_slots, updated set_hotbar_slot
- [x] `spacetimedb/src/reducers/intent.ts` — hotbar command block + help text
- [x] `spacetimedb/src/reducers/items.test.ts` — 37 tests, all passing
- [x] `src/module_bindings/hotbar_table.ts` — generated
- [x] `src/module_bindings/create_hotbar_reducer.ts` — generated
- [x] `src/module_bindings/switch_hotbar_reducer.ts` — generated
- [x] `src/module_bindings/swap_hotbar_slots_reducer.ts` — generated

Commits:
- fb39f6f: feat(034-02): add Hotbar parent table and hotbarId column to HotbarSlot
- aa34320: test(034-02): add hotbar reducer and intent pattern tests
- 703f4e6: feat(034-02): add hotbar CRUD reducers, intent commands, and regenerate bindings
