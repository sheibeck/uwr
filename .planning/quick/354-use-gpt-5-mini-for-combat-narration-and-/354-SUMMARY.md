---
phase: quick-354
plan: 01
subsystem: combat-narration
tags: [llm, budget, combat]
dependency_graph:
  requires: []
  provides: [single-credit-combat-narration]
  affects: [combat_narration.ts]
tech_stack:
  patterns: [conditional-budget-charge]
key_files:
  modified:
    - spacetimedb/src/helpers/combat_narration.ts
decisions:
  - Outro narration (victory/defeat) is free; only intro charges budget
metrics:
  duration: 0min
  completed: "2026-03-08T16:28:19Z"
---

# Quick Task 354: Use gpt-5-mini for Combat Narration (Budget Consolidation)

Consolidated combat LLM budget to 1 credit per combat (intro only) instead of 2 (intro + outro).

## What Changed

In `triggerCombatNarration`, the `incrementBudget` call is now conditional on `events.narrativeType === 'intro'`. Victory/defeat outro narration still fires (budget check still applies -- if zero budget, no narration at all), but it no longer decrements the daily budget counter.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4e13cd7 | Wrap incrementBudget in intro-only conditional |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `grep` confirms `incrementBudget` is inside `if (events.narrativeType === 'intro')` block
- Model remains gpt-5-mini (no change needed, already set)
- Budget check still gates all narration types (zero budget = no narration)

## Self-Check: PASSED
