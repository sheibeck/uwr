---
phase: quick-17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ContextMenu.vue
autonomous: true
must_haves:
  truths:
    - "Clicking 'Careful Pull' or 'Body Pull' on an enemy context menu initiates combat"
    - "Clicking 'Gather' on a resource context menu starts gathering"
    - "Clicking 'Talk' or 'Open Store' on an NPC context menu triggers the NPC interaction"
    - "Context menu closes after clicking an item"
    - "Clicking outside the context menu still closes it"
  artifacts:
    - path: "src/components/ContextMenu.vue"
      provides: "Working context menu with functional click handlers"
      contains: "data-context-menu"
  key_links:
    - from: "src/components/ContextMenu.vue"
      to: "item.action()"
      via: "handleItemClick called on @click"
      pattern: "handleItemClick"
---

<objective>
Fix context menu item clicks not firing action callbacks in ContextMenu.vue.

Purpose: The context menu renders correctly but clicking any item does nothing -- no combat starts, no gathering begins, no NPC interaction triggers. The root cause is that the outside-click handler closes the menu before the click event fires on menu items.

Output: Working ContextMenu.vue where clicking non-disabled items executes their action callbacks.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/ContextMenu.vue
@src/components/LocationGrid.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix ContextMenu outside-click handler race condition</name>
  <files>src/components/ContextMenu.vue</files>
  <action>
The bug is in ContextMenu.vue. The component registers a `mousedown` listener on `document` that calls `handleOutsideClick`. This handler checks `target.closest('[data-context-menu]')` to determine if the click was inside the menu. However, the context menu's root `<div>` element does NOT have the `data-context-menu` attribute. As a result, every mousedown -- including clicks on menu items themselves -- is treated as an "outside click" and closes the menu (sets `visible` to false). Since `mousedown` fires before `click`, the `v-if="visible"` removes the menu from DOM before the `@click="handleItemClick(item)"` event can fire. The action callback never executes.

Fix: Add `data-context-menu` attribute to the root `<div>` of the context menu (the one with `v-if="visible"`).

Specifically, change:
```html
<div
  v-if="visible"
  :style="{
    ...styles.contextMenu,
    left: `${clampedX}px`,
    top: `${clampedY}px`,
  }"
>
```
to:
```html
<div
  v-if="visible"
  data-context-menu
  :style="{
    ...styles.contextMenu,
    left: `${clampedX}px`,
    top: `${clampedY}px`,
  }"
>
```

This is the ONLY change needed. The event wiring from LocationGrid.vue -> App.vue is already correct:
- `@pull` -> `startPull` (from useCombat composable)
- `@gather-resource` -> `startGather` (calls startGatherResource reducer)
- `@hail` -> `hailNpc` (calls hailNpc reducer)
- `@open-vendor` -> `openVendor` (opens vendor panel)

All these handlers exist and work. The only issue is that `handleItemClick` in ContextMenu.vue never fires because the menu disappears first.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` to confirm no type errors.
2. Manual verification: Right-click an enemy in the location grid, click "Careful Pull" -- combat should initiate (log messages should appear, combat panel should activate).
3. Manual verification: Right-click a resource node, click "Gather" -- gathering progress bar should appear.
4. Manual verification: Click outside an open context menu -- it should still close properly.
  </verify>
  <done>Context menu item clicks execute their action callbacks. Enemy pull starts combat, resource gather starts gathering, NPC interactions work. Outside clicks still close the menu.</done>
</task>

</tasks>

<verification>
- Context menu appears on right-click of enemies, resources, and NPCs
- Clicking a non-disabled menu item calls its action and closes the menu
- Clicking outside the menu closes it without triggering any action
- Disabled items (grayed out) cannot be clicked
</verification>

<success_criteria>
All context menu actions functional: enemy pull initiates combat, resource gather starts gathering, NPC talk/store triggers interaction. No regressions in menu open/close behavior.
</success_criteria>

<output>
After completion, create `.planning/quick/17-fix-context-menu-handlers-wire-up-enemy-/17-SUMMARY.md`
</output>
