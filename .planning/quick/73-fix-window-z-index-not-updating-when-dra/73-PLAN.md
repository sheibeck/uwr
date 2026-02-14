---
phase: quick-73
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
autonomous: true

must_haves:
  truths:
    - "Clicking a panel that is visually behind another panel brings it to the front"
    - "Dragging a panel by its header brings it to the front above all other panels"
    - "Clicking anywhere in a panel body brings it to the front"
  artifacts:
    - path: "src/composables/usePanelManager.ts"
      provides: "Fixed bringToFront z-index logic"
      contains: "bringToFront"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/usePanelManager.ts"
      via: "@mousedown bringToFront and startDrag calls"
      pattern: "bringToFront|startDrag"
---

<objective>
Fix window z-index not updating when clicking or dragging panels.

Purpose: When multiple floating panels overlap, clicking or dragging a panel behind another should bring it to the front. Currently, the `bringToFront` early-return guard prevents z-index updates when panels share the same zIndex value (e.g., fresh sessions where all panels start at zIndex 10, or after server restore assigns identical values).

Output: Fixed `bringToFront` function that always brings the clicked panel to the visual front.
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
  <name>Task 1: Fix bringToFront early-return guard in usePanelManager</name>
  <files>src/composables/usePanelManager.ts</files>
  <action>
In `src/composables/usePanelManager.ts`, fix the `bringToFront` function.

**Root cause:** The early-return guard `if (panels[id].zIndex === topZ.value) return;` is too aggressive. When multiple panels share the same zIndex (common at initialization where all panels start at zIndex 10, or after server restore), clicking any of them hits the guard and returns without changing the z-index. This means no panel can ever be brought to front when panels share the same z-index value.

**Fix:** Remove the early-return guard entirely. The `bringToFront` function should always increment `topZ` and assign the new value to the panel. The z-index inflation from always incrementing is negligible (would need millions of clicks to approach problematic values).

Change the `bringToFront` function from:
```typescript
const bringToFront = (id: string) => {
    if (!panels[id]) return;
    if (panels[id].zIndex === topZ.value) return; // Already on top
    topZ.value += 1;
    panels[id].zIndex = topZ.value;
};
```

To:
```typescript
const bringToFront = (id: string) => {
    if (!panels[id]) return;
    topZ.value += 1;
    panels[id].zIndex = topZ.value;
};
```

The `syncTopZ` function and its call sites (after `loadFromStorage` and server sync) should remain unchanged -- they correctly establish the baseline after state restoration.

**Why not keep a smarter guard:** Any guard that checks equality against topZ will break when multiple panels share the same z-index. A guard that counts panels at topZ adds complexity for zero benefit. Simply always incrementing is the correct approach.
  </action>
  <verify>
1. Read `src/composables/usePanelManager.ts` and confirm the early-return guard line is removed from `bringToFront`.
2. Confirm `bringToFront` still has the null check (`if (!panels[id]) return;`).
3. Confirm `syncTopZ` function and its call sites are unchanged.
4. Run `npx vue-tsc --noEmit` (or the project's type check) to verify no type errors.
  </verify>
  <done>
The `bringToFront` function always increments `topZ` and assigns the new z-index to the panel, regardless of current z-index values. Clicking or dragging any panel reliably brings it to the visual front.
  </done>
</task>

</tasks>

<verification>
- Open the app with multiple overlapping panels
- Click on a panel that is visually behind another -- it should come to front immediately
- Drag a panel by its header -- it should jump to front during the drag
- Refresh the page, then click panels -- z-index stacking should work correctly from the first click
- With a fresh session (clear localStorage), open multiple panels and verify clicking brings them to front
</verification>

<success_criteria>
- Clicking any panel always brings it visually to the front of all other panels
- Dragging a panel header always brings the panel to the front
- No regression in panel position persistence or server sync behavior
</success_criteria>

<output>
After completion, create `.planning/quick/73-fix-window-z-index-not-updating-when-dra/73-SUMMARY.md`
</output>
