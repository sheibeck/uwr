---
phase: quick-31
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - Victory/Defeat messages appear in the event log after combat ends
    - Loot panel shows actual loot items after combat victory with drops
    - Auto-dismiss only fires when there is no pending loot for the character
  artifacts:
    - path: src/App.vue
      provides: Fixed addLocalEvent call and conditional auto-dismiss
  key_links:
    - from: src/App.vue activeResult watcher
      to: useEvents.addLocalEvent
      via: positional arguments kind and message
      pattern: addLocalEvent combat
    - from: src/App.vue activeResult watcher
      to: dismissResults
      via: conditional auto-dismiss gated on pendingLoot
      pattern: pendingLoot.value.length
---

<objective>
Fix two bugs introduced in quick task 29 (loot system refactor):

1. Victory/Defeat messages not appearing in the event log
2. Loot panel always showing "No unclaimed loot" after combat

Purpose: Combat end feedback is completely broken — players get no log messages and no loot visibility after fights.
Output: Working victory/defeat log messages and functional loot panel with actual items after combat.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/29-refactor-loot-system-replace-combat-summ/29-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix addLocalEvent call syntax and conditional auto-dismiss</name>
  <files>src/App.vue</files>
  <action>
Two bugs in the activeResult watcher (around line 880-901 of App.vue):

**Bug 1 — Wrong addLocalEvent call syntax (line 895):**

Current (BROKEN):
```typescript
addLocalEvent({ kind: 'combat', message: logMessage });
```

The addLocalEvent function in useEvents.ts takes two positional arguments: (kind: string, message: string). Passing an object means kind receives [object Object] and message is undefined. The log entry is silently malformed.

Fix — change to positional arguments:
```typescript
addLocalEvent('combat', logMessage);
```

**Bug 2 — Auto-dismiss deletes loot before panel can show it (line 897-900):**

Current (BROKEN):
```typescript
setTimeout(() => {
  dismissResults();
}, 500);
```

The dismissResults() call triggers the server's dismiss_combat_results reducer, which deletes BOTH the CombatResult row AND all associated CombatLoot rows. The 500ms delay is not enough — by the time the loot panel auto-opens (via the pendingLoot.length watcher), the server has already deleted the loot rows, so pendingLoot computes to empty.

Fix — only auto-dismiss when there is no loot to claim. When loot exists, skip auto-dismiss entirely and let the player dismiss manually after claiming loot (or the loot panel Take actions will clean up loot rows one by one, and once all loot is taken the result can be dismissed).

Replace the setTimeout block with:
```typescript
// Only auto-dismiss if no loot dropped for this character.
// When loot exists, player dismisses after claiming items.
if (pendingLoot.value.length === 0) {
  setTimeout(() => {
    dismissResults();
  }, 500);
}
```

Note: pendingLoot is reactive and already imported from useCombat at line 734. It filters combatLoot by the selected character, so it correctly reflects only THIS character's unclaimed loot.

After these two changes, also verify the pendingLoot auto-open watcher (lines 915-922) is still correct — it should work as-is since it watches pendingLoot.value.length and opens the loot panel when count goes from 0 to positive. The fix above ensures the loot rows survive long enough for this watcher to fire.
  </action>
  <verify>
Run npx vue-tsc --noEmit from the project root to confirm no TypeScript errors.

Manually inspect the two changed lines:
1. addLocalEvent('combat', logMessage) — two positional string args, matches (kind: string, message: string) signature
2. if (pendingLoot.value.length === 0) guard wrapping the setTimeout — ensures dismiss only fires when no loot exists
  </verify>
  <done>
Victory/Defeat messages use correct positional addLocalEvent('combat', message) syntax.
Auto-dismiss is gated behind pendingLoot.value.length === 0 check so loot rows survive for the loot panel.
TypeScript compiles without errors.
  </done>
</task>

</tasks>

<verification>
1. npx vue-tsc --noEmit passes (no type errors)
2. In the activeResult watcher: addLocalEvent called with two string args, not an object
3. In the activeResult watcher: dismissResults() only called inside if (pendingLoot.value.length === 0) guard
4. The pendingLoot auto-open watcher (lines 915-922) is unchanged and still functional
</verification>

<success_criteria>
- addLocalEvent called with positional args matching (kind: string, message: string) signature
- Auto-dismiss gated on no pending loot — loot rows survive for panel display
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create .planning/quick/31-fix-loot-panel-and-victory-messages-loot/31-SUMMARY.md
</output>
