---
phase: quick-345
plan: 01
subsystem: combat
tags: [combat, narration, round-resolution, spacetimedb]

requires:
  - phase: 30-03
    provides: "Round-based combat with triggerCombatNarration and combat_status events"
provides:
  - "Compact mechanical round summaries replacing per-round LLM narration"
  - "Instant round resolution with no LLM wait"
affects: [combat, narrative-console]

tech-stack:
  added: []
  patterns: ["HP snapshot diffing for compact combat summaries"]

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Attribute damage generically per-player rather than per-action to avoid multi-player attribution complexity"
  - "Keep victory/defeat/intro LLM narration intact; only remove mid-round narration"
  - "No client changes needed -- existing combat_status event kind handles the new summary format"

requirements-completed: [QUICK-345]

duration: 1min
completed: 2026-03-08
---

# Quick Task 345: Improve Narrative Combat Flow Summary

**Replaced per-round LLM narration with instant compact mechanical summaries using HP snapshot diffs and color-coded damage**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-08T04:30:00Z
- **Completed:** 2026-03-08T04:31:26Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Removed mid-round triggerCombatNarration call (kept intro/victory/defeat)
- Added compact mechanical round summary builder that emits combat_status events
- Summary includes player actions, ability usage, damage dealt/taken, deaths with color formatting
- Rounds now resolve instantly with no LLM wait between rounds

## Task Commits

1. **Task 1: Remove mid-round LLM narration and add compact mechanical summary** - `d6c7f23` (feat)
2. **Task 2: Clean up client round resolution injection** - No changes needed (verified client handles new flow correctly)

## Files Created/Modified
- `spacetimedb/src/reducers/combat.ts` - Removed mid-round triggerCombatNarration, added compact summary builder with HP diff attribution and color-coded damage output

## Decisions Made
- Attributed damage generically per-player (total delta from pre-snapshot) rather than per-action, since multi-player attribution would require per-action HP tracking not available in current architecture
- Kept victory/defeat/intro LLM narration intact -- only mid-round narration removed
- No client changes needed: existing combat_status event rendering in NarrativeConsole handles the multi-line summary format

## Deviations from Plan

None - plan executed exactly as written. Task 2 confirmed no client changes needed as anticipated by the plan.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Steps
- Combat intro/victory/defeat narration still uses LLM (as intended)
- Consider batching end-of-combat narration into a single summary if budget is a concern

---
*Quick Task: 345*
*Completed: 2026-03-08*
