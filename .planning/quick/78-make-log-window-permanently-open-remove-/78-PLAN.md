---
phase: quick-78
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/composables/usePanelManager.ts
  - src/components/ActionBar.vue
autonomous: true
must_haves:
  truths:
    - "Log panel has no close button in its header"
    - "Clicking the Log button in the action bar brings the log to front but cannot close it"
    - "Log panel remains open after page refresh and character switch"
    - "Log panel is always visible regardless of saved panel state"
  artifacts:
    - path: "src/App.vue"
      provides: "Log panel without close button"
    - path: "src/composables/usePanelManager.ts"
      provides: "Log panel forced open in all state restore paths"
    - path: "src/components/ActionBar.vue"
      provides: "Log button brings to front instead of toggling"
  key_links:
    - from: "src/components/ActionBar.vue"
      to: "usePanelManager"
      via: "emit('open', 'log') instead of emit('toggle', 'log')"
      pattern: "emit\\('open', 'log'\\)"
---

<objective>
Make the Log window permanently open by removing its close button and preventing it from being closed via the action bar toggle.

Purpose: The Log window is central to game communication and should always be visible. Users should not be able to close it.
Output: Log panel that cannot be closed, matching the existing pattern used for group/travel/hotbar panels.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/composables/usePanelManager.ts
@src/components/ActionBar.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make log panel permanently open across all three files</name>
  <files>src/App.vue, src/composables/usePanelManager.ts, src/components/ActionBar.vue</files>
  <action>
Three changes across three files:

**1. src/App.vue (line ~54):** Remove the close button from the log panel header.
Currently:
```html
<div :style="styles.floatingPanelHeader" @mousedown="startDrag('log', $event)">
  <div>Log</div>
  <button type="button" :style="styles.panelClose" @click="closePanelById('log')">x</button>
</div>
```
Change to (remove the button entirely):
```html
<div :style="styles.floatingPanelHeader" @mousedown="startDrag('log', $event)">
  <div>Log</div>
</div>
```

**2. src/composables/usePanelManager.ts:** Add `log` to the "always open" enforcement in TWO locations:
- `loadFromStorage()` around line 120-122 where group/travel/hotbar are forced open -- add: `if (panels.log) panels.log.open = true;`
- Server sync watcher around line 398-400 where group/travel/hotbar are forced open -- add: `if (panels.log) panels.log.open = true;`

**3. src/components/ActionBar.vue (line ~4):** Change the Log button from toggle to open-only behavior. Instead of emitting `('toggle', 'log')`, emit `('open', 'log')` so clicking it only brings the log to front without toggling it closed.
Currently:
```html
<button @click="emit('toggle', 'log')" :style="actionStyle('log')">Log</button>
```
Change to:
```html
<button @click="emit('open', 'log')" :style="actionStyle('log')">Log</button>
```
Then in **src/App.vue**, find where ActionBar emits are handled (line ~414):
```html
@toggle="togglePanel"
```
Add a second listener:
```html
@toggle="togglePanel"
@open="openPanel"
```
And update ActionBar's emit types to include the new `open` event:
```typescript
const emit = defineEmits<{
  (e: 'toggle', panel: string): void;
  (e: 'open', panel: string): void;
}>();
```

Also update the `actionStyle` function in ActionBar.vue to always show the Log button as "active" since it cannot be closed -- add a special case: if `panel === 'log'`, always apply the active style.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` (or the project's type check) to verify no TypeScript errors
2. Search App.vue for `closePanelById('log')` -- should find zero results
3. Search ActionBar.vue for `toggle.*log` -- should find zero results (now uses 'open')
4. Search usePanelManager.ts for `panels.log` in the always-open enforcement blocks -- should find it in both loadFromStorage and server sync
  </verify>
  <done>
Log panel has no close button, ActionBar Log button brings panel to front without toggling closed, log panel is forced open on every state restore (localStorage and server sync), Log button in action bar always shows active styling.
  </done>
</task>

</tasks>

<verification>
- Log panel header shows only "Log" text, no close/x button
- Clicking "Log" in action bar when log is already open does NOT close it (only brings to front)
- Refreshing the page keeps log panel open
- Switching characters keeps log panel open
- Log button in action bar always appears in "active" state
</verification>

<success_criteria>
Log panel cannot be closed by any user action. Close button removed, action bar toggle converted to open-only, panel manager enforces open state on all restore paths.
</success_criteria>

<output>
After completion, create `.planning/quick/78-make-log-window-permanently-open-remove-/78-SUMMARY.md`
</output>
