---
phase: quick-61
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
autonomous: true
must_haves:
  truths:
    - "User can drag a panel to a new position without it blinking back to the old position"
    - "Panel positions still persist to server for cross-device sync"
    - "Switching characters still loads that character's saved layout from server"
  artifacts:
    - path: "src/composables/usePanelManager.ts"
      provides: "Race-condition-free panel state management with optimistic local authority"
  key_links:
    - from: "src/composables/usePanelManager.ts"
      to: "server UiPanelLayout table"
      via: "saveToServer with dirty tracking"
      pattern: "localDirty|isDirty|pendingSave"
---

<objective>
Fix the panel position blinking caused by a race condition between local panel moves and server subscription sync.

Purpose: When the user moves a window, the server sync watcher can fire (from any UiPanelLayout table subscription update) and overwrite local state with stale server data before the 2.3-second debounced save completes. This causes panels to "blink" back to their old position.

Output: Modified `usePanelManager.ts` with local-authority pattern that prevents server data from overwriting active local changes.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/usePanelManager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add local-authority dirty tracking to prevent server overwrite during active moves</name>
  <files>src/composables/usePanelManager.ts</files>
  <action>
The root cause: The watcher on `serverPanelLayouts` (line 358-396) fires every time the reactive `uiPanelLayout` table updates from any subscription event. When it fires, it reads server data that may still have OLD positions (the 2.3s debounced save hasn't completed yet) and overwrites local state, causing the "blink back" effect.

Fix with a **local-authority dirty tracking** pattern:

1. Add a `dirtyUntil` ref (timestamp). When the user makes ANY local panel change (drag, resize, toggle), set `dirtyUntil = Date.now() + 3000` (3 seconds — enough to cover the 2.3s save pipeline plus server round-trip). This is simpler than tracking per-panel dirty state and covers the entire save cycle.

2. In the server sync watcher (the `watch` block starting at line 358), add an early return guard at the top of the callback:
   ```
   if (dirtyUntil.value > Date.now()) return;
   ```
   This prevents ANY server data from overwriting local state while the user has recently made changes and the save is still in-flight.

3. After `saveToServer` completes its timeout callback (inside the `window.setTimeout` at line 130), reset `dirtyUntil` to 0. But since we can't know when the server actually processes it, instead clear it in the server sync watcher itself: if the server data matches what we last sent (or enough time has passed), allow the sync.

   Actually, simpler approach: Just use the timestamp. The 3-second window covers:
   - 300ms localStorage debounce
   - 2000ms server save debounce
   - ~500ms server processing + subscription round-trip

   After 3 seconds, server data will reflect the latest save, so it's safe to accept.

4. Set `dirtyUntil` in these locations (where local panel state changes happen):
   - Inside `onMouseMove` when `dragState.value` is active (panel is being dragged) — set on every move event
   - Inside `onMouseMove` when `resizeState.value` is active (panel is being resized) — set on every move event
   - Inside `togglePanel`, `openPanel`, `closePanel` — set once per call

5. Do NOT set `dirtyUntil` in `loadFromStorage` or the server sync watcher itself (those are restore operations, not user actions).

6. Keep the existing `loadingFromServer` flag — it still serves its purpose of preventing the watch(JSON.stringify(panels)) from triggering a save-back-to-server when loading server data. The `dirtyUntil` guard is orthogonal: it prevents server data from overwriting local state.

Implementation details:
- Declare `const dirtyUntil = ref(0);` near the other refs (line 46 area)
- The DIRTY_WINDOW constant should be 3000 (3 seconds)
- In the server sync watcher, add the guard right after the `if (!charId || !layouts || layouts.length === 0) return;` check (around line 363)
  </action>
  <verify>
    1. Read the modified file and confirm:
       - `dirtyUntil` ref exists
       - Server sync watcher has the early-return guard checking `dirtyUntil`
       - `dirtyUntil` is set in drag/resize/toggle/open/close operations
       - `dirtyUntil` is NOT set in loadFromStorage or server sync watcher
    2. Run `npx vue-tsc --noEmit` from the project root to verify TypeScript compiles
  </verify>
  <done>
    - Panel drag/resize/toggle sets a 3-second dirty window
    - Server sync watcher skips applying server data while dirty window is active
    - TypeScript compiles without new errors
    - Existing save-to-server pipeline unchanged (still saves with 2.3s debounce)
    - Existing loadingFromServer guard still prevents save feedback loop
  </done>
</task>

</tasks>

<verification>
- Manual test: Move a panel, observe it stays at new position without blinking
- Manual test: Wait 5+ seconds after moving, then trigger another subscription event — panel should stay at saved position
- Manual test: Switch characters — layout should load from server correctly (dirtyUntil not set during character switch)
- Manual test: Reload page — layout should restore from server correctly
</verification>

<success_criteria>
- Panels do not blink back to old positions when dragged during active gameplay
- Panel positions still persist to server after the dirty window expires
- Character switching still loads the correct saved layout
- No TypeScript compilation errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/61-fix-window-position-blinking-race-condit/61-SUMMARY.md`
</output>
