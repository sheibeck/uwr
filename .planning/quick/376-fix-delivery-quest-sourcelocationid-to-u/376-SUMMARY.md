---
phase: quick-376
plan: 01
subsystem: quests
tags: [bugfix, delivery-quests, llm-prompts, npc-interaction]
dependency_graph:
  requires: []
  provides: [delivery-quest-source-resolution]
  affects: [quest-creation, npc-conversation]
tech_stack:
  added: []
  patterns: [timestamp-pseudorandom-selection, fuzzy-location-matching]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/npc_interaction.ts
decisions:
  - "LLM sourceLocationName matched case-insensitively against region locations"
  - "Fallback uses timestamp-based pseudorandom neighbor selection (reducer determinism)"
  - "NPC location used only as absolute last resort for isolated locations"
metrics:
  duration: 2min
  completed: "2026-03-08T20:55:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Quick Task 376: Fix Delivery Quest sourceLocationId Summary

Delivery quests now resolve sourceLocationId to a pickup location DIFFERENT from the quest-giver NPC, using LLM-suggested location name or random neighbor fallback.

## Task Results

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add sourceLocationName to LLM schema and prompt | 4554bd7 | spacetimedb/src/data/llm_prompts.ts |
| 2 | Resolve sourceLocationId from LLM response or neighbors | aac5f44 | spacetimedb/src/index.ts, spacetimedb/src/reducers/npc_interaction.ts |

## Changes Made

### LLM Schema Updates (llm_prompts.ts)
- Added `sourceLocationName` field to `NPC_CONVERSATION_RESPONSE_SCHEMA` for delivery quests
- Added delivery quest instruction to system prompt telling LLM to specify a different pickup location
- Added optional `nearbyLocationNames` parameter to `buildNpcConversationUserPrompt` so LLM has actual location names to choose from

### Quest Creation Logic (index.ts)
- Replaced `sourceLocationId: npcLocation` (the bug) with smart resolution:
  1. Try LLM-provided `sourceLocationName` via case-insensitive match against region locations
  2. Fall back to random connected neighbor (timestamp-based pseudorandom for determinism)
  3. Only use NPC location as absolute last resort (completely isolated location)

### NPC Interaction (npc_interaction.ts)
- Collect nearby location names from `location_connection` table
- Pass them to `buildNpcConversationUserPrompt` for LLM context

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `sourceLocationId: npcLocation` no longer appears in index.ts (old bug removed)
- `sourceLocId` resolution logic present in index.ts
- `sourceLocationName` present in both schema and prompt in llm_prompts.ts
- `spacetime publish uwr -p spacetimedb` succeeds
