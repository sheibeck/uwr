---
phase: 30-narrative-combat
plan: 02
subsystem: combat
tags: [llm-narration, combat-engine, spacetimedb, round-based]

# Dependency graph
requires:
  - phase: 30-narrative-combat
    provides: CombatRound, CombatAction, CombatNarrative tables, resolveRound function
  - phase: 24-llm-pipeline-foundation
    provides: LlmTask table, checkBudget, incrementBudget, useLlmProxy client composable
provides:
  - shouldNarrateRound qualification logic (crit/kill/near-death triggers)
  - triggerCombatNarration with round-robin budget rotation
  - handleCombatNarrationResult for combat_narration domain processing
  - buildCombatRoundUserPrompt, buildCombatIntroUserPrompt, buildCombatOutroUserPrompt
  - COMBAT_NARRATION_SCHEMA constant
  - combat_narration domain handler in submit_llm_result
affects: [30-03-combat-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre/post HP snapshot diffing for narration event detection without deep action instrumentation"
    - "Round-robin budget rotation: narrationCount % participantCount selects charged player"
    - "Silent failure pattern: combat_narration errors don't interrupt combat flow"

key-files:
  created:
    - spacetimedb/src/helpers/combat_narration.ts
  modified:
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/index.ts

key-decisions:
  - "HP snapshot diffing over deep action instrumentation -- avoids massive refactor of resolveRound internals"
  - "gpt-5-mini for combat narration (fast, 400 max tokens, sufficient for 2-4 sentence narration)"
  - "Budget already incremented in triggerCombatNarration -- no double increment in submit_llm_result"
  - "Silent failure for combat_narration errors -- combat continues without narration"

patterns-established:
  - "Combat narration qualification: intro/victory/defeat always, mid-round only on crit/kill/near-death"
  - "Narration cap at MAX_COMBAT_NARRATIONS (3) per encounter plus intro/outro"
  - "Budget threshold (10 remaining) skips narration to preserve budget for player features"

requirements-completed: [COMBAT-01, COMBAT-02, COMBAT-03]

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 30 Plan 02: Combat Narration Layer Summary

**LLM narration pipeline wired into round-based combat with qualification logic, round-robin budget rotation, and sardonic System narrator for intro/key-round/victory/defeat moments**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T01:59:25Z
- **Completed:** 2026-03-08T02:04:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created complete combat narration helper module with qualification, trigger, and result handling
- Wired LLM narration into resolveRound for mid-round events, victory, defeat, and combat intro
- Budget rotation distributes LLM costs across combat participants via round-robin
- Narration capped at 3 mid-combat calls plus intro/outro, with budget threshold skip at 10 remaining

## Task Commits

Each task was committed atomically:

1. **Task 1: Create combat narration helpers and LLM prompt builder** - `3c956c5` (feat)
2. **Task 2: Integrate narration into resolveRound and submit_llm_result** - `5884f07` (feat)

## Files Created/Modified
- `spacetimedb/src/helpers/combat_narration.ts` - RoundEventSummary type, shouldNarrateRound, triggerCombatNarration, handleCombatNarrationResult
- `spacetimedb/src/data/llm_prompts.ts` - buildCombatRoundUserPrompt, buildCombatIntroUserPrompt, buildCombatOutroUserPrompt, COMBAT_NARRATION_SCHEMA
- `spacetimedb/src/reducers/combat.ts` - Pre/post HP snapshots in resolveRound, narration triggers at victory/defeat/mid-round, intro trigger in startCombatForSpawn
- `spacetimedb/src/index.ts` - combat_narration domain handler in submit_llm_result (success and error branches)

## Decisions Made
- HP snapshot diffing over deep action instrumentation: avoids massive refactor of resolveRound internals while still detecting kills, near-deaths, and damage dealt
- gpt-5-mini for combat narration: fast turnaround for real-time combat, 400 max tokens sufficient for 2-4 sentence narration
- Budget already incremented in triggerCombatNarration so submit_llm_result skips double increment
- Silent failure for combat_narration errors: combat continues without narration, no error message to players

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Combat narration pipeline is fully operational and publishing to local SpacetimeDB
- Client will see LlmTask rows with domain 'combat_narration' and process them via useLlmProxy
- CombatNarrative rows created on successful LLM response
- Narration broadcast to all participants as 'combat_narration' kind private events
- Plan 03 (Combat UI) can subscribe to CombatNarrative table and display narration text

---
*Phase: 30-narrative-combat*
*Completed: 2026-03-08*
