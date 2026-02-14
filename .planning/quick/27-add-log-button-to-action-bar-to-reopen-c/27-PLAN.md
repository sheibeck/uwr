---
phase: quick-27
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ActionBar.vue
autonomous: true
must_haves:
  truths:
    - "User can reopen the log panel after closing it via the action bar"
    - "Log button appears in the action bar at all times (not gated by active character)"
    - "Log button shows active state when log panel is open"
  artifacts:
    - path: "src/components/ActionBar.vue"
      provides: "Log toggle button in action bar"
      contains: "emit('toggle', 'log')"
  key_links:
    - from: "src/components/ActionBar.vue"
      to: "usePanelManager.togglePanel('log')"
      via: "emit('toggle', 'log') -> App.vue @toggle handler"
      pattern: "emit\\('toggle',\\s*'log'\\)"
---

<objective>
Add a "Log" button to the action bar so users can reopen the log panel after closing it.

Purpose: Bug fix — users can close the log panel via the X button but have no way to reopen it, losing access to game events permanently until page reload.
Output: ActionBar.vue with a Log button that toggles the log panel.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/ActionBar.vue
@src/composables/usePanelManager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Log button to ActionBar</name>
  <files>src/components/ActionBar.vue</files>
  <action>
Add a "Log" button to ActionBar.vue. Place it BEFORE the Characters button (since the log is always visible, not character-gated). The button should:

1. Emit `@click="emit('toggle', 'log')"` — same pattern as all other buttons.
2. Use `:style="actionStyle('log')"` for active-state highlighting when the panel is open.
3. NOT be inside the `<template v-if="hasActiveCharacter">` block — the log panel renders regardless of character selection (it shows "Select or create a character" prompt when none is active).
4. Add `'log'` to the PanelKey type union for documentation completeness.

The button markup follows the exact same pattern as the existing Characters button:
```html
<button
  @click="emit('toggle', 'log')"
  :style="actionStyle('log')"
>
  Log
</button>
```

No changes needed in App.vue or usePanelManager — the panel key 'log' is already registered in the panel defaults (App.vue line ~1407) and togglePanel already handles it generically.
  </action>
  <verify>
1. Open the app in browser
2. Verify "Log" button appears in the action bar
3. Close the log panel via X button
4. Click "Log" button — panel should reopen
5. Click "Log" button again — panel should close (toggle behavior)
6. Verify Log button shows active styling when panel is open
  </verify>
  <done>Log button visible in action bar, toggles log panel open/closed, shows active state when panel is open</done>
</task>

</tasks>

<verification>
- Log button renders in ActionBar at all times
- Clicking Log button when log is closed reopens the log panel
- Clicking Log button when log is open closes the log panel
- Log button has active styling when panel is open (same as other panel buttons)
- No regression to other action bar buttons
</verification>

<success_criteria>
Users can recover their log panel after closing it via a clearly visible "Log" button in the action bar.
</success_criteria>

<output>
After completion, create `.planning/quick/27-add-log-button-to-action-bar-to-reopen-c/27-SUMMARY.md`
</output>
