---
phase: quick-293
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/App.vue]
autonomous: true
requirements: [FIX-PANELS-TDZ]

must_haves:
  truths:
    - "App.vue setup completes without ReferenceError"
    - "Panel manager (panels, openPanel, closePanelById, togglePanel, etc.) works identically to before"
    - "Trade panel auto-open/close and close-cancels-trade watchers still function"
  artifacts:
    - path: "src/App.vue"
      provides: "Fixed declaration order for usePanelManager"
  key_links:
    - from: "watch(() => panels.trade?.open)"
      to: "usePanelManager() destructuring"
      via: "panels const must be declared before watch getter evaluates"
      pattern: "const \\{ panels"
---

<objective>
Fix ReferenceError: Cannot access 'panels' before initialization in App.vue setup.

Purpose: The app crashes on load because a `watch()` getter at line ~1716 eagerly accesses `panels.trade?.open` during setup, but `panels` is not destructured from `usePanelManager()` until line ~1930. Vue evaluates watch getters immediately to establish reactive tracking, triggering JavaScript's Temporal Dead Zone (TDZ) error on the `const panels` binding.

Output: App.vue with usePanelManager block relocated before the first eager access of `panels`.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Relocate usePanelManager initialization above first eager panels access</name>
  <files>src/App.vue</files>
  <action>
Move the usePanelManager initialization block and its immediate dependents from their current location (~lines 1928-1962) to right after the `savePanelLayoutReducer` declaration (~line 1865). Specifically, move these blocks in order:

1. The `usePanelManager()` destructuring (the `const { panels, openPanels, togglePanel: togglePanelInternal, openPanel, closePanel: closePanelById, setPanelTab, bringToFront, startDrag, startResize, onMouseMove: onPanelMouseMove, onMouseUp: onPanelMouseUp, panelStyle, resetAllPanels } = usePanelManager(...)` block)

2. The `_resetPanelsCb.value = resetAllPanels;` wire-up line

3. The `provide('panelManager', ...)` call

4. The `togglePanel` wrapper function (`const togglePanel = (panelId: string) => { ... }`)

These must appear BEFORE the watch at ~line 1703 that accesses `() => activeTrade.value` (which calls `openPanel`/`closePanelById` in its callback) and critically BEFORE the watch at ~line 1715 that has `() => panels.trade?.open` as its getter (which Vue evaluates eagerly during setup, causing the TDZ crash).

The insertion point is right after `const savePanelLayoutReducer = useReducer(reducers.savePanelLayout);` (~line 1865) and before the `equippedStatBonuses` computed (~line 1867). Add a blank line separator before and after the moved block.

Do NOT change any logic, arguments, or function bodies — this is purely a declaration reordering fix.

Verify after moving that no other code between the old and new positions depends on anything that was below the old position. The code between (equippedStatBonuses computed, selectTrackedTarget function, offensiveTargetEnemyId ref/watch) does NOT reference panels/openPanel/closePanelById in eager contexts — selectTrackedTarget uses closePanelById inside a function body (lazy), so it's safe.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` from the project root to confirm no TypeScript errors. Then run `npx vite build` to confirm the app builds successfully. If a dev server is available, load the app in browser and confirm no console errors about "Cannot access 'panels' before initialization".
  </verify>
  <done>
App.vue loads without ReferenceError. The `panels` const from usePanelManager is declared before any watch() getter that accesses it. All panel functionality (open, close, toggle, trade auto-open/close, keyboard shortcuts) works identically.
  </done>
</task>

</tasks>

<verification>
- App starts without "Cannot access 'panels' before initialization" error
- Panel open/close/toggle works from toolbar buttons
- Trade panel auto-opens when a trade session starts
- Closing trade panel via X cancels the active trade
- Keyboard shortcuts (I, J, C, R, etc.) toggle panels correctly
</verification>

<success_criteria>
- Zero ReferenceError on app load
- TypeScript compilation passes
- All panel interactions behave identically to before the quick-291 refactoring
</success_criteria>

<output>
After completion, create `.planning/quick/293-fix-panels-before-initialization-referen/293-SUMMARY.md`
</output>
