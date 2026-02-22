---
phase: 283-unify-right-click-context-menu-look-and
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ContextMenu.vue
  - src/components/CharacterInfoPanel.vue
  - src/App.vue
autonomous: true
requirements: [QUICK-283]

must_haves:
  truths:
    - "Right-clicking an inventory bag item shows the styled context menu (dark translucent bg, rounded, blurred)"
    - "Right-clicking an ability in CharacterInfoPanel shows the same visual shell as the inventory context menu"
    - "Right-clicking a hotbar slot shows the same visual shell as the inventory context menu"
    - "All three context menus close on Escape and outside-click"
  artifacts:
    - path: "src/components/ContextMenu.vue"
      provides: "Shared context menu with optional default slot for custom body content"
      contains: "<slot />"
    - path: "src/components/CharacterInfoPanel.vue"
      provides: "Ability right-click menu using ContextMenu component"
    - path: "src/App.vue"
      provides: "Hotbar right-click menu using ContextMenu component"
  key_links:
    - from: "src/components/CharacterInfoPanel.vue"
      to: "src/components/ContextMenu.vue"
      via: "import and <ContextMenu> usage"
    - from: "src/App.vue"
      to: "src/components/ContextMenu.vue"
      via: "import and <ContextMenu> usage"
---

<objective>
Unify all three right-click context menus to use the shared ContextMenu component and matching visual styles.

Purpose: The InventoryPanel already uses the correct ContextMenu component with shared styles. CharacterInfoPanel and App.vue hotbar use inline hand-rolled divs with different hardcoded colors and layout. This creates visual inconsistency.

Output: ContextMenu.vue extended with an optional default slot; CharacterInfoPanel and App.vue both migrated to use it.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/ui/styles.ts
@src/components/ContextMenu.vue
@src/components/InventoryPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend ContextMenu with optional default slot</name>
  <files>src/components/ContextMenu.vue</files>
  <action>
Add an optional default `<slot />` between the subtitle/title section and the items list. This lets callers inject custom body content (ability stats, descriptions) while retaining the shared shell (background, border, border-radius, shadow, z-index, clamped positioning, outside-click/Escape close).

The slot should appear after the title/subtitle block and before the items list. Wrap it in a `<template v-if="$slots.default">` guard so existing callers (InventoryPanel) are unaffected.

No other changes to existing behavior. Keep all existing props, clamping logic, outside-click and Escape handlers.

The current styles.contextMenu in styles.ts is already the canonical style:
- background: rgba(12, 16, 24, 0.95)
- border: 1px solid rgba(255,255,255,0.18)
- borderRadius: 10px
- boxShadow: 0 8px 32px rgba(0,0,0,0.6)
- backdropFilter: blur(12px)
Do not change styles.ts — it is already correct.
  </action>
  <verify>Existing inventory right-click menu renders identically to before (InventoryPanel passes items array, no slot used).</verify>
  <done>ContextMenu.vue has a `&lt;slot /&gt;` block between subtitle and items list, wrapped in a `$slots.default` guard.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate CharacterInfoPanel ability context menu to ContextMenu component</name>
  <files>src/components/CharacterInfoPanel.vue</files>
  <action>
Remove the inline hand-rolled `<div v-if="contextMenu.visible" ...>` block (lines ~148-211) and replace with `<ContextMenu>`.

The ability context menu has custom body content (cost/cast/cooldown stats rows + description) and one action item ("Add to Hotbar"). Map as follows:

- `title`: `contextMenu.name` (ability name)
- `subtitle`: omit (no subtitle for abilities)
- `items`: `[{ label: 'Add to Hotbar', action: onAddToHotbar }]`
- default slot content: the cost/cast/cooldown rows and description block

For the slot content, keep the same text/values but adopt the contextMenuItem font sizing (0.8rem) and contextMenuSubtitle color (rgba(230,232,239,0.55)) from styles. Use inline styles that match `styles.contextMenuSubtitle` values for the stats section:
  - padding: '0.3rem 0.75rem'
  - fontSize: '0.75rem'
  - color: 'rgba(230,232,239,0.55)'
  - lineHeight: '1.5'
