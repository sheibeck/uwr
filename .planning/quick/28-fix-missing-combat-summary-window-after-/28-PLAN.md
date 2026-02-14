---
phase: quick-28
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "After solo combat victory with no loot, the Victory summary screen is visible until manually dismissed"
    - "After solo combat victory with loot, the Victory summary screen shows loot and dismiss button"
    - "Group combat results still work as before (leader dismisses)"
  artifacts:
    - path: "src/App.vue"
      provides: "Removed auto-dismiss watcher that immediately hid combat summary"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/useCombat.ts"
      via: "activeResult, activeLoot, dismissResults"
      pattern: "activeResult|dismissResults"
---

<objective>
Fix the combat summary window disappearing after combat ends. Currently, solo players never see the Victory/Defeat summary screen because an auto-dismiss watcher in App.vue immediately calls `dismissResults()` when there is no loot for the combat.

Purpose: Players should always see their combat summary (Victory/Defeat, fallen members, loot) and manually dismiss it.
Output: Modified App.vue with auto-dismiss watcher removed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/App.vue (lines 911-926: the auto-dismiss watcher)
@src/composables/useCombat.ts (activeResult, activeLoot, dismissResults)
@src/components/CombatPanel.vue (the combat result UI with Dismiss button)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove auto-dismiss watcher for solo combat results</name>
  <files>src/App.vue</files>
  <action>
Remove the watcher block at approximately lines 911-926 in src/App.vue that watches `[activeResult.value, hasAnyLootForResult.value, canDismissResults.value]` and auto-dismisses results when there's no loot for solo victories.

This watcher is the root cause: when a solo player wins a fight with no loot drops, `hasAnyLootForResult` is false, so the watcher immediately calls `dismissResults()` before the player ever sees the summary screen. Even for fights WITH loot, there is a potential race condition where result data arrives before loot data.

The full block to remove:
```
watch(
  () => [activeResult.value, hasAnyLootForResult.value, canDismissResults.value] as const,
  ([result, anyLoot, canDismiss]) => {
    if (!result || !canDismiss) return;
    if (selectedCharacter.value?.groupId) return;
    if (anyLoot) return;
    const summary = result.summary?.toLowerCase() ?? '';
    if (!summary.startsWith('victory')) return;
    const id = result.id.toString();
    if (lastAutoDismissCombatId.value === id) return;
    lastAutoDismissCombatId.value = id;
    dismissResults();
  }
);
```

Also remove the `lastAutoDismissCombatId` ref (approximately line 797) since it is only used by this watcher:
```
const lastAutoDismissCombatId = ref<string | null>(null);
```

Also remove `hasAnyLootForResult` from the useCombat destructure (approximately line 734) since nothing else uses it after the watcher is removed. However, keep it if anything else references it. Check first by searching for `hasAnyLootForResult` usage -- if it's only used in the removed watcher, remove it from the destructure.

Do NOT modify the CombatPanel.vue component, useCombat.ts, or any backend files. The Dismiss button in CombatPanel already works correctly for manual dismissal.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` from the project root to verify no TypeScript errors
2. Search the codebase for `lastAutoDismissCombatId` to confirm it is fully removed
3. Search for `hasAnyLootForResult` in App.vue to confirm it is removed (if unused elsewhere)
4. Verify the CombatPanel still receives `activeResult` and `canDismissResults` props
  </verify>
  <done>
The auto-dismiss watcher is removed. After combat ends (victory or defeat), the combat summary screen (with Victory/Defeat heading, fallen list, loot items, and Dismiss button) remains visible until the player manually clicks Dismiss. Group combat behavior is unchanged (leader still dismisses for the group). No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- After a solo combat victory with no loot, the "Victory" summary screen should appear and stay visible until "Dismiss" is clicked
- After a solo combat victory with loot, the loot items should appear with "Take" buttons and the "Dismiss" button
- After a solo combat defeat, the "Defeat" summary screen should appear (this was not affected by the bug since auto-dismiss only fired for victories, but verify it still works)
- Group combat results remain unchanged (leader clicks Dismiss)
- No TypeScript compilation errors
</verification>

<success_criteria>
Combat summary window (Victory/Defeat) is always visible after combat ends until manually dismissed by the player.
</success_criteria>

<output>
After completion, create `.planning/quick/28-fix-missing-combat-summary-window-after-/28-SUMMARY.md`
</output>
