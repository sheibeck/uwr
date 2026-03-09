---
phase: 29-npc-quest-generation
plan: 03
subsystem: client, api
tags: [vue, spacetimedb, npc, conversation, llm, quest, bindings]

requires:
  - phase: 29-npc-quest-generation
    plan: 02
    provides: talk_to_npc reducer, turn_in_quest reducer, abandon_quest reducer, npc_conversation domain handler
  - phase: 24-llm-pipeline-foundation
    provides: LlmTask table and useLlmProxy client proxy pipeline
provides:
  - useNpcConversation composable for client-side NPC conversation state and reducer calls
  - Regenerated client bindings with talk_to_npc, turn_in_quest, abandon_quest reducers
  - Intent handler routes "talk to [NPC]" to greeting display (replaces old dialogue tree)
affects: [client-npc-ui, quest-panel]

tech-stack:
  added: []
  patterns: [npc-greeting-intent, conversation-composable]

key-files:
  created:
    - src/composables/useNpcConversation.ts
    - src/module_bindings/talk_to_npc_reducer.ts
    - src/module_bindings/turn_in_quest_reducer.ts
    - src/module_bindings/abandon_quest_reducer.ts
    - src/module_bindings/npc_memory_table.ts
  modified:
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/commands.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts
    - src/module_bindings/quest_template_table.ts

key-decisions:
  - "NPC greeting from intent handler triggers display only; full LLM conversation goes through talk_to_npc reducer from client"
  - "npc_memory is private table (server-only); client does not need to subscribe"
  - "Old getAvailableDialogueOptions removed from commands.ts import; dialogue tree code deprecated"

patterns-established:
  - "Intent handler shows NPC greeting, client composable manages ongoing conversation via talk_to_npc reducer"
  - "useNpcConversation exposes startConversation/sendMessage/endConversation/turnInQuest/abandonQuest"

requirements-completed: [NPC-01, NPC-02, NPC-03, NPC-04]

duration: 4min
completed: 2026-03-07
---

# Phase 29 Plan 03: Client NPC Conversation Wiring Summary

**Client-side NPC conversation composable with regenerated bindings, greeting-based intent routing, and quest action reducer calls**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T20:57:00Z
- **Completed:** 2026-03-07T21:01:00Z
- **Tasks:** 1 of 2 (Task 2 is human-verify checkpoint)
- **Files modified:** 11

## Accomplishments
- Regenerated client bindings with talk_to_npc, turn_in_quest, abandon_quest reducers and npc_memory table
- Created useNpcConversation composable for conversation state management and reducer calls
- Replaced old dialogue tree lookup in intent handler with NPC greeting display
- Removed stale getAvailableDialogueOptions import from commands.ts
- Deleted obsolete choose_dialogue_option_reducer binding

## Task Commits

Each task was committed atomically:

1. **Task 1: Regenerate bindings, update intent service, build useNpcConversation composable** - `906ce47` (feat)

## Files Created/Modified
- `src/composables/useNpcConversation.ts` - Client composable for NPC conversation state and actions
- `src/module_bindings/talk_to_npc_reducer.ts` - Generated binding for talk_to_npc reducer
- `src/module_bindings/turn_in_quest_reducer.ts` - Generated binding for turn_in_quest reducer
- `src/module_bindings/abandon_quest_reducer.ts` - Generated binding for abandon_quest reducer
- `src/module_bindings/npc_memory_table.ts` - Generated binding for npc_memory table (private, server-only)
- `spacetimedb/src/reducers/intent.ts` - Updated hail/talk handler to use NPC greeting instead of dialogue tree
- `spacetimedb/src/reducers/commands.ts` - Removed stale getAvailableDialogueOptions import and usage
- `src/module_bindings/index.ts` - Regenerated with new reducers
- `src/module_bindings/types.ts` - Regenerated types
- `src/module_bindings/types/reducers.ts` - Regenerated reducer types
- `src/module_bindings/quest_template_table.ts` - Regenerated with extended fields

## Decisions Made
- NPC greeting from intent handler triggers display only; full LLM conversation goes through talk_to_npc reducer from client
- npc_memory is a private table (server-only); client does not need to subscribe to it
- Old getAvailableDialogueOptions removed from commands.ts; dialogue tree code deprecated in favor of LLM conversation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed stale getAvailableDialogueOptions import from commands.ts**
- **Found during:** Task 1 (publish verification)
- **Issue:** `commands.ts` imported `getAvailableDialogueOptions` from `npc_affinity.ts` but Plan 02 deleted that function, causing a build warning
- **Fix:** Removed the import and replaced the function call with an empty array (old dialogue tree deprecated)
- **Files modified:** spacetimedb/src/reducers/commands.ts
- **Verification:** Module publishes without the MISSING_EXPORT warning for this function
- **Committed in:** 906ce47 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix necessary to clean up stale reference from Plan 02. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 2 (human-verify) pending: end-to-end NPC conversation and quest generation verification
- All client wiring complete; player can talk to NPCs, send messages, turn in quests
- useLlmProxy already handles npc_conversation domain (no domain filtering)

---
*Phase: 29-npc-quest-generation*
*Completed: 2026-03-07*
