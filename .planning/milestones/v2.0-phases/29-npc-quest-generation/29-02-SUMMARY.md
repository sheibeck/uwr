---
phase: 29-npc-quest-generation
plan: 02
subsystem: api, database
tags: [spacetimedb, llm, npc, quest, conversation, item-generation]

requires:
  - phase: 29-npc-quest-generation
    plan: 01
    provides: NpcMemory table, QuestTemplate extensions, conversation prompt builders, npc_conversation helpers
  - phase: 24-llm-pipeline-foundation
    provides: LlmTask table and client proxy pipeline
provides:
  - talk_to_npc reducer for free-form LLM-driven NPC conversations
  - npc_conversation domain handler in submit_llm_result with dialogue + effect processing
  - turn_in_quest reducer with XP, gold, and item reward generation
  - abandon_quest reducer with affinity penalty
  - computeQuestRewardStats for level-appropriate gear generation
affects: [29-03, client-npc-ui, quest-system]

tech-stack:
  added: []
  patterns: [llm-conversation-loop, quest-reward-stat-budget, effect-processing-dispatch]

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/npc_interaction.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/quests.ts
    - spacetimedb/src/reducers/llm.ts
    - spacetimedb/src/helpers/npc_affinity.ts
    - spacetimedb/src/data/npc_data.ts

key-decisions:
  - "gpt-5-mini model for NPC conversations (fast, sufficient quality for dialogue)"
  - "Affinity change from LLM clamped to -5..+5 range per conversation"
  - "Quest type validation falls back to 'kill' if LLM returns invalid type"
  - "Item reward stats use budget system: level*2+5 base, scaled by quest difficulty"
  - "Conversation cooldown reduced to 30s (LLM budget is the real rate limiter)"
  - "Quest completion awards +10 NPC affinity, abandonment costs -3"

patterns-established:
  - "LLM conversation loop: reducer creates LlmTask -> client proxy calls LLM -> submit_llm_result processes response"
  - "Effect processing dispatch: iterate effects array, switch on type, apply mechanical changes"
  - "Quest reward budget: totalBudget = (level*2+5) * typeMultiplier, distributed across stats"

requirements-completed: [NPC-03, NPC-04]

duration: 7min
completed: 2026-03-07
---

# Phase 29 Plan 02: NPC Conversation Engine & Quest Generation Summary

**LLM-driven talk_to_npc conversation loop with structured effect dispatch (quests, affinity, reveals) and turn_in_quest with level-scaled item reward generation**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-07T20:47:30Z
- **Completed:** 2026-03-07T20:54:45Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- talk_to_npc reducer replaces old dialogue tree system with free-form LLM-driven conversation
- npc_conversation domain handler processes dialogue, affinity changes, quest offers, location reveals, memory updates
- turn_in_quest generates level-appropriate item rewards using stat budget system with quest type multipliers
- abandon_quest lets players free quest slots with affinity penalty

## Task Commits

Each task was committed atomically:

1. **Task 1: talk_to_npc reducer and npc_conversation LLM result handler** - `bc4a786` (feat)
2. **Task 2: Quest turn-in with item reward generation** - `6d829ac` (feat)

## Files Created/Modified
- `spacetimedb/src/reducers/npc_interaction.ts` - Replaced choose_dialogue_option with talk_to_npc, added LLM imports
- `spacetimedb/src/index.ts` - Added npc_conversation domain handler in submit_llm_result (error + success paths)
- `spacetimedb/src/reducers/quests.ts` - Added turn_in_quest, abandon_quest reducers and computeQuestRewardStats
- `spacetimedb/src/reducers/llm.ts` - Added npc_conversation to valid domains
- `spacetimedb/src/helpers/npc_affinity.ts` - Removed old getAvailableDialogueOptions function
- `spacetimedb/src/data/npc_data.ts` - Reduced CONVERSATION_COOLDOWN_MICROS from 1 hour to 30 seconds

## Decisions Made
- gpt-5-mini for NPC conversations (fast turnaround for interactive dialogue)
- Affinity change amounts from LLM clamped to -5..+5 per conversation to prevent exploitation
- Quest type validation falls back to 'kill' if LLM returns an invalid type
- Item reward stats use a budget system: base = level*2+5, scaled by quest difficulty multiplier
- Conversation cooldown reduced to 30s since LLM daily budget is the real rate limiter
- Quest completion awards +10 NPC affinity; abandonment costs -3

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing CONVERSATION_EFFECTS/QUEST_TYPES/NPC_AFFINITY_THRESHOLDS exports**
- **Found during:** Task 1 (imports in npc_interaction.ts and index.ts)
- **Issue:** Plan 01 imported these from mechanical_vocabulary.ts but they already existed in the file (section 7-8). Plan referenced them as if they needed to be added.
- **Fix:** Verified they already exist in mechanical_vocabulary.ts (sections 7-8), removed unnecessary duplicate addition attempt
- **Files modified:** None (no change needed)
- **Verification:** TypeScript compiles without import errors

**2. [Rule 1 - Bug] enemy_template.by_location index does not exist**
- **Found during:** Task 1 (kill quest enemy template linking)
- **Issue:** Plan specified `ctx.db.enemy_template.by_location.filter()` but this index doesn't exist. The correct pattern uses `location_enemy_template.by_location`
- **Fix:** Changed to `ctx.db.location_enemy_template.by_location.filter()` with `ref.enemyTemplateId`
- **Files modified:** spacetimedb/src/index.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** bc4a786 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full NPC conversation server loop is ready for Plan 03 (client UI wiring)
- talk_to_npc creates LlmTask, client proxy calls LLM, submit_llm_result processes response
- Quest turn-in and abandonment reducers ready for client-side quest panel integration
- No blockers

---
*Phase: 29-npc-quest-generation*
*Completed: 2026-03-07*
