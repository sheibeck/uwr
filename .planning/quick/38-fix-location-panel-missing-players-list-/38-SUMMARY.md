---
phase: quick-38
plan: 01
subsystem: location-ui
tags:
  - ui-fix
  - location-panel
  - players-list
  - visibility

requires:
  - src/composables/useCharacters.ts (charactersHere computed)
  - src/components/LocationGrid.vue (location display)

provides:
  - Always-visible PLAYERS section in location panel
  - List includes all characters at location (except selected)
  - Empty state message for solo players

affects:
  - LocationGrid.vue component
  - useCharacters composable

tech-stack:
  added: []
  patterns:
    - "Always-visible UI sections with empty states"
    - "Inclusive character filtering (user's own + others)"

key-files:
  created: []
  modified:
    - src/composables/useCharacters.ts
    - src/components/LocationGrid.vue

decisions:
  - decision: "Remove active character filter from charactersHere computed"
    rationale: "Solo players and users with multiple characters need to see their own non-selected characters at the location"
    alternatives: "Could have created separate computed for 'all characters here' but simpler to fix existing one"
  - decision: "Mark disconnected using negative logic (NOT in active OR pending)"
    rationale: "Characters without active sessions or pending logouts should show disconnected indicator"
    alternatives: "N/A - follows existing disconnected pattern"
  - decision: "Always show PLAYERS section with empty state"
    rationale: "Matches user expectation that player list is permanent feature like ENEMIES and RESOURCES"
    alternatives: "Could hide when empty, but that's confusing UX"
  - decision: "Rename CHARACTERS to PLAYERS"
    rationale: "Clearer terminology - 'characters' could be confused with NPCs"
    alternatives: "N/A - PLAYERS is standard MMO terminology"

metrics:
  duration: "102s"
  completed_date: "2026-02-12"
---

# Quick Task 38: Fix Location Panel Missing Players List

**One-liner:** Always-visible PLAYERS section in location panel showing all characters at current location including user's own non-selected characters

## Overview

Fixed the location panel to always display a PLAYERS section showing characters at the current location. Previously, the section was hidden when `charactersHere` was empty, which happened frequently because: (1) it filtered out the user's own non-selected characters, (2) it required other players to be online with active characters at the same location. The fix makes the section always visible (like ENEMIES and RESOURCES sections) and includes the user's own non-selected characters.

## Changes Made

### Task 1: Fix charactersHere to include user's own non-selected characters

**Files modified:** `src/composables/useCharacters.ts`

**Changes:**
1. Removed the `activeCharacterIds` and `pendingLogoutIds` filter conditions from `charactersHere` computed (lines 101-110)
2. Now filters only by: same locationId AND not the selected character
3. Updated `charactersHereWithStatus` to mark characters as disconnected when NOT in activeCharacterIds AND NOT in pendingLogoutIds (line 114)

**Result:** All characters at the location (except the selected one) now appear. Active players' characters show normally, disconnected/idle characters show with the disconnected dot indicator.

**Commit:** `683e0ab` - fix(quick-38): include user's non-selected characters in charactersHere

### Task 2: Make CHARACTERS section always visible in LocationGrid

**Files modified:** `src/components/LocationGrid.vue`

**Changes:**
1. Removed `v-if="charactersHere.length > 0"` condition from CHARACTERS wrapper div (line 94)
2. Renamed section label from "CHARACTERS" to "PLAYERS" (line 95)
3. Added empty state message: "No other adventurers here." when `charactersHere.length === 0` (lines 95-97)
4. Removed `charactersHere.length === 0` from top-level empty state check (line 8)

**Result:** The location panel always displays a PLAYERS section. When other characters are present, they appear as clickable tiles. When no other characters are at the location, it shows "No other adventurers here."

**Commit:** `688b552` - feat(quick-38): make PLAYERS section always visible with empty state

## Verification

- Both tasks executed successfully
- TypeScript compilation has pre-existing errors unrelated to these changes
- Git log confirms both commits with proper messages
- Modified files implement the exact changes described in the plan

## Deviations from Plan

None - plan executed exactly as written.

## Impact

**User experience improvements:**
1. Solo players with multiple characters can now see their other characters at the same location
2. The PLAYERS section is always visible, eliminating confusion about where to find other players
3. Clear empty state message "No other adventurers here" when location is empty
4. Disconnected indicator shows on idle characters (not currently online)

**Technical improvements:**
1. Simpler filter logic in `charactersHere` computed (2 conditions instead of 3)
2. Consistent UI pattern - all grid sections (ENEMIES, RESOURCES, PLAYERS, NPCS) handle empty states
3. More inclusive character visibility aligns with multiplayer expectations

## Testing Notes

To test the fix:
1. Create multiple characters
2. Navigate first character to a location
3. Switch to second character and navigate to same location
4. Switch back to first character
5. Verify PLAYERS section shows the second character with disconnected indicator
6. Verify section shows "No other adventurers here" when alone at a location

## Self-Check: PASSED

**Files created:**
- N/A

**Files modified:**
- FOUND: src/composables/useCharacters.ts
- FOUND: src/components/LocationGrid.vue

**Commits exist:**
- FOUND: 683e0ab (Task 1)
- FOUND: 688b552 (Task 2)

All artifacts verified successfully.
