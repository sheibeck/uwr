---
phase: 20-align-floating-hotbar-ability-activation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/ui/styles.ts
autonomous: true

must_haves:
  truths:
    - "Floating hotbar (ability activation) visually matches other floating panels with consistent header, body, and container styling"
    - "All ability activation functionality preserved: clicking abilities, cast bar fills, cooldown overlays, tooltips, disabled states"
    - "Hotbar panel is draggable via the standard floatingPanelHeader"
  artifacts:
    - path: "src/App.vue"
      provides: "Refactored floating hotbar using standard panel structure"
    - path: "src/ui/styles.ts"
      provides: "Removed or marked unused hotbarFloating/hotbarHandle/hotbarDock styles"
  key_links:
    - from: "src/App.vue"
      to: "src/ui/styles.ts"
      via: "styles.floatingPanel, styles.floatingPanelHeader, styles.floatingPanelBody references"
      pattern: "styles\\.floatingPanel"
---

<objective>
Align the floating hotbar (ability activation panel) styling with other floating panels.

Purpose: The floating hotbar where players click abilities during combat currently uses unique one-off styles (hotbarFloating, hotbarHandle, hotbarDock) that look visually inconsistent with all other floating panels which use the standard floatingPanel/floatingPanelHeader/floatingPanelBody pattern. After quick task 18 aligned the HotbarPanel (configuration panel), this is the remaining inconsistency.

Output: A floating hotbar that uses the same container, header, and body styling as every other floating panel while preserving all ability activation functionality.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue (lines 53-116 — the floating hotbar inline template)
@src/ui/styles.ts (hotbarFloating, hotbarHandle, hotbarDock, hotbarSlot styles + floatingPanel/floatingPanelHeader/floatingPanelBody)
@src/components/HotbarPanel.vue (reference for what "aligned" looks like after quick task 18)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor floating hotbar template to use standard panel structure</name>
  <files>src/App.vue, src/ui/styles.ts</files>
  <action>
In src/App.vue, refactor the floating hotbar block (lines 53-116) to use the standard floating panel pattern:

1. **Container**: Replace `styles.hotbarFloating` with `styles.floatingPanel` plus a new `styles.floatingPanelHotbar` override for the narrower width. The hotbar needs to be narrower than standard panels (~160px instead of 320px) since it only shows compact ability buttons. Add `data-panel-id="hotbar"` attribute for consistency with other panels.

2. **Header**: Replace the `styles.hotbarHandle` div with the standard `styles.floatingPanelHeader` div. Keep the "Hotbar" title text. The header already has `@mousedown="startDrag('hotbar', $event)"` which matches the pattern. Do NOT add a close button — the hotbar is always visible when a character is selected (same as group panel pattern).

3. **Body**: Replace `styles.hotbarDock` with `styles.floatingPanelBody` on the container div that wraps the ability slot buttons. The ability slot buttons inside should keep their existing `styles.hotbarSlot` styling (these are the individual ability buttons with cast bars and cooldowns, not the panel chrome).

4. **In src/ui/styles.ts**: Add a new `floatingPanelHotbar` style with just `width: '160px'` to override the default floatingPanel width. Remove `hotbarFloating`, `hotbarHandle`, and `hotbarDock` styles since they will no longer be used (the slot-level styles hotbarSlot, hotbarSlotActive, hotbarSlotEmpty, hotbarSlotText, hotbarCastFill, hotbarCooldownFill, hotbarCooldown remain unchanged).

5. **Preserve all functionality**: The v-for loop over hotbarDisplay, disabled logic, click handlers, tooltip handlers, cast bar fills, cooldown fills, and cooldown text must remain exactly as they are. Only the outer container/header/body wrapper styles change.

The result should look structurally identical to the group panel (lines 333-373) which also uses floatingPanel + floatingPanelCompact + floatingPanelHeader without a close button, with floatingPanelBody wrapping its content.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to confirm no TypeScript errors. Visually inspect that:
- The floating hotbar has the same dark background (#141821), border-radius (14px), border (rgba(255,255,255,0.12)), and box-shadow as other panels
- The "Hotbar" header has the same font weight, padding, and border-bottom as other panel headers
- Ability buttons inside still show cast progress bars, cooldown overlays, and tooltips correctly
- The hotbar is still draggable via the header
- Grep for "hotbarFloating", "hotbarHandle", "hotbarDock" in src/ returns zero results
  </verify>
  <done>
Floating hotbar uses floatingPanel + floatingPanelHotbar + floatingPanelHeader + floatingPanelBody pattern matching all other panels. Old hotbarFloating/hotbarHandle/hotbarDock styles removed. All ability activation functionality preserved.
  </done>
</task>

</tasks>

<verification>
- `npx vue-tsc --noEmit` passes with no errors
- No references to hotbarFloating, hotbarHandle, or hotbarDock remain in codebase
- Floating hotbar visually consistent with group panel and other floating panels
- Ability clicking, cast bars, cooldowns, tooltips all functional
</verification>

<success_criteria>
The floating hotbar (ability activation panel) uses the same floatingPanel/floatingPanelHeader/floatingPanelBody structure as every other floating panel in the application, with only a width override for its compact layout. All ability activation functionality is preserved.
</success_criteria>

<output>
After completion, create `.planning/quick/20-align-floating-hotbar-ability-activation/20-SUMMARY.md`
</output>
