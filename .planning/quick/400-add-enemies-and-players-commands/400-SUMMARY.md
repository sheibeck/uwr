---
phase: quick-400
plan: 01
subsystem: narrative-input
tags: [commands, combat, players, intent]
dependency_graph:
  requires: []
  provides: [enemies-command, players-command]
  affects: [spacetimedb/src/reducers/intent.ts]
tech_stack:
  added: []
  patterns: [con-color-logic, enemy-spawn-query, character-location-query]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/intent.ts
decisions:
  - Placed both commands before the QUESTS block; enemies first (alpha), then players
  - Used 'system' event kind (not 'look') to match the plan's appendPrivateEvent usage
metrics:
  duration: 5m
  completed: "2026-03-10"
  tasks_completed: 1
  files_changed: 1
---

# Quick Task 400: Add enemies and players Commands Summary

**One-liner:** Added `enemies`/`mobs` and `players`/`who` commands showing con-colored enemy lists and player lists at current location.

## What Was Built

Two new command handlers in `spacetimedb/src/reducers/intent.ts`:

**`enemies` (alias: `mobs`):** Queries `enemy_spawn.by_location` for the player's location, filters to alive states (`available`, `engaged`, `pulling`), looks up each `enemy_template`, applies the standard con color diff formula, and formats each entry with name, group count, level, role, creature type, plus `[BOSS]`, `[In Combat]`, or `[Pulling]` suffixes as appropriate. Shows "No enemies nearby." when empty.

**`players` (alias: `who`):** Queries `character.by_location`, filters out self, formats each other player as green `[Name] — Level X Race Class`. Shows "No other players nearby." when empty.

**Help text:** Both commands added in alphabetical order — `enemies` after `events`, `players` after `loot`.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add enemies and players commands | e113ae3 | spacetimedb/src/reducers/intent.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/reducers/intent.ts` modified with both handlers
- Commit e113ae3 exists
- Pre-existing TypeScript errors in other files (combat.ts, corpse.ts, location.ts) are out of scope
- No new errors introduced in intent.ts by these changes
