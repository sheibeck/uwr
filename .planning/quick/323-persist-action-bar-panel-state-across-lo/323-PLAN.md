---
phase: quick-323
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
requirements: [PERSIST-PANEL-STATE]

must_haves:
  truths:
    - "Panels that were open before logout are still open after login"
    - "Panel positions and sizes are preserved across logout/login"
    - "Fixed panels (log, travel, hotbar, group) remain always-open regardless"
  artifacts:
    - path: "src/App.vue"
      provides: "Logout watcher that preserves panel state"
      contains: "selectedCharacterId.value = ''"
  key_links:
    - from: "src/App.vue logout watcher"
      to: "usePanelManager localStorage persistence"
      via: "not closing panels on logout preserves localStorage state"
      pattern: "!loggedIn"
---

<objective>
Preserve action bar panel open/closed state across logout and login cycles.

Purpose: Currently, logging out explicitly closes every open panel (lines 2273-2276 in App.vue), which saves the all-closed state to localStorage and server. When the user logs back in, all panels start closed. This is unnecessary because the game UI already hides panels via `v-if="selectedCharacter"` at the template level — they vanish visually without needing their `open` state mutated.

Output: Modified App.vue where the logout watcher no longer destroys panel open/closed state.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/composables/usePanelManager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove destructive panel-close loop from logout watcher</name>
  <files>src/App.vue</files>
  <action>
In `src/App.vue`, find the watcher near line 2268 that watches `[() => isLoggedIn.value, () => player.value?.activeCharacterId]`.

Inside the `if (!loggedIn)` branch (around lines 2271-2277), REMOVE the loop that closes all panels:

```typescript
// REMOVE these lines:
// Close all panels
for (const id of openPanels.value) {
  closePanelById(id);
}
```

Keep `selectedCharacterId.value = '';` and `return;` — those are still needed.

The resulting block should be:
```typescript
if (!loggedIn) {
  selectedCharacterId.value = '';
  return;
}
```

WHY this works: The game UI already conditionally renders panels with `v-if="selectedCharacter"`. When `selectedCharacterId` is cleared, `selectedCharacter` becomes null, and all character-dependent panels disappear from the DOM without their `open` state being mutated. The panel state remains in localStorage and on the server. When the user logs back in and selects a character, the panels reappear in their previous open/closed state because `usePanelManager.loadFromStorage()` ran at initialization and the server sync watcher restores state when `selectedCharacterId` changes.

Also remove the `// Close all panels` comment that precedes the deleted loop.
  </action>
  <verify>
1. Search App.vue for "Close all panels" — should not appear.
2. Search App.vue for the `closePanelById` call inside the `!loggedIn` branch — should not appear.
3. Confirm the `if (!loggedIn)` block still contains `selectedCharacterId.value = ''` and `return`.
4. Build check: `npm run build` (or equivalent) should succeed with no type errors.
  </verify>
  <done>The logout watcher no longer mutates panel open/closed state. Panels that were open before logout will be open after the next login, restored from localStorage and/or server sync.</done>
</task>

</tasks>

<verification>
- Open several panels (crafting, journal, renown, map)
- Log out
- Log back in, select same character
- All four panels should reopen in their previous positions
- Fixed panels (log, travel, hotbar, group) should also still be open
</verification>

<success_criteria>
Panel open/closed state survives a full logout/login cycle without any panels being lost.
</success_criteria>

<output>
After completion, create `.planning/quick/323-persist-action-bar-panel-state-across-lo/323-SUMMARY.md`
</output>
