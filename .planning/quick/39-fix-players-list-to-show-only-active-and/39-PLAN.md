---
phase: quick-39
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCharacters.ts
autonomous: true

must_haves:
  truths:
    - "PLAYERS section shows characters that are currently online (active) at the same location"
    - "PLAYERS section shows characters in the 30-second disconnect grace period (pending logout) at the same location"
    - "PLAYERS section does NOT show characters that are fully offline (not active and not pending logout)"
    - "PLAYERS section still always renders (with empty state when no qualifying characters)"
    - "Disconnected dot indicator still appears on pending-logout characters"
  artifacts:
    - path: "src/composables/useCharacters.ts"
      provides: "Filtered charactersHere computed with active + pending-logout filter"
      contains: "activeCharacterIds|pendingLogoutIds"
  key_links:
    - from: "src/composables/useCharacters.ts"
      to: "src/components/LocationGrid.vue"
      via: "charactersHere prop (already wired)"
      pattern: "charactersHereWithStatus"
---

<objective>
Fix the PLAYERS list in the location panel to show only active and recently-disconnected characters, not all offline characters.

Purpose: Quick-38 removed the active character filter entirely from `charactersHere`, which now shows ALL characters at a location including those that are fully offline. The correct behavior is to show only characters that are (a) currently online (in activeCharacterIds) OR (b) within the 30-second disconnect timeout (in pendingLogoutIds). Fully offline characters should be hidden.

Output: Updated `charactersHere` computed in `useCharacters.ts` that filters to active + pending-logout characters only.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useCharacters.ts
@src/components/LocationGrid.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restore active + pending-logout filter to charactersHere computed</name>
  <files>src/composables/useCharacters.ts</files>
  <action>
Modify the `charactersHere` computed (lines 101-108) to re-add a filter condition that only includes characters which are either active or in the pending logout grace period. The current code filters only by locationId and not being the selected character:

```typescript
const charactersHere = computed(() => {
  if (!selectedCharacter.value) return [];
  return characters.value.filter(
    (row) =>
      row.locationId === selectedCharacter.value?.locationId &&
      row.id !== selectedCharacter.value?.id
  );
});
```

Change it to also require the character to be active OR pending logout:

```typescript
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

This restores the filter that quick-38 incorrectly removed, while keeping the quick-38 improvements intact:
- The PLAYERS section in LocationGrid.vue still always renders (no v-if on the wrapper)
- The section still shows "No other adventurers here." empty state
- The "PLAYERS" label (renamed from "CHARACTERS") remains
- The selectedCharacter exclusion remains (user's currently selected character is not shown)

The `charactersHereWithStatus` computed (lines 110-116) does NOT need changes. It already correctly marks characters as disconnected when they are NOT in activeCharacterIds but ARE in pendingLogoutIds. With the restored filter, the only characters that reach `charactersHereWithStatus` will be active (not disconnected) or pending-logout (disconnected = true, shown with dot indicator).
  </action>
  <verify>Run `npx vue-tsc --noEmit 2>&1 | head -5` to check for TypeScript errors in the modified file. Also visually confirm in the code that the filter includes the `activeIds.has(...) || pendingIds.has(...)` condition.</verify>
  <done>The `charactersHere` computed filters characters to only those that are (1) at the same location, (2) not the selected character, AND (3) either actively online or within the 30-second disconnect grace period. Fully offline characters are excluded from the PLAYERS list.</done>
</task>

</tasks>

<verification>
1. `charactersHere` computed includes the activeCharacterIds + pendingLogoutIds filter
2. LocationGrid.vue PLAYERS section still always renders (no regression from quick-38)
3. TypeScript compiles without new errors
</verification>

<success_criteria>
- Active (online) characters at the same location appear in the PLAYERS list
- Characters within the 30-second disconnect timeout appear with a disconnected dot indicator
- Fully offline characters (not active, not pending logout) do NOT appear
- Empty state "No other adventurers here." shows when no qualifying characters are present
- The PLAYERS section header is always visible regardless of character count
</success_criteria>

<output>
After completion, create `.planning/quick/39-fix-players-list-to-show-only-active-and/39-SUMMARY.md`
</output>
