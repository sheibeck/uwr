---
phase: quick-340
plan: 01
subsystem: client-input
tags: [refactor, ux, command-routing]
dependency_graph:
  requires: []
  provides: [unified-command-routing]
  affects: [narrative-input, keyword-clicks, npc-conversation]
tech_stack:
  added: []
  patterns: [delegation-pattern]
key_files:
  modified: [src/App.vue]
decisions:
  - clickNpcKeyword delegates to onNarrativeSubmit for all game-world routing
metrics:
  duration: 1min
  completed: "2026-03-07T23:50:00Z"
  tasks_completed: 1
  tasks_total: 1
---

# Quick Task 340: Unify Typed and Clicked Command Routing

Unified clickNpcKeyword to delegate to onNarrativeSubmit, eliminating duplicated craft/NPC/intent routing logic.

## What Changed

### Task 1: Unify clickNpcKeyword to delegate to onNarrativeSubmit

Refactored `clickNpcKeyword` from ~23 lines of duplicated routing logic down to ~10 lines with only click-specific guards:

1. **Skill choice guard** -- if pending skills and keyword matches, choose it (click-only)
2. **Creation input guard** -- if in creation or no character, route to creation (click-only)
3. **Delegate to onNarrativeSubmit** -- all game-world routing (craft, NPC conversation, farewell, intent) now shares the same code path as typed input

**Bugs fixed by unification:**
- Clicking an NPC name while in conversation now correctly routes to `talk_to_npc` (was incorrectly calling `submitIntentReducer`)
- Clicking "bye" while in conversation now correctly ends the conversation (was being sent as an intent)
- Clicking "craft" now goes through the same path as typing "craft"

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4c22d63 | Unify clickNpcKeyword to delegate to onNarrativeSubmit |

## Self-Check: PASSED
