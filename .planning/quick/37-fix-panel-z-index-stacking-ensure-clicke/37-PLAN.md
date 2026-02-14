---
phase: quick-37
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
autonomous: true

must_haves:
  truths:
    - "Clicking any panel immediately brings it to the front (highest z-index) above all other panels"
    - "After page refresh, clicking any panel still reliably brings it to the front"
    - "Drag-clicking a panel header brings it to the front on the first click, not requiring a second click"
  artifacts:
    - path: "src/composables/usePanelManager.ts"
      provides: "Panel z-index management with topZ sync after load"
      contains: "Math.max"
  key_links:
    - from: "loadFromStorage"
      to: "topZ"
      via: "recalculate topZ after restoring saved zIndex values"
      pattern: "topZ\\.value.*Math\\.max"
---

<objective>
Fix the panel z-index stacking bug where clicking a panel does not always bring it to the front.

Purpose: The `topZ` counter (which tracks the next z-index to assign) starts at 10, but panels loaded from localStorage may have higher z-index values (e.g., 25). When `bringToFront` increments `topZ` from 10 to 11, the newly-clicked panel gets a LOWER z-index than panels restored from storage, so it appears behind them instead of in front.

Output: Patched usePanelManager.ts with topZ sync after storage/server load.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/usePanelManager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sync topZ counter after loading panel states from storage and server</name>
  <files>src/composables/usePanelManager.ts</files>
  <action>
The root cause: `topZ` initializes at 10 but `loadFromStorage` restores panels with potentially higher zIndex values (from a previous session). When `bringToFront` is called after load, it increments `topZ` from 10, assigning zIndex values LOWER than restored panels.

Fix in TWO places:

1. **After `loadFromStorage()` completes** (end of the function, after the try/catch): Add a `syncTopZ()` call. The `syncTopZ` helper should scan all `panels` entries and set `topZ.value` to the max of all `panel.zIndex` values (or 10, whichever is greater):

```typescript
const syncTopZ = () => {
  let max = 10;
  for (const state of Object.values(panels)) {
    if (state.zIndex > max) max = state.zIndex;
  }
  topZ.value = max;
};
```

Call `syncTopZ()` at end of `loadFromStorage()`, right after the try/catch block.

2. **After server sync restores panel states** (in the `watch` callback for serverPanelLayouts, inside the `finally` block, after `loadingFromServer.value = false`): Add `syncTopZ()` call. Even though server sync doesn't save/restore zIndex, the localStorage load may have already set high zIndex values, and the server sync watch fires on character change which could lead to stale topZ.

Also add a minor improvement: in `bringToFront`, add an early return if the panel is already at topZ (avoid unnecessary reactive updates that trigger save-to-storage):

```typescript
const bringToFront = (id: string) => {
  if (!panels[id]) return;
  if (panels[id].zIndex === topZ.value) return; // Already on top
  topZ.value += 1;
  panels[id].zIndex = topZ.value;
};
```

This early return also fixes the "double bringToFront" issue where both the header mousedown (via startDrag) and the outer div mousedown (via event bubbling) both call bringToFront, causing topZ to increment by 2 per click. With the guard, the second call is a no-op.
  </action>
  <verify>
1. Read the modified file and confirm `syncTopZ` is called after `loadFromStorage()` and after server layout watch.
2. Confirm `bringToFront` has the early-return guard for already-on-top panels.
3. Run `npx vue-tsc --noEmit` (or the project's type check command) to verify no TypeScript errors.
  </verify>
  <done>
- `topZ` is always >= the max zIndex of all loaded panels after any load operation
- `bringToFront(id)` always assigns a zIndex strictly higher than all other panels (guaranteed by topZ sync)
- Redundant double-bringToFront calls from mousedown bubbling are short-circuited
  </done>
</task>

</tasks>

<verification>
- Open the app with multiple panels open
- Click on a panel that is behind another panel -- it should come to the front immediately on first click
- Refresh the page (localStorage restore) and repeat -- clicking any panel should immediately bring it to the front
- Drag a panel by its header -- it should come to the front during the drag, not require a separate click first
</verification>

<success_criteria>
Clicking any panel (body or header) immediately brings it to the highest z-index, even after page refresh restores previously-saved panel z-index values.
</success_criteria>

<output>
After completion, create `.planning/quick/37-fix-panel-z-index-stacking-ensure-clicke/37-SUMMARY.md`
</output>
