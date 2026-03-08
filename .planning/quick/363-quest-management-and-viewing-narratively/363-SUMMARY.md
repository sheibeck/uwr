---
phase: quick-363
plan: 01
subsystem: intent-reducer
tags: [quests, narrative-ui, travel, look]
dependency_graph:
  requires: [quest_instance, quest_template, quest_item, npc, performPassiveSearch]
  provides: [quests-command, turn-in-command, abandon-command, loot-quest-item, travel-spawning]
  affects: [intent.ts, buildLookOutput]
tech_stack:
  patterns: [narrative-command-handler, tdd]
key_files:
  modified:
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/intent.test.ts
decisions:
  - "quests command uses 'quests' and 'quest' aliases (not 'q' to avoid keyboard shortcut conflict)"
  - "turn in handler performs reward logic inline rather than delegating to turn_in_quest reducer"
  - "abandon gives -3 affinity penalty per CONTEXT.md decision"
  - "loot <name> handler placed before deposit/sell handlers to catch quest item looting"
  - "ensureSpawnsForLocation omitted (function does not exist in codebase); performPassiveSearch handles resource + quest item spawning"
  - "implicit travel also gets performPassiveSearch + auto-look (was missing from plan but needed for consistency)"
metrics:
  duration: 3min
  completed: "2026-03-08T18:48:30Z"
  tasks_completed: 1
  tasks_total: 1
---

# Quick Task 363: Quest Management and Viewing Narratively

Narrative quest viewing via "quests" command, quest item looting, turn-in/abandon handlers, and travel spawning fix with performPassiveSearch.

## Task Summary

| # | Task | Type | Commit | Key Changes |
|---|------|------|--------|-------------|
| 1 | Add quests command, fix travel spawning, show quest items in LOOK | auto (TDD) | b2a0756, 05a8048 | intent.ts: 6 new command handlers, buildLookOutput quest items section, travel spawning |

## What Was Built

### Quests Command
- `quests` / `quest` shows active quests with progress, quest giver name + location, description, and clickable [Turn In] / [Abandon] links
- Empty state shows helpful "Speak with NPCs" message

### Turn In / Abandon
- `turn in <quest name>` validates completion + NPC location, awards XP/gold/affinity (+10), deletes quest instance
- `abandon <quest name>` deletes quest instance with -3 affinity penalty and warning message

### Quest Items in LOOK
- Section 7.5 in buildLookOutput shows discovered (not looted) quest items with [Loot <name>] links
- `loot <name>` handler marks quest items as looted and updates quest progress

### Travel Spawning Fix
- Both explicit (`go <place>`) and implicit (bare location name) travel now call `performPassiveSearch` before auto-look
- Implicit travel also gets auto-look output (was previously missing)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ensureSpawnsForLocation does not exist**
- **Found during:** Task 1 implementation
- **Issue:** Plan referenced `ensureSpawnsForLocation` but this function does not exist in the codebase
- **Fix:** Omitted the call; `performPassiveSearch` already handles resource node and quest item spawning
- **Files modified:** spacetimedb/src/reducers/intent.ts

**2. [Rule 2 - Missing Functionality] Implicit travel missing auto-look and passive search**
- **Found during:** Task 1 implementation
- **Issue:** Implicit travel (bare location name match) had no auto-look or performPassiveSearch call, unlike explicit travel
- **Fix:** Added both performPassiveSearch and auto-look to implicit travel handler
- **Files modified:** spacetimedb/src/reducers/intent.ts

## Verification

- All 7 tests pass (4 existing + 3 new quest item tests)
- TDD flow completed: RED (1 failing) -> GREEN (all pass)

## Self-Check: PASSED

- intent.ts: FOUND
- intent.test.ts: FOUND
- Commit b2a0756: FOUND
- Commit 05a8048: FOUND
