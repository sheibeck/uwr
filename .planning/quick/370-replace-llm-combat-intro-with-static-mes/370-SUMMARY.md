---
phase: quick-370
plan: 01
subsystem: combat-narration
tags: [combat, llm, narration, cost-optimization]
dependency_graph:
  requires: []
  provides: [static-combat-intro, single-llm-credit-per-combat]
  affects: [combat-flow, llm-budget]
tech_stack:
  patterns: [static-message-pool, deterministic-selection]
key_files:
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/helpers/combat_narration.ts
    - spacetimedb/src/data/llm_prompts.ts
decisions:
  - Static message pool with deterministic selection via combat ID modulus
  - Budget charged on outro (victory/defeat) instead of intro
  - Outro prompt enriched with location, enemy, and player context
metrics:
  duration: 3min
  completed: "2026-03-08T20:02:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 370: Replace LLM Combat Intro with Static Messages

Static sardonic Keeper messages replace LLM intro call; outro prompt improved to not lead with location name. 1 LLM credit per combat (outro only) instead of 2.

## Changes Made

### Task 1: Replace LLM intro with static message pool and fix outro prompt

**combat.ts:**
- Removed entire LLM intro narration block (introEvents, triggerCombatNarration call)
- Removed fallback timeout scheduling (COMBAT_INTRO_TIMEOUT_MICROS)
- Added pool of 5 sardonic Keeper messages with deterministic selection using `combat.id % 5n`
- Broadcasts static intro + "world grows still" message to all participants
- Calls `scheduleCombatTick` immediately (no 12s delay)
- Removed unused `COMBAT_INTRO_TIMEOUT_MICROS` import

**combat_narration.ts:**
- Flipped budget charging from intro to outro (victory/defeat)
- Removed intro failure fallback (scheduleCombatTick on LLM failure)
- Removed intro success handler (world settling message + combat tick scheduling)
- Removed intro branch from prompt building
- Removed unused imports (scheduleCombatTick, buildCombatIntroUserPrompt)
- Updated docstring to reflect new budget strategy

**llm_prompts.ts:**
- Added `@deprecated` comment to `buildCombatIntroUserPrompt`
- Added location, enemy names, and player names as context to outro prompt
- Added instruction to not lead with location name and vary openings

### Task 2: Verify and publish

- Module published cleanly to local SpacetimeDB
- Client bindings regenerated (no schema changes)
- No client-side references to removed constants

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit  | Description                                           |
|------|---------|-------------------------------------------------------|
| 1    | 4278a02 | feat(quick-370): replace LLM combat intro with static messages |
| 2    | (none)  | Verification only, no code changes                    |

## Self-Check: PASSED
