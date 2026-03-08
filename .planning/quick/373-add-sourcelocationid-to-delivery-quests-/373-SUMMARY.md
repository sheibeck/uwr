---
phase: quick-373
plan: 01
subsystem: quests
tags: [schema, delivery-quests, item-spawning, search]
dependency_graph:
  requires: []
  provides: [sourceLocationId-field, delivery-quest-item-spawn-fix]
  affects: [quest-template-schema, passive-search, llm-quest-creation, seeded-quests]
tech_stack:
  added: []
  patterns: [source-vs-target-location-for-quest-types]
key_files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/helpers/search.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/seeding/ensure_world.ts
    - spacetimedb/src/data/llm_prompts.ts
decisions:
  - "Delivery quests use sourceLocationId for item pickup, targetLocationId for delivery destination"
  - "Backward compatible fallback: if sourceLocationId not set, falls back to targetLocationId"
  - "LLM prompt schema extended with targetItemName and targetNpcName for delivery/explore quests"
metrics:
  duration: 3min
  completed: "2026-03-08"
---

# Quick Task 373: Add sourceLocationId to Delivery Quests Summary

Delivery quest items now spawn at the quest giver's location (sourceLocationId) instead of the delivery destination (targetLocationId), with LLM and seeded quest integration.

## What Changed

### Task 1: Schema + Search Logic (9322810)
- Added `sourceLocationId: t.u64().optional()` to QuestTemplate table
- Updated `performPassiveSearch` to use `sourceLocationId` for delivery quests and `targetLocationId` for explore quests
- Backward compatible: falls back to `targetLocationId` if `sourceLocationId` is not set

### Task 2: LLM + Seeding Integration (a2e32b3)
- LLM-generated delivery quests auto-set `sourceLocationId` to the quest-giving NPC's location
- LLM-generated explore quests set `targetLocationId` to NPC's location as default
- Added `targetItemName` and `targetNpcName` to NPC conversation LLM response schema
- Updated `upsertQuestByName` to support `sourceLocationName` resolution
- Updated 4 seeded delivery quests with `sourceLocationName` and `targetItemName`:
  - Old Debts (Marla/Hollowmere -> Scout Thessa): Sealed Letter
  - The Iron Compact Leak (Scout Thessa/Cinderwatch -> Keeper Mordane): Intelligence Report
  - The Hermit's Warning (Gravewatcher Maren/Barrowfield -> Hermit Dunstan): Sealed Scroll
  - The Deserter's Intel (Field Medic Saera/Quarantine Ward -> Deserter Callum): Medical Records

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected NPC attribution for Greyveil delivery quest**
- **Found during:** Task 2
- **Issue:** Plan referenced "Moorland Tidings (Moorcaller Phelan -> Hermit Dunstan)" but the actual quest is "The Hermit's Warning" from Gravewatcher Maren (at Barrowfield)
- **Fix:** Used correct NPC and location from actual seeded data
- **Files modified:** spacetimedb/src/seeding/ensure_world.ts

## Verification

- TypeScript compiles without new errors (pre-existing errors in corpse.ts/location.ts unchanged)
- Schema change requires `--clear-database` on next publish

## Notes

- This is a SCHEMA CHANGE -- next publish must use `--clear-database -y`
