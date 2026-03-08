---
phase: quick-374
plan: 01
subsystem: quest-system
tags: [quest, abandonment, confirmation, ux]
dependency_graph:
  requires: []
  provides: [two-step-quest-abandon]
  affects: [intent-handler, quest-ux]
tech_stack:
  added: []
  patterns: [two-step-confirmation, prefix-ordering]
key_files:
  modified:
    - spacetimedb/src/reducers/intent.ts
decisions:
  - Handler order confirm-abandon > abandon > keep-quest prevents prefix collision
  - Warning includes NPC name lookup and colored clickable links
  - Keep Quest is a simple no-op reassurance message
metrics:
  duration: 2min
  completed: "2026-03-08T20:40:00Z"
---

# Quick 374: Quest Abandonment Confirmation with NPC Warning

Two-step abandon flow: [Abandon X] shows NPC relationship warning with colored confirm/cancel links; [Confirm Abandon X] executes deletion and -3 affinity penalty.

## What Changed

### Task 1: Two-step abandon confirmation in intent handler

Modified `spacetimedb/src/reducers/intent.ts` to split the abandon flow into three handlers:

1. **`confirm abandon <name>`** -- placed first to avoid prefix collision with `abandon`. Performs the actual quest deletion and -3 NPC affinity penalty (same logic as the old `abandon` handler).

2. **`abandon <name>`** -- now shows a warning message instead of immediately abandoning. Looks up the NPC name via `qt.npcId` and displays:
   - Orange warning header with quest name
   - "Your relationship with [NPC Name] will suffer." (when quest has an NPC)
   - "This quest may never be offered again."
   - Red `[Confirm Abandon QuestName]` and green `[Keep Quest]` clickable links

3. **`keep quest`** -- simple no-op that shows "You decide to continue your quest."

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 155400d | feat(quick-374): add two-step quest abandonment confirmation |

## Self-Check: PASSED
