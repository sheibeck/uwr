---
phase: quick-39
plan: 01
subsystem: location-ui
tags:
  - bugfix
  - location-panel
  - players-list
  - active-filter

requires:
  - src/composables/useCharacters.ts (charactersHere computed)
  - activeCharacterIds computed (online character IDs)
  - pendingLogoutIds computed (30s disconnect grace period IDs)

provides:
  - PLAYERS section showing only active + recently-disconnected characters
  - Fully offline characters excluded from list
  - Disconnected indicator still appears on pending-logout characters

affects:
  - useCharacters composable

tech-stack:
  added: []
  patterns:
    - "Active-only filtering with grace period for disconnects"
    - "Set-based membership testing for character status"

key-files:
  created: []
  modified:
    - src/composables/useCharacters.ts

decisions:
  - decision: "Filter charactersHere to active OR pending-logout characters only"
    rationale: "Quick-38 removed ALL filtering, showing fully offline players. User requirement is to show only currently online characters and those within the 30-second disconnect timeout."
    alternatives: "Could have created separate computed, but better to fix the existing charactersHere filter"
  - decision: "Use Set.has() for activeCharacterIds and pendingLogoutIds lookup"
    rationale: "Both are already Sets, making membership testing O(1) efficient"
    alternatives: "N/A - existing pattern already established"

metrics:
  duration: "Manual completion after executor rate limit"
  completed_date: "2026-02-12"
---

# Quick Task 39: Fix Players List to Show Only Active and Recently Disconnected Characters

**One-liner:** Restore active + pending-logout filter to charactersHere to exclude fully offline players from PLAYERS section

## Overview

Fixed a bug introduced in Quick-38 where the PLAYERS list showed ALL characters at a location, including fully offline players. The correct behavior is to show only characters that are either (a) currently online (in `activeCharacterIds`) OR (b) within the 30-second disconnect grace period (in `pendingLogoutIds`). Fully offline characters should not appear in the list.

Quick-38 removed the active character filter entirely to fix a different issue (including user's own non-selected characters). This task restores the active + pending-logout filter while keeping all the Quick-38 improvements (always-visible section, empty state, "PLAYERS" label).

## Changes Made

### Task 1: Restore active + pending-logout filter to charactersHere computed

**Files modified:** `src/composables/useCharacters.ts`

**Changes:**
1. Added local variables for `activeCharacterIds` and `pendingLogoutIds` Sets (lines 103-104)
2. Added filter condition: `(activeIds.has(row.id.toString()) || pendingIds.has(row.id.toString()))` (line 109)
3. Filter now requires characters to be at the same location AND not the selected character AND (active OR pending-logout)

**Code change:**
```typescript
// Before (Quick-38):
const charactersHere = computed(() => {
  if (!selectedCharacter.value) return [];
  return characters.value.filter(
    (row) =>
      row.locationId === selectedCharacter.value?.locationId &&
      row.id !== selectedCharacter.value?.id
  );
});

// After (Quick-39):
const charactersHere = computed(() => {
  if (!selectedCharacter.value) return [];
  const activeIds = activeCharacterIds.value;
  const pendingIds = pendingLogoutIds.value;
  return characters.value.filter(
    (row) =>
      row.locationId === selectedCharacter.value?.locationId &&
      row.id !== selectedCharacter.value?.id &&
      (activeIds.has(row.id.toString()) || pendingIds.has(row.id.toString()))
  );
});
```

**Result:** PLAYERS section now shows only characters that are currently online OR within the 30-second disconnect timeout. Fully offline characters are hidden. The `charactersHereWithStatus` computed (which adds the disconnected indicator) continues to work correctly since it receives only active + pending-logout characters.

**Commit:** `cb87cff` - fix(quick-39): restore active + pending-logout filter to charactersHere

## Verification

- Task executed successfully
- TypeScript compilation shows pre-existing errors in App.vue (unrelated to this change)
- Git log confirms commit with proper message
- Modified file implements the exact change described in the plan

## Deviations from Plan

None - plan executed exactly as written.

## Impact

**User experience improvements:**
1. PLAYERS list no longer shows fully offline characters (clutter removed)
2. Active players appear normally (no indicator)
3. Recently disconnected players (< 30s ago) appear with disconnected dot indicator
4. Fully offline players (> 30s disconnected) are hidden from the list
5. Empty state "No other adventurers here" shows when no qualifying characters are present

**Technical improvements:**
1. Correct filtering logic restored after Quick-38 regression
2. Combines location + active-status filters in single computed
3. Maintains all Quick-38 improvements: always-visible section, empty state, "PLAYERS" label
4. Set-based membership testing remains efficient (O(1) lookups)

## Quick-38 vs Quick-39 Behavior Comparison

| State | Quick-38 Behavior | Quick-39 Behavior (Correct) |
|-------|-------------------|----------------------------|
| Active player at location | Shown ✅ | Shown ✅ |
| Disconnected < 30s at location | Shown with dot ✅ | Shown with dot ✅ |
| Fully offline player at location | **Shown ❌ (BUG)** | Hidden ✅ |
| Selected character | Hidden ✅ | Hidden ✅ |
| Empty location | "No other adventurers here" ✅ | "No other adventurers here" ✅ |

## Testing Notes

To test the fix:
1. Create two characters
2. Navigate both to the same location (both should appear in each other's PLAYERS list)
3. Log out one character
4. Within 30 seconds: Character should appear with disconnected dot indicator
5. After 30+ seconds: Character should disappear from the list (timeout expired)
6. Verify "No other adventurers here" shows when location is empty or all characters are fully offline

## Self-Check: PASSED

**Files created:**
- N/A

**Files modified:**
- FOUND: src/composables/useCharacters.ts

**Commits exist:**
- FOUND: cb87cff (Task 1)

All artifacts verified successfully.
