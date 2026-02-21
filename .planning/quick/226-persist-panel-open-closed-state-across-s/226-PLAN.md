---
phase: quick-226
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
autonomous: true
requirements: [QUICK-226]

must_haves:
  truths:
    - "Panels that were open before camping out are open again after logging back in"
    - "localStorage state is not overwritten by stale server sync on character select"
  artifacts:
    - path: "src/composables/usePanelManager.ts"
      provides: "markDirty() call after loadFromStorage() when localStorage has panel state"
      contains: "markDirty"
  key_links:
    - from: "loadFromStorage()"
      to: "markDirty()"
      via: "conditional call after localStorage restore"
      pattern: "localStorage\\.getItem.*uwr\\.panelStates"
---

<objective>
Fix the race condition where server sync overwrites localStorage-restored panel open/closed state on character select.

Purpose: After camping out (saving panel state to localStorage on 300ms debounce), the server save may be stale if the user camped before the 2-second server save debounce completed. On login, loadFromStorage() correctly restores open state, but the server sync watcher fires when selectedCharacterId changes and overwrites panels[id].open with the stale server value. Calling markDirty() after loadFromStorage() blocks server sync for 3 seconds, giving localStorage authority.

Output: usePanelManager.ts with 3 additional lines after loadFromStorage() at the end of the composable.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Guard localStorage restore from server sync overwrite</name>
  <files>src/composables/usePanelManager.ts</files>
  <action>
At line 503 (the `loadFromStorage();` call near the end of the composable, just before the `return` block), insert the following 4 lines immediately after it:

```typescript
  // Load initial state
  loadFromStorage();
  // Guard: if localStorage has panel data, block server sync for 3s to protect
  // freshly-restored open/closed state. Server save debounce is 2s — user may have
  // camped before it completed, leaving server state stale.
  if (localStorage.getItem('uwr.panelStates')) {
    markDirty();
  }
```

The existing `// Load initial state` comment and `loadFromStorage();` call must remain. Only insert the guard block (4 lines: comment + if-statement) after them. Do not alter any other code.

Verify the markDirty function signature before inserting: it takes no arguments and sets dirtyUntil.value = Date.now() + 3000 (confirmed from the composable). The localStorage key 'uwr.panelStates' is confirmed as the key used by saveToStorage().
  </action>
  <verify>
1. TypeScript compiles without errors: `npx tsc --noEmit` from C:/projects/uwr
2. Visually confirm the inserted block appears between `loadFromStorage();` and `return {` in the file.
  </verify>
  <done>
The file contains a conditional markDirty() call immediately after loadFromStorage(), gated on localStorage.getItem('uwr.panelStates') being non-null. TypeScript reports no errors.
  </done>
</task>

</tasks>

<verification>
After the change:
- Panel open/closed state survives camp-out and login cycle (localStorage has authority for first 3 seconds)
- Fresh devices (no localStorage) still receive server sync immediately (guard only fires if key exists)
- No regression in panel position/size persistence (markDirty only affects sync direction, not save)
</verification>

<success_criteria>
- usePanelManager.ts has the guard block after loadFromStorage()
- TypeScript compiles cleanly
- The open/closed state race condition is closed: server sync cannot overwrite localStorage within 3 seconds of app init
</success_criteria>

<output>
After completion, create `.planning/quick/226-persist-panel-open-closed-state-across-s/226-01-SUMMARY.md`
</output>
