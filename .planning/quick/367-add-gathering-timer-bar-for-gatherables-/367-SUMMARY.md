---
phase: quick-367
plan: 01
subsystem: ui/narrative
tags: [gathering, progress-bar, narrative-console, bug-fix]
dependency_graph:
  requires: []
  provides: [narrative-gathering-progress, narrative-looting-progress]
  affects: [NarrativeConsole, LocationGrid, App]
tech_stack:
  patterns: [emit-relay, computed-progress, inline-progress-bar]
key_files:
  modified:
    - src/App.vue
    - src/components/NarrativeConsole.vue
    - src/components/LocationGrid.vue
decisions:
  - Emit-relay pattern for quest item cast (LocationGrid emits progress to App, App passes as prop to NarrativeConsole)
  - Reuse same progressBar helper (unicode block characters) in NarrativeConsole as LocationGrid
metrics:
  duration: 4min
  completed: "2026-03-08"
---

# Quick Task 367: Add Gathering Timer Bar for Gatherables

Inline narrative progress bars for resource gathering (blue) and quest item looting (gold), plus keyword gather bug fix that prevented progress bar display.

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | 27852bf | Pass gathering/looting state to NarrativeConsole and fix keyword gather bug |
| 2 | 22d985c | Add gathering/looting progress bars to NarrativeConsole and LocationGrid emit |

## Changes Made

### Task 1: App.vue - State plumbing and bug fix
- **Bug fix:** Keyword `[gather Resource]` now sets `localGather` before calling reducer (was missing, so no progress bar showed)
- Added `activeGatheringInfo` computed that derives name + progress from localGather + resourceNodesHere
- Added `localQuestItemCast` ref and `onQuestItemCastUpdate` handler for quest item cast relay
- Passed `gathering-state` and `quest-item-cast-state` props to NarrativeConsole
- Wired `@quest-item-cast-update` emit from LocationGrid
- Added narrative events: "You begin gathering X..." on start, "You gathered X." on completion

### Task 2: NarrativeConsole.vue + LocationGrid.vue - Progress bars and emit
- Added `gatheringState` and `questItemCastState` optional props to NarrativeConsole
- Added `progressBar` helper (unicode block fill, same as LocationGrid)
- Added inline progress bar templates before LLM processing indicator
- Added `quest-item-cast-update` emit definition to LocationGrid
- LocationGrid now emits progress during quest item cast interval and on completion/cancellation

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
