---
phase: quick-15
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Each panel opens and closes independently of the Characters panel"
    - "Opening Inventory, Stats, Crafting, etc. works without Characters panel being open"
    - "Closing Characters panel does not hide any other open panels"
  artifacts:
    - path: "src/App.vue"
      provides: "Properly nested panel divs with independent visibility"
  key_links: []
---

<objective>
Fix missing closing `</div>` on the Character Panel that causes all subsequent panels to be nested inside it, making them invisible unless the Characters panel is also open.

Purpose: Panels added during quick task 13 multi-panel refactoring are incorrectly nested inside the Character Panel div due to a missing closing tag. This makes the entire multi-panel system non-functional — no panel can be opened independently.

Output: All panels render independently based on their own `panels.{id}.open` state.
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
  <name>Task 1: Fix missing closing div on Character Panel</name>
  <files>src/App.vue</files>
  <action>
In `src/App.vue`, the Character Panel block (starting at line ~120 with `v-if="panels.character && panels.character.open"`) is missing its closing `</div>` tag after the resize handles (line ~153). This causes every panel from Inventory through Track (lines 156-238) to be nested inside the Character Panel div, so they only render when the Character Panel is open.

The fix: Add a closing `</div>` tag after line 153 (after the last resize handle `<div :style="styles.resizeHandle" @mousedown.stop="startResize('character', $event, { right: true, bottom: true })" />`), before the Inventory Panel comment on line 155.

Additionally, there is a stale closing `</div>` on line 239 (after the Track Panel's closing div) that was the mismatched close for the character panel. This `</div>` on line 239 must be REMOVED because once the character panel has its own proper closing tag, this extra div will break the DOM structure.

Specifically:
1. After the character panel resize handle line ending with `startResize('character', $event, { right: true, bottom: true })" />`, add `</div>` on the next line.
2. Remove the orphaned `</div>` that currently appears on line 239 (between the Track Panel's closing `</div>` and the Travel panel div).

Do NOT change any other panel markup, visibility conditions, or component props.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to confirm no template compilation errors. Visually inspect the template to confirm every panel div that starts with `v-if="panels.X && panels.X.open"` has a matching closing `</div>` at the correct nesting level — none should be nested inside another panel's div.
  </verify>
  <done>
Each floating panel (Inventory, Hotbar, Friends, Stats, Crafting, Journal, Quests, Renown, Vendor, CharacterActions, Trade, Track) renders independently based on its own `panels.{id}.open` state, without requiring the Characters panel to be open.
  </done>
</task>

</tasks>

<verification>
- Open the app in browser
- Verify that Inventory, Stats, Crafting, and other panels can be opened from the ActionBar without the Characters panel being open
- Verify that closing the Characters panel does not close any other open panels
- Verify that the Characters panel itself still opens and closes correctly
</verification>

<success_criteria>
All panels open/close independently. No panel visibility is gated by another panel's state.
</success_criteria>

<output>
After completion, create `.planning/quick/15-fix-panel-visibility-bug-panels-incorrec/15-SUMMARY.md`
</output>
