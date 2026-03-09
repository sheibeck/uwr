---
phase: quick-384
plan: 01
subsystem: abilities-command
tags: [abilities, skill-choice, narrative-ui]
dependency_graph:
  requires: [ability_template table, pending_skill table, useSkillChoice composable]
  provides: [missed ability detection in abilities command, choose ability keyword handler]
  affects: [intent.ts abilities handler, App.vue keyword routing]
tech_stack:
  patterns: [bracket-keyword clickable links, missed-level detection]
key_files:
  modified:
    - spacetimedb/src/reducers/intent.ts
    - src/App.vue
decisions:
  - Missed levels computed by comparing character.level vs levelsWithAbilities set
  - Pending skills check prevents duplicate generation requests
  - Reuses existing requestSkillGen from useSkillChoice composable
metrics:
  duration: 1min
  completed: 2026-03-09
---

# Quick Task 384: Add [choose ability] Links in Abilities Command

Missed-level ability detection in abilities command with clickable [choose ability] bracket keyword to trigger skill generation for catch-up picks.

## Changes Made

### Task 1: Add missed-ability detection to abilities command and client keyword handler

**Server-side (spacetimedb/src/reducers/intent.ts):**
- Refactored abilities command to detect missed ability levels (levels 1 through character.level without an ability pick)
- When missed levels exist and no pending skills: shows "Missed ability selections: Level X, Level Y" with [choose ability] clickable link
- When missed levels exist but pending skills exist: shows "select one of the offered skills first" message
- Handles zero-abilities case (shows "no abilities yet" plus the choose link if applicable)

**Client-side (src/App.vue):**
- Added `requestSkillGen` to useSkillChoice destructuring
- Added "choose ability" keyword handler in clickNpcKeyword (case 13) that calls requestSkillGen()

**Commit:** a72cdbc

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] spacetimedb/src/reducers/intent.ts exists
- [x] src/App.vue exists
- [x] Commit a72cdbc verified
