---
phase: quick-290
plan: 01
subsystem: server-reducers
tags: [refactor, code-organization, reducers]
dependency-graph:
  requires: []
  provides: [items_crafting_reducers, items_gathering_reducers, items_trading_reducers]
  affects: [spacetimedb/src/reducers/index.ts]
tech-stack:
  added: []
  patterns: [deps-injection-register-pattern, single-concern-reducer-files]
key-files:
  created:
    - spacetimedb/src/reducers/items_crafting.ts
    - spacetimedb/src/reducers/items_gathering.ts
    - spacetimedb/src/reducers/items_trading.ts
  modified:
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/index.ts
decisions:
  - Keep use_item in items.ts since it interacts with consumable constants
  - Keep sync_* reducers in items.ts since they are content seeding not a separate domain
metrics:
  duration: 542s
  completed: 2026-02-23T17:09:00Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
---

# Quick Task 290: Split reducers/items.ts into cohesive files

Split the 1956-line monolithic items.ts reducer file into 4 cohesive files by extracting crafting, gathering, and trading domains, following the same deps-injection register pattern used by all other reducer files.

## One-liner

Crafting/gathering/trading reducers extracted into 3 new files; items.ts reduced from 1956 to 1082 lines with zero behavior changes.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extract crafting, gathering, and trading reducers | 78594c3 | items_crafting.ts, items_gathering.ts, items_trading.ts, items.ts |
| 2 | Update reducer index to register all 4 files | ea07e0c | index.ts |

## Changes Made

### items_crafting.ts (441 lines)
- `registerItemCraftingReducers(deps)` exporting:
  - `research_recipes` - auto-discover consumable recipes
  - `craft_recipe` - craft items with catalyst/modifier system
  - `learn_recipe_scroll` - learn gear recipes from scrolls
  - `salvage_item` - break down gear for materials and scroll drops
  - `statKeyToAffix` helper function

### items_gathering.ts (204 lines)
- `registerItemGatheringReducers(deps)` exporting:
  - `start_gather_resource` - begin gathering with aggro chance
  - `finish_gather` - complete gathering with perk bonuses
  - Gathering constants (RESOURCE_GATHER_CAST_MICROS, GATHER_AGGRO_*)

### items_trading.ts (282 lines)
- `registerItemTradingReducers(deps)` exporting:
  - `start_trade`, `add_trade_item`, `remove_trade_item`, `offer_trade`, `cancel_trade`
  - `findActiveTrade`, `inventoryHasSpaceForItems`, `finalizeTrade` helpers

### items.ts (1082 lines, down from 1956)
- Retains core inventory management: create/grant/buy/sell, equip/unequip, loot, hotbar, use_ability
- Retains consumable use_item reducer
- Retains all sync_* reducers for content seeding
- Removed unused imports (crafting_materials, combat_scaling, findItemTemplateByName)
- Trimmed deps destructuring (removed ScheduleAt, ResourceGatherTick, startCombatForSpawn, etc.)

### index.ts
- Added imports for all 3 new register functions
- Added registration calls after registerItemReducers(deps)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Module publishes successfully: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
- No errors in logs: `spacetime logs uwr`
- No reducer name duplicated across files
- No circular imports between reducer files
- All 4 registerXxxReducers functions registered in index.ts

## Self-Check: PASSED

All files exist. All commits verified.
