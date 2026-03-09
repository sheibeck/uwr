---
phase: 25-narrative-ui-shell
plan: 01
subsystem: ui
tags: [natural-language, intent-routing, spacetimedb, vue, composable]

requires:
  - phase: 24-llm-pipeline-foundation
    provides: LLM pipeline for future narrative generation
provides:
  - submit_intent reducer for server-side natural language routing
  - useContextActions composable for context-aware action bar
  - ContextAction type for action descriptors
affects: [25-narrative-ui-shell]

tech-stack:
  added: []
  patterns: [server-side intent routing with pattern matching, context-aware action derivation]

key-files:
  created:
    - spacetimedb/src/reducers/intent.ts
    - src/composables/useContextActions.ts
  modified:
    - spacetimedb/src/reducers/index.ts

key-decisions:
  - "Minimal inline travel for NL MVP -- skips stamina/cooldown/group-pull for simplicity, defers full parity to later"
  - "Attack intent shows guidance message rather than auto-engaging combat (complex spawn/group logic)"
  - "Use/cast ability intent shows hint to use ability bar rather than routing through complex ability system"
  - "Hail intent uses simplified NPC greeting (root dialogue only, no quest turn-in)"

patterns-established:
  - "Intent reducer pattern: registerIntentReducers(deps) following existing reducer registration convention"
  - "Context action composable: computed derivation from refs, returns ContextAction[] array"

requirements-completed: [UI-03]

duration: 4min
completed: 2026-03-07
---

# Phase 25 Plan 01: Intent Router and Context Actions Summary

**Server-side submit_intent reducer with 10 NL patterns (look, travel, say, whisper, hail, attack, flee, camp, use, stats) plus sardonic fallback, and useContextActions composable for combat/exploration action bar**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T02:17:53Z
- **Completed:** 2026-03-07T02:22:17Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Server-side natural language intent router handles 10+ patterns with priority-ordered matching
- Sardonic System narrator fallback for unrecognized input
- Context-aware action composable adapts between combat (abilities + flee) and exploration (locations + look + NPCs)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create submit_intent reducer** - `28d662c` (feat)
2. **Task 2: Create useContextActions composable** - `5aa695e` (feat)

## Files Created/Modified
- `spacetimedb/src/reducers/intent.ts` - submit_intent reducer with NL pattern matching
- `spacetimedb/src/reducers/index.ts` - Registers intent reducers
- `src/composables/useContextActions.ts` - Context-aware action bar composable

## Decisions Made
- Travel via NL uses minimal inline movement (no stamina/cooldown/group-pull) with TODO for full parity with move_character
- Attack intent guides players to use action bar rather than auto-engaging complex combat system
- Ability use/cast intent guides to ability bar rather than routing through cooldown/mana/target validation
- Hail uses simplified NPC greeting (root dialogue only) rather than replicating full quest turn-in logic from commands.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Intent router ready for NarrativeInput component to call submit_intent
- Context actions composable ready for action bar rendering
- Both TypeScript compilations pass (no new errors introduced)

---
*Phase: 25-narrative-ui-shell*
*Completed: 2026-03-07*
