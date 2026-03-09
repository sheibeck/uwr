---
phase: 29-npc-quest-generation
plan: 01
subsystem: database, api
tags: [spacetimedb, llm, npc, quest, conversation, world-gen]

requires:
  - phase: 24-llm-pipeline-foundation
    provides: LlmTask table and proxy pipeline for LLM calls
  - phase: 27-dynamic-world-generation
    provides: writeGeneratedRegion NPC creation, Region/Location tables
  - phase: 28-dynamic-skill-generation
    provides: mechanical_vocabulary.ts with conversation/quest enums
provides:
  - NpcMemory table for per-player-per-NPC conversation memory
  - QuestTemplate extensions for LLM-generated per-player quests
  - NPC conversation system prompt builder with affinity-gated unlocks
  - NPC conversation response schema for structured LLM responses
  - Expanded world gen NPC personality data (traits, speech, knowledge, secrets)
  - NPC conversation helper functions (memory CRUD, affinity tier mapping, quest counting)
affects: [29-02, 29-03, npc-conversation-engine, quest-generation]

tech-stack:
  added: []
  patterns: [npc-conversation-prompt-builder, affinity-gated-unlock-mapping, personality-json-population]

key-files:
  created:
    - spacetimedb/src/helpers/npc_conversation.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/helpers/world_gen.ts

key-decisions:
  - "MAX_ACTIVE_QUESTS = 4 per player (balances quest variety vs completion pressure)"
  - "NPC memory capped at 10 entries per array (topics, secrets, etc.) to keep prompt size bounded"
  - "Affinity tier mapping uses mechanical_vocabulary NPC_AFFINITY_THRESHOLDS for consistency"
  - "Default personality fallback for NPCs with empty personalityJson ensures graceful degradation"

patterns-established:
  - "NPC personality JSON structure: { traits, speechPattern, knowledgeDomains, secrets, affinityMultiplier }"
  - "Conversation prompt builder pattern: identity + knowledge boundaries + affinity unlocks + response schema"
  - "Memory update pattern: merge new topics/secrets, cap arrays at 10, update summary from internalThought"

requirements-completed: [NPC-01, NPC-02]

duration: 3min
completed: 2026-03-07
---

# Phase 29 Plan 01: NPC Data Layer & Conversation Prompts Summary

**NpcMemory table, QuestTemplate per-player extensions, conversation prompt builder with affinity-gated content, and rich NPC personality in world gen**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T20:41:03Z
- **Completed:** 2026-03-07T20:44:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- NpcMemory table stores per-player-per-NPC summarized conversation memory (topics, secrets, quests, gifts)
- QuestTemplate extended with 6 new fields for LLM-generated per-player quests (description, rewardType, rewardItemName, rewardItemDesc, rewardGold, characterId)
- Conversation prompt builder generates structured system prompts with NPC identity, knowledge boundaries, affinity-gated unlocks, and response rules
- World gen now produces NPCs with rich personalityJson (traits, speechPattern, knowledgeDomains, secrets)
- Helper functions ready for Plan 02's conversation engine

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema extensions** - `a11c7e3` (feat)
2. **Task 2: Conversation prompts, world gen, helpers** - `f1fe078` (feat)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - NpcMemory table, QuestTemplate extensions, schema registration
- `spacetimedb/src/data/llm_prompts.ts` - REGION_GENERATION_SCHEMA personality fields, buildNpcConversationSystemPrompt, NPC_CONVERSATION_RESPONSE_SCHEMA, buildNpcConversationUserPrompt
- `spacetimedb/src/helpers/world_gen.ts` - personalityJson population in writeGeneratedRegion
- `spacetimedb/src/helpers/npc_conversation.ts` - getOrCreateNpcMemory, updateNpcMemory, getAffinityTierForConversation, getActiveQuestCount, parseNpcPersonality, MAX_ACTIVE_QUESTS

## Decisions Made
- MAX_ACTIVE_QUESTS set to 4 (research recommendation -- balances variety vs completion pressure)
- NPC memory arrays capped at 10 entries each (keeps LLM prompt size bounded)
- Default personality fallback ensures existing NPCs without personalityJson still work in conversations
- Affinity tier mapping uses bigint thresholds from mechanical_vocabulary for consistency with existing system

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema and prompt infrastructure ready for Plan 02 to build the conversation engine
- Plan 02 can import buildNpcConversationSystemPrompt, NPC_CONVERSATION_RESPONSE_SCHEMA, buildNpcConversationUserPrompt from llm_prompts.ts
- Plan 02 can import getOrCreateNpcMemory, updateNpcMemory, getAffinityTierForConversation, getActiveQuestCount, parseNpcPersonality from npc_conversation.ts
- No blockers

---
*Phase: 29-npc-quest-generation*
*Completed: 2026-03-07*
