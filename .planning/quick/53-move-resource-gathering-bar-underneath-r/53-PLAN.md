---
phase: quick-53
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/LocationGrid.vue
autonomous: true
must_haves:
  truths:
    - "Resource gathering progress bar appears below the resource name, not to its right"
    - "Enemy pull progress bar also appears below the enemy name for visual consistency"
    - "Tile layout remains horizontal for name/level text, only progress bar drops to next line"
  artifacts:
    - path: "src/components/LocationGrid.vue"
      provides: "Column-wrapped progress bars in resource and enemy tiles"
  key_links: []
---

<objective>
Move resource gathering progress bar underneath the resource name instead of beside it.

Purpose: Short resource names like "Peat" cause the gathering progress bar to appear to the right of the name, creating visibility issues. The bar should span the full tile width underneath the name text for consistent readability.
Output: Updated LocationGrid.vue with progress bars rendered below tile text content.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/LocationGrid.vue
@src/ui/styles.ts (gridTile style definition around line 1378)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reflow resource and enemy tile progress bars to render below name text</name>
  <files>src/components/LocationGrid.vue</files>
  <action>
In LocationGrid.vue, modify both the enemy tile (lines ~20-55) and resource tile (lines ~63-88) to ensure the progress bar always renders below the name text, not beside it.

For the RESOURCE tile (lines 63-88):
- On the outer tile div (the one with `:style="node.state === 'depleted' ? styles.gridTileDepleted : styles.gridTile"`), add inline style overrides to force column layout: `flexDirection: 'column'` and `alignItems: 'flex-start'`. Merge these with the existing computed style using spread syntax.
- The progress bar div (lines 69-87) already has `width: '100%'` so it will naturally span the full tile width once the flex direction is column.

For the ENEMY tile (lines 20-54):
- Apply the same column layout override on the outer tile div to keep visual consistency. Add `flexDirection: 'column'` and `alignItems: 'flex-start'` as inline style overrides.
- Wrap the existing name/level span (line 29-31) and group count span (lines 32-34) in a single horizontal `<div>` with `display: 'flex'`, `alignItems: 'center'`, `gap: '0.3rem'` so those text elements remain side-by-side on one row, while the pull progress bar drops to the line below.

Do NOT modify styles.ts -- use inline style overrides only. Do NOT change the gridTile base style since it is shared across multiple tile types (players, NPCs, etc.).
  </action>
  <verify>
Run `npx vue-tsc --noEmit` or verify the app builds with `npm run build` (whichever is configured). Visually: resource tiles should show the name on top and the blue progress bar spanning the full tile width below. Enemy tiles should show name/level on top and amber pull bar below.
  </verify>
  <done>
Resource gathering progress bar renders underneath the resource name, spanning full tile width. Enemy pull progress bar renders underneath the enemy name/level text for consistency. Short names like "Peat" no longer cause the bar to appear awkwardly to the right.
  </done>
</task>

</tasks>

<verification>
- Resource tiles in the RESOURCES section show name text above and blue gathering progress bar below
- Enemy tiles in the ENEMIES section show name/level/count text above and amber pull progress bar below
- Tiles without active progress bars (no gathering/pulling) look unchanged -- just the name text
- Player and NPC tiles are unaffected (no style changes to shared gridTile in styles.ts)
</verification>

<success_criteria>
Progress bars for both resource gathering and enemy pulling render below the tile text content, spanning the full width of the tile. No regressions to other tile types.
</success_criteria>

<output>
After completion, create `.planning/quick/53-move-resource-gathering-bar-underneath-r/53-SUMMARY.md`
</output>
