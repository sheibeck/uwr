---
phase: quick-134
plan: 01
subsystem: backend-loot
tags: [loot, items, starter-gear, combat, reducers]
dependency_graph:
  requires: []
  provides: [starter-item-filter-single-source-of-truth]
  affects: [create_test_item, generateLootTemplates, ensureLootTables, ensureVendorInventory]
tech_stack:
  added: []
  patterns: [shared-constant-export, runtime-filter-at-pick-time]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/combat_constants.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - STARTER_ITEM_NAMES moved from ensure_enemies.ts local const to exported const in combat_constants.ts for single source of truth across all three consumers
metrics:
  duration: 4min
  completed: 2026-02-17T13:42:07Z
  tasks: 2
  files: 4
---

# Phase quick-134 Plan 01: Fix create_test_item and Loot Gear Filter Summary

**One-liner:** STARTER_ITEM_NAMES centralized in combat_constants.ts; create_test_item and generateLootTemplates now filter starter gear at runtime so players never receive Training Sword/Apprentice Robe from /createitem or combat kills.

## What Was Built

### Problem

The `create_test_item` reducer (used by `/createitem <quality>`) iterated all item templates to find a match for a given slot without excluding starter gear. Similarly, `generateLootTemplates` in combat.ts filtered gear entries by `!isJunk` but did not exclude starter items. As a result, players could receive Training Sword, Apprentice Robe, etc. from both sources.

`STARTER_ITEM_NAMES` already existed as a local `const` inside `ensure_enemies.ts` (used by `ensureLootTables` and `ensureVendorInventory`). It was not accessible to the reducers.

### Solution

1. **Moved STARTER_ITEM_NAMES to combat_constants.ts** — exported as a shared constant so any module can import it without circular deps.

2. **Updated ensure_enemies.ts** — removed local definition, added `import { STARTER_ITEM_NAMES } from '../data/combat_constants'`. Existing usage in `ensureLootTables` and `ensureVendorInventory` preserved identically.

3. **Updated commands.ts** — added import, added `!STARTER_ITEM_NAMES.has(tmpl.name)` to both the primary slot loop and the fallback loop in `create_test_item`.

4. **Updated combat.ts** — added import, added `!STARTER_ITEM_NAMES.has(template.name)` to `gearEntries` filter in `generateLootTemplates`.

5. **Published module** — `spacetime publish uwr-game --project-path spacetimedb` succeeded with no TypeScript errors or runtime panics.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Move STARTER_ITEM_NAMES to combat_constants.ts | 32d1cfc | combat_constants.ts, ensure_enemies.ts |
| 2 | Filter starter items in create_test_item and generateLootTemplates, publish | 32b89a0 | commands.ts, combat.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/data/combat_constants.ts` — FOUND, contains `export const STARTER_ITEM_NAMES`
- `spacetimedb/src/seeding/ensure_enemies.ts` — FOUND, imports from `../data/combat_constants`, no local definition
- `spacetimedb/src/reducers/commands.ts` — FOUND, imports STARTER_ITEM_NAMES, filters in both loops
- `spacetimedb/src/reducers/combat.ts` — FOUND, imports STARTER_ITEM_NAMES, filters gearEntries
- Commit 32d1cfc — FOUND
- Commit 32b89a0 — FOUND
- Module published successfully to uwr-game
