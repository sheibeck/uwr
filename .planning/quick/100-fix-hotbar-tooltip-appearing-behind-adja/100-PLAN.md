---
phase: quick-100
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
autonomous: true
---

<objective>
Fix hotbar ability tooltip appearing behind adjacent floating panels.

Purpose: When hovering over hotbar ability slots, the tooltip with ability description appears behind other floating panels (e.g., group, location, inventory panels), making it unreadable. The root cause is that the tooltip z-index (1000) can be exceeded by floating panel z-indexes which increment without bound (starting at 10, +1 per click). In a typical play session with many panel interactions, panel z-indexes easily surpass 1000.

Output: Tooltip always renders above all floating panels and below only the context menu and overlays.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/ui/styles.ts — tooltip style with z-index 1000
@src/composables/usePanelManager.ts — bringToFront increments topZ without bound
@src/App.vue — tooltip rendering and floating panel structure
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix tooltip z-index and cap panel z-index counter</name>
  <files>src/ui/styles.ts, src/composables/usePanelManager.ts</files>
  <action>
Two changes needed:

1. In `src/ui/styles.ts`, increase the `tooltip` style's `zIndex` from `1000` to `50000`. This puts it well above any reachable panel z-index but below context menus (9999 — but actually context menus should also be above tooltips so this is fine; however context menu is 9999 which is below 50000).

Actually, re-examining the z-index hierarchy:
- Floating panels: dynamic, starts at 10, increments by 1
- Tooltip: currently 1000 (the problem)
- Context menu: 9999 (position: fixed)
- Pending spell overlay: 9000
- Rank up / gift overlays: 9999
- Footer: 10000 (position: relative)
- Splash/loading: 9999
- Death overlay: 70

The correct fix: Set tooltip z-index to `9998` — above all floating panels (which would need thousands of clicks to reach that high), but below context menus (9999) and the footer (10000). Context menus should render above tooltips since they're interactive, and the footer should also render above tooltips.

In `src/ui/styles.ts`, change `tooltip.zIndex` from `1000` to `9998`.

2. In `src/composables/usePanelManager.ts`, add a z-index ceiling to `bringToFront` to prevent z-indexes from growing without bound. When `topZ` reaches a high value (e.g., 5000), reset all panel z-indexes by recomputing them relative to their current ordering, starting from 10 again. This prevents the theoretical possibility of panels ever reaching tooltip z-index territory even in extremely long sessions.

In the `bringToFront` function, after incrementing `topZ.value`, add a check:
```typescript
if (topZ.value > 5000) {
  // Collect all panels with their current zIndex, sort by zIndex ascending
  const entries = Object.entries(panels).sort((a, b) => a[1].zIndex - b[1].zIndex);
  // Reassign z-indexes starting from 10
  entries.forEach(([pid, state], idx) => {
    state.zIndex = 10 + idx;
  });
  topZ.value = 10 + entries.length;
  // Re-apply the current panel on top
  panels[id].zIndex = topZ.value;
}
```

This ensures panel z-indexes stay in the low range (10-5000) and never approach the tooltip's 9998.
  </action>
  <verify>
1. Open the game, open multiple panels (hotbar, group, location, inventory)
2. Click several panels to increase their z-indexes
3. Hover over hotbar ability slots — tooltip should appear above all panels
4. Verify context menus still appear above tooltips (right-click an inventory item)
5. Verify command autocomplete still appears above tooltips (footer z-index 10000)
  </verify>
  <done>Hotbar ability tooltips always render above floating panels regardless of how many times panels have been clicked/reordered. Tooltip z-index is 9998, below context menus (9999) and footer (10000). Panel z-indexes are capped and reset when they reach 5000.</done>
</task>

</tasks>

<verification>
- Hover over any hotbar ability slot with multiple panels open and overlapping — tooltip is always visible on top
- Right-click context menus still render above the tooltip
- Command autocomplete dropdown still renders above everything (footer z-index 10000)
- Panel bring-to-front still works correctly after z-index reset
</verification>

<success_criteria>
- Tooltip z-index raised to 9998 in styles.ts
- Panel z-index ceiling implemented in usePanelManager.ts bringToFront
- No visual regression in z-index ordering of other UI elements (context menus, footer, overlays)
</success_criteria>

<output>
After completion, create `.planning/quick/100-fix-hotbar-tooltip-appearing-behind-adja/100-SUMMARY.md`
</output>
