---
phase: quick-51
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Every travel destination tile spans the full width of the Travel panel"
    - "All travel tiles have consistent sizing regardless of location name length"
  artifacts:
    - path: "src/ui/styles.ts"
      provides: "Full-width travel tile styling"
      contains: "width"
  key_links:
    - from: "src/components/TravelPanel.vue"
      to: "src/ui/styles.ts"
      via: "styles.gridTileTravel binding"
      pattern: "gridTileTravel"
---

<objective>
Make travel destination tiles always fill the full width of the Travel panel so they have consistent spacing and size, rather than shrink-wrapping to content width.

Purpose: Travel buttons currently use flex-wrap layout without explicit width, so tiles only take up as much space as their content. This creates inconsistent tile widths. Adding `width: '100%'` to `gridTileTravel` forces each tile to span the full container width.
Output: Uniform full-width travel tiles in the Travel panel.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/ui/styles.ts (lines 1404-1431 — gridWrap, gridTileTravel, gridTileGoButton)
@src/components/TravelPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add full-width to travel tile style</name>
  <files>src/ui/styles.ts</files>
  <action>
In `src/ui/styles.ts`, update the `gridTileTravel` style object (around line 1409) to add `width: '100%'`. This forces each travel tile to occupy the full width of the `gridWrap` flex container instead of shrink-wrapping to content.

The existing `gridWrap` uses `display: 'flex'` with `flexWrap: 'wrap'` and `gap: '0.4rem'`. By adding `width: '100%'` to each child tile, every tile will be on its own row at full width, creating consistent sizing.

No changes needed to `TravelPanel.vue` — the template already uses `:style="styles.gridTileTravel"` which will pick up the new width.
  </action>
  <verify>Open the app in browser — every travel destination tile in the Travel panel should span the full width of the panel, with no two tiles appearing side by side on the same row.</verify>
  <done>All travel tiles render at 100% width with consistent sizing regardless of location name length.</done>
</task>

</tasks>

<verification>
- Visual: Travel panel shows uniform full-width destination tiles
- No layout breakage in other grid sections (gridWrap is shared — but travel tiles are the only ones using gridTileTravel, so other tile types are unaffected)
</verification>

<success_criteria>
Travel destination tiles always fill the full panel width with consistent spacing and size.
</success_criteria>

<output>
After completion, create `.planning/quick/51-make-travel-buttons-always-fill-the-widt/51-SUMMARY.md`
</output>
