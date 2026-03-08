---
phase: 30-narrative-combat
plan: 01
subsystem: combat
tags: [round-based, combat-engine, spacetimedb, scheduled-reducers]

# Dependency graph
requires:
  - phase: 28-data-driven-abilities
    provides: Kind-based ability dispatch, AbilityTemplate table
provides:
  - CombatRound, CombatAction, CombatNarrative tables for round state tracking
  - RoundTimerTick scheduled table for round timer expiry
  - submit_combat_action reducer for player action submission
  - resolveRound function for bulk round resolution
  - resolve_round_timer scheduled reducer
  - Round-based effect ticking (per-round instead of real-time)
affects: [30-02-narrative-layer, 30-03-combat-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Submit-then-resolve pattern: players submit actions, timer/all-submitted triggers resolution"
    - "Round timer via RoundTimerTick scheduled reducer with solo/group duration variants"
    - "Effect duration in rounds (convertDurationToRounds helper)"

key-files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/schema/scheduled_tables.ts
    - spacetimedb/src/data/combat_constants.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/items.ts

key-decisions:
  - "Boss enemies get 2 actions per round (1 ability + 1 auto-attack), standard enemies get 1"
  - "Solo combat uses 6s timer, group combat uses 10s timer"
  - "Effect duration conversion: rounds = durationMicros / 4_000_000n (min 1 round)"
  - "Legacy combat_loop kept registered for backward compatibility"
  - "use_ability in round-based combat redirects to action submission instead of immediate execution"
  - "Players can change their action before round locks (upsert pattern)"

patterns-established:
  - "Round lifecycle: action_select -> resolving -> resolved -> next round"
  - "All-submitted check triggers immediate resolution (cancels timer)"
  - "Enemy AI scoring system reused from tick-based engine in round context"

requirements-completed: [COMBAT-01, COMBAT-02]

# Metrics
duration: 9min
completed: 2026-03-08
---

# Phase 30 Plan 01: Round-Based Combat Engine Summary

**Submit-then-resolve round-based combat engine replacing real-time tick loop with CombatRound state machine, per-round effect ticking, and 6s/10s timer variants**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-08T01:43:16Z
- **Completed:** 2026-03-08T01:52:27Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Replaced continuous 1-second combat_loop tick with discrete round-based resolution
- Players submit actions via submit_combat_action reducer; can change before round locks
- Round resolves when all players submit OR timer expires (6s solo, 10s group)
- Effects (DoTs, HoTs, buffs) tick once per round instead of real-time EffectTick/HotTick
- All existing combat mechanics preserved: damage formulas, crits, aggro, scaling, loot

## Task Commits

Each task was committed atomically:

1. **Task 1: Add round-based combat schema tables and constants** - `8a94bf4` (feat)
2. **Task 2: Rewrite combat engine from tick-based to round-based resolution** - `74137f4` (feat)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - Added CombatRound, CombatAction, CombatNarrative, RoundTimerTick tables
- `spacetimedb/src/schema/scheduled_tables.ts` - Exported RoundTimerTick
- `spacetimedb/src/data/combat_constants.ts` - Added ROUND_TIMER_MICROS, SOLO_TIMER_MICROS, EFFECT_ROUND_CONVERSION_MICROS, MAX_COMBAT_NARRATIONS, NARRATION_BUDGET_THRESHOLD
- `spacetimedb/src/reducers/combat.ts` - Added submit_combat_action, resolveRound, resolve_round_timer, round-based helper functions; modified startCombatForSpawn, flee_combat, clearCombatArtifacts
- `spacetimedb/src/helpers/combat.ts` - Added convertDurationToRounds, scheduleRoundTimer, createFirstRound
- `spacetimedb/src/index.ts` - Imported new tables, added RoundTimerTick to reducerDeps
- `spacetimedb/src/reducers/items.ts` - Modified use_ability to redirect through action submission in round-based combat

## Decisions Made
- Boss enemies get 2 actions per round (1 ability + 1 auto-attack); standard enemies get 1 -- preserves boss threat without complex multi-action systems
- Solo combat pacing: 6-second timer (vs 10s for groups) -- solo players don't need coordination time
- Effect duration conversion: 1 round ~ 4 seconds equivalent -- a 12-second DoT becomes 3 rounds
- Players can change their submitted action before round locks (upsert pattern) -- reduces frustration
- Legacy combat_loop scheduled reducer remains registered for backward compatibility during transition
- Flee is a round action choice resolved during resolution, not an immediate status change

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Round-based engine is operational and publishing to local SpacetimeDB
- CombatNarrative table is ready for Plan 02 (LLM narration integration)
- Round events structured for LLM narration context building
- Client will need updates (Plan 03) to subscribe to new tables and submit actions

---
*Phase: 30-narrative-combat*
*Completed: 2026-03-08*
