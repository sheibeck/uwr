---
phase: quick-382
plan: 01
subsystem: quest-system
tags: [quests, npc, llm-prompts, guardrails]
dependency_graph:
  requires: [npc-conversation-system, llm-pipeline]
  provides: [per-npc-quest-cap, enemy-alignment, quest-dedup, quest-followup-chains, repeat-throttling]
  affects: [submit_llm_result, talk_to_npc, turn_in_quest]
tech_stack:
  patterns: [server-side-safety-net, llm-context-enrichment, npc-memory-continuity]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/npc_conversation.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/reducers/npc_interaction.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/quests.ts
decisions:
  - "MAX_QUESTS_PER_NPC = 1 enforced both in LLM prompt (soft) and server logic (hard)"
  - "LLM-invented enemies get auto-created EnemyTemplate with level-scaled defaults"
  - "Quest completion recorded in NPC memory for narrative continuity and follow-up chains"
  - "Duplicate quest names blocked per NPC+character combination"
metrics:
  duration: 3min
  completed: "2026-03-09T00:37:55Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Quick Task 382: Shore Up Quest System Summary

Per-NPC quest limits, enemy-aligned kill quests, duplicate prevention, follow-up chains, and repeat throttling across server helpers, LLM prompts, and quest processing.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add quest context helpers and enrich LLM prompts | 76e2e2c | npc_conversation.ts, llm_prompts.ts, npc_interaction.ts |
| 2 | Enforce per-NPC quest cap, enemy alignment, duplicate prevention | 169ff90 | index.ts, quests.ts |

## What Changed

### New Helpers (npc_conversation.ts)
- `getActiveQuestCountForNpc(ctx, characterId, npcId)` -- counts non-completed quests from a specific NPC
- `getCompletedQuestNamesForNpc(ctx, characterId, npcId)` -- extracts completed quest names from NPC memory
- `getNearbyEnemyContext(ctx, locationId)` -- collects enemy templates from current + connected locations (cap 15)
- `recordQuestCompletion(ctx, characterId, npcId, questName)` -- records quest name in NPC memory (dedup, cap 10)
- `MAX_QUESTS_PER_NPC = 1` constant

### LLM Prompt Enrichment (llm_prompts.ts)
- System prompt now includes quest history with the player and per-NPC active quest enforcement
- User prompt now includes nearby enemy context (names, levels, locations) and recent quest throttling
- Response schema includes `targetEnemyName` field for kill quests
- Kill quest instructions prefer real enemies, allow invention only when narrative demands it

### Server-Side Guardrails (index.ts)
- Per-NPC quest cap check before quest template creation (safety net)
- Duplicate quest name prevention (same NPC + character)
- Enemy template resolution: searches current + connected locations for matching `targetEnemyName`
- Auto-creates new EnemyTemplate with level-scaled defaults when LLM invents novel enemies
- Links new enemy templates to character's current location

### Quest Completion Memory (quests.ts)
- `turn_in_quest` now calls `recordQuestCompletion` to store quest name in NPC memory
- Enables follow-up quest chains: next conversation sees completed quest history

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compiles without errors in modified files
- All pre-existing type errors are in unrelated files (corpse.ts, location.ts)