And a divider after the stats if a description is present: `borderBottom: '1px solid rgba(255,255,255,0.08)'`

The description block (if present) should use the same padding/color as contextMenuSubtitle with `whiteSpace: 'normal'` and `maxWidth: '220px'`.

Add `import ContextMenu from './ContextMenu.vue'` at the top of the script block.

Pass `:styles="styles"` — CharacterInfoPanel already receives `styles` as a prop so it is available.

The old `hideContextMenu` was triggered by `@mouseleave`. With ContextMenu component the outside-click and Escape handlers in ContextMenu handle closing. Wire `@close="hideContextMenu"` on the `<ContextMenu>` element.

Remove the old `@mouseleave` close approach.
  </action>
  <verify>Right-clicking an ability in the Abilities tab shows a context menu matching the inventory item context menu visual style (dark translucent, rounded, blurred). "Add to Hotbar" button is present and works. Escape closes it. Clicking outside closes it.</verify>
  <done>CharacterInfoPanel contains no inline context-menu div. It uses `&lt;ContextMenu&gt;` with slot content for ability stats and one action item.</done>
</task>

<task type="auto">
  <name>Task 3: Migrate App.vue hotbar context menu to ContextMenu component</name>
  <files>src/App.vue</files>
  <action>
Remove the inline `<div v-if="hotbarContextMenu.visible" ...>` block (lines ~564-607) and replace with `<ContextMenu>`.

The hotbar context menu has an optional description and one action item ("Remove from Hotbar"). Map as follows:

- `title`: `hotbarContextMenu.name`
- `subtitle`: omit
- `items`: `[{ label: 'Remove from Hotbar', action: () => { setHotbarSlot(hotbarContextMenu.slot, ''); hideHotbarContextMenu(); } }]`
- default slot (optional): if `hotbarContextMenu.description` is truthy, show it styled as:
  ```
  padding: '0.3rem 0.75rem 0.5rem'
  fontSize: '0.75rem'
  color: 'rgba(230,232,239,0.55)'
  lineHeight: '1.4'
  maxWidth: '220px'
  whiteSpace: 'normal'
  borderBottom: '1px solid rgba(255,255,255,0.08)'
  ```

Add `import ContextMenu from './components/ContextMenu.vue'` to App.vue imports (it likely does not import it yet — verify before adding).

Pass `:styles="styles"` (already available in App.vue scope).

Wire `@close="hideHotbarContextMenu"` on the `<ContextMenu>` element.

The positioning in App.vue used `getBoundingClientRect().right + 4` and `getBoundingClientRect().top` so the menu appears to the right of the hotbar slot. Keep passing those x/y values to `:x` and `:y` props — the ContextMenu clamping logic will handle viewport overflow.

Remove the old `@mouseleave="hideHotbarContextMenu"` approach (ContextMenu uses outside-click instead).
  </action>
  <verify>Right-clicking a hotbar slot with an ability shows a context menu matching the inventory item visual style. "Remove from Hotbar" removes the slot. Escape closes it. Clicking outside closes it. The description (if present) is shown in muted text above the action.</verify>
  <done>App.vue contains no inline hotbar context menu div. It uses `&lt;ContextMenu&gt;` component. Visual style matches InventoryPanel's context menu.</done>
</task>

</tasks>

<verification>
After all three tasks:
1. Open the game, navigate to inventory — right-click an item. Note the visual style (dark translucent, rounded 10px, blurred, white-ish border).
2. Open CharacterInfoPanel Abilities tab — right-click an ability. Confirm it looks identical to step 1.
3. Right-click a hotbar slot that has an ability. Confirm it looks identical to step 1.
4. In all three menus: press Escape → menu closes. Click outside → menu closes.
5. Verify no visual regressions in inventory context menu (it was already correct).
</verification>

<success_criteria>
- All three context menus share the same visual shell from ContextMenu.vue / styles.contextMenu
- CharacterInfoPanel and App.vue no longer contain inline hand-rolled context menu divs
- Outside-click and Escape close all three menus consistently
- No regressions in the InventoryPanel context menu behavior
</success_criteria>

<output>
After completion, create `.planning/quick/283-unify-right-click-context-menu-look-and/283-01-SUMMARY.md`
</output>
