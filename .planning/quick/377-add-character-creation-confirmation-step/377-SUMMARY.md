---
phase: quick-377
plan: 01
subsystem: character-creation
tags: [creation, ux, confirmation, state-machine]
dependency_graph:
  requires: []
  provides: [confirmation-step-in-creation]
  affects: [spacetimedb/src/reducers/creation.ts, spacetimedb/src/schema/tables.ts]
tech_stack:
  patterns: [state-machine-step, helper-extraction, race-condition-guard]
key_files:
  modified:
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/schema/tables.ts
decisions:
  - Handle "start over" directly in CONFIRMING case rather than through CONFIRMING_GO_BACK mechanism (simpler flow)
  - Re-check name uniqueness at confirmation time to guard against race conditions
  - Extract finalizeCharacter() helper to avoid duplicating the large finalization block
metrics:
  duration: 3min
  completed: 2026-03-08
---

# Quick Task 377: Add Character Creation Confirmation Step

Confirmation step between name entry and character creation showing race/class/ability/name summary with Confirm and Start Over options.

## Task Results

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add CONFIRMING step to creation state machine | 3398731 | spacetimedb/src/reducers/creation.ts, spacetimedb/src/schema/tables.ts |

## Changes Made

### CONFIRMING Step (creation.ts)

- **AWAITING_NAME**: After name validation passes, stores `characterName` on state and advances to `CONFIRMING` step instead of immediately creating the character. Displays a summary of race, class, ability, and name.
- **CONFIRMING case**: Accepts "confirm" (case-insensitive) to finalize character creation, or any go-back pattern (including "start over") to reset all state back to `AWAITING_RACE`.
- **finalizeCharacter() helper**: Extracted the entire character creation block (stats, insert, abilities, faction standings, world gen trigger) into a reusable function called from the CONFIRMING case.
- **Race condition guard**: Re-checks name uniqueness at confirmation time in case another player took the name while the current player was reviewing.
- **Resume handling**: Reconnecting players in CONFIRMING step see their summary again via `buildConfirmationSummary()`.
- **clearDataFromStep**: Added `AWAITING_NAME` target that clears only `characterName`.
- **determineGoBackTarget**: Added `CONFIRMING -> AWAITING_NAME` mapping.
- **Go-back exclusion**: CONFIRMING excluded from general go-back detection since it handles patterns directly.

### Schema Comment (tables.ts)

- Updated step comment to include CONFIRMING in the list of valid steps.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Name race condition guard**
- **Found during:** Task 1
- **Issue:** Between entering a name and confirming, another player could take the same name
- **Fix:** Added duplicate name re-check in the CONFIRMING "confirm" handler; if taken, resets to AWAITING_NAME
- **Files modified:** spacetimedb/src/reducers/creation.ts
- **Commit:** 3398731

## Verification

- TypeScript compiles without errors (0 errors in modified files; pre-existing errors in unrelated files only)
- CONFIRMING step exists in switch statement
- Character finalization only happens when player types "confirm"
- "Start Over" resets all state back to AWAITING_RACE
