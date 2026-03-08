---
phase: quick-348
plan: 01
subsystem: combat
tags: [combat, real-time, round-removal, ui]
dependency_graph:
  requires: [quick-347]
  provides: [real-time-combat-loop, use-ability-realtime-reducer]
  affects: [combat-reducers, combat-ui, narrative-console]
tech_stack:
  patterns: [real-time-combat-loop, immediate-ability-execution, post-combat-llm-summary]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/data/combat_constants.ts
    - spacetimedb/src/helpers/combat_narration.ts
    - src/composables/useCombat.ts
    - src/components/CombatActionBar.vue
    - src/components/NarrativeConsole.vue
    - src/components/NarrativeInput.vue
    - src/App.vue
    - src/module_bindings/use_ability_realtime_reducer.ts
decisions:
  - Kept round-based table schemas (CombatRound, CombatAction, CombatNarrative, RoundTimerTick) to avoid --clear-database
  - resolve_round_timer reducer kept as no-op for schema compatibility
  - Effects tick every combat_loop tick (~1s) -- short-lived effects expire in N ticks instead of N rounds
  - Post-combat LLM summary uses fake round object {narrationCount: 0n, roundNumber: 0n} for triggerCombatNarration
  - Legacy round constants kept exported for combat helper function signatures
metrics:
  duration: 11min
  completed: "2026-03-08T14:14:00Z"
---

# Quick Task 348: Remove Rounds and Inline Combat HUD -- Restore Real-Time Combat

Real-time combat loop restored with auto-attacks on weapon speed timers, immediate ability execution via use_ability_realtime reducer, and single post-combat LLM narration. All round-based UI (timers, status bars, round headers, action submission states) removed from client.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Restore real-time combat_loop and immediate ability/flee on server | e09539e | Re-enabled combat_loop with nextAutoAttackAt timing, added use_ability_realtime reducer, added triggerPostCombatSummary, removed resolveRound/submit_combat_action/round creation |
| 2 | Remove round UI and inline combat HUD from client, wire real-time reducers | 02076ff | Removed all round state from useCombat, stripped round props from CombatActionBar/NarrativeConsole/NarrativeInput, removed round event injection watchers from App.vue, wired useAbilityRealtime |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed combat_narration.ts crash on mock round object**
- **Found during:** Task 1
- **Issue:** triggerPostCombatSummary passes a mock round object `{narrationCount: 0n, roundNumber: 0n}` without an `id` field, causing combat_round.id.find(undefined) to crash
- **Fix:** Added null check on `round.id` before attempting to find/update combat_round row
- **Files modified:** spacetimedb/src/helpers/combat_narration.ts

**2. [Rule 3 - Blocking] Removed unused ScheduleAt import from items.ts**
- **Found during:** Task 1
- **Issue:** After removing round-based action submission code, ScheduleAt import was unused
- **Fix:** Removed the import
- **Files modified:** spacetimedb/src/reducers/items.ts

**3. [Rule 3 - Blocking] Restored legacy round constants for helper compatibility**
- **Found during:** Task 1
- **Issue:** combat.ts helpers still import ROUND_TIMER_MICROS, SOLO_TIMER_MICROS, EFFECT_ROUND_CONVERSION_MICROS, MIN_EFFECT_ROUNDS -- removing them caused build warnings
- **Fix:** Kept the constants exported from combat_constants.ts marked as legacy
- **Files modified:** spacetimedb/src/data/combat_constants.ts

## Server Changes

- **combat_loop** (scheduled reducer): Now processes real-time auto-attacks checking `nextAutoAttackAt` for both players and enemies, ticks effects every loop iteration, handles victory/defeat with post-combat LLM summary
- **use_ability_realtime** (new reducer): Immediate ability execution with cooldown validation -- no round gating
- **flee_combat**: Round-based branch removed; flee attempt executes immediately
- **startCombatForSpawn**: No longer creates first round or triggers intro narration; schedules combat_loop tick instead
- **submit_combat_action**: Removed (binding file deleted)
- **resolve_round_timer**: Kept as no-op for schema compatibility
- **resolveRound, getCurrentRound, upsertCombatAction, checkAllSubmittedAndResolve**: All removed (~450 lines)
- **items.ts use_ability**: Round-based action submission branch removed

## Client Changes

- **useCombat.ts**: Removed 15+ round-related computeds/refs/functions (~300 lines), added `useAbilityRealtime` function
- **CombatActionBar.vue**: Removed round timer display, "Action locked in" text, hasSubmittedAction disabled state
- **NarrativeConsole.vue**: Removed round timer/status indicators, round-related props
- **NarrativeInput.vue**: Removed round-related props pass-through
- **App.vue**: Removed 5 round-related watchers for event injection, updated combat action handlers to use real-time reducers

## Self-Check: PASSED

All 10 modified files verified present. Both task commits (e09539e, 02076ff) verified in git history.
