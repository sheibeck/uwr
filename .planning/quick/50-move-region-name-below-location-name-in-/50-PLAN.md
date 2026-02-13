---
phase: quick-50
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/TravelPanel.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Region name displays below the location name, not beside it"
    - "Font size for location name and region name is increased from current values"
    - "Directional arrows appear on each travel tile"
    - "No extra padding/margin above the TRAVEL section label"
  artifacts:
    - path: "src/components/TravelPanel.vue"
      provides: "Two-line layout with arrows and region below location name"
    - path: "src/ui/styles.ts"
      provides: "Updated gridSectionLabel marginTop and travel tile styles"
  key_links:
    - from: "src/components/TravelPanel.vue"
      to: "src/ui/styles.ts"
      via: "styles prop consumption"
      pattern: "styles\\.gridTileTravel|styles\\.gridSectionLabel"
---

<objective>
Restyle the Travel section in the Location panel: move region name below the location name (two-line layout), increase font sizes for readability, add directional arrows back to each travel tile, and remove the top margin above the TRAVEL section label.

Purpose: Improve travel area readability and restore visual navigation cues.
Output: Updated TravelPanel.vue and styles.ts
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/TravelPanel.vue
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restyle travel tiles with two-line layout, arrows, increased font, and remove TRAVEL label top margin</name>
  <files>src/components/TravelPanel.vue, src/ui/styles.ts</files>
  <action>
**In `src/ui/styles.ts`:**

1. In `gridSectionLabel` (line ~1370), change `marginTop: '0.5rem'` to `marginTop: '0rem'`. This removes padding above the TRAVEL label (it is the first section in the panel body, which already has 0.9rem padding). Note: this style is shared by LocationGrid sections (ENEMIES, RESOURCES, etc.) which appear below TRAVEL. Those sections still get spacing from the `gap: '0.45rem'` on `floatingPanelBody`. If removing the marginTop globally causes the other sections to look too tight, instead leave gridSectionLabel as-is and add a `:style="{ marginTop: 0 }"` override inline on the TRAVEL label div in TravelPanel.vue only.

2. In `gridTileTravel` (line ~1409), change the layout to support a two-line structure:
   - Change `alignItems: 'center'` to `alignItems: 'flex-start'` (so the arrow aligns to the top of the two-line text)
   - Keep `justifyContent: 'space-between'` (Go button on right)
   - Increase `fontSize` from `'0.88rem'` to `'0.95rem'`

**In `src/components/TravelPanel.vue`:**

1. Add directional arrows back. After the `sortedLocations` computed (line ~85), add:
   ```typescript
   const directionArrows = ['\u2191', '\u2192', '\u2193', '\u2190', '\u2197', '\u2198', '\u2199', '\u2196'];
   ```
   (These are: up, right, down, left, upper-right, lower-right, lower-left, upper-left)

2. Restructure each travel tile's inner content. Replace the current single-line flex div (lines 14-18) with a two-line layout:
   ```html
   <div style="display: flex; align-items: flex-start; gap: 0.4rem; min-width: 0; flex: 1;">
     <span :style="[entry.conStyle, { fontSize: '1rem' }]">{{ directionArrows[index % directionArrows.length] }}</span>
     <div style="display: flex; flex-direction: column; min-width: 0;">
       <div style="display: flex; align-items: baseline; gap: 0.35rem;">
         <span :style="[entry.conStyle, { fontSize: '0.95rem' }]">{{ entry.location.name }}</span>
         <span :style="[{ fontSize: '0.75rem' }, entry.conStyle]">L{{ entry.targetLevel }}</span>
       </div>
       <span :style="{ fontSize: '0.75rem', opacity: 0.5 }">{{ entry.regionName }}</span>
     </div>
   </div>
   ```
   The `v-for` needs `(entry, index)` to access the index for arrow selection.

3. Update the `v-for` on the tile div from `v-for="entry in sortedLocations"` to `v-for="(entry, index) in sortedLocations"`.

4. For the TRAVEL label, add inline marginTop override: change `<div :style="styles.gridSectionLabel">TRAVEL</div>` to `<div :style="[styles.gridSectionLabel, { marginTop: 0 }]">TRAVEL</div>` — this removes the top margin for TRAVEL specifically without affecting ENEMIES/RESOURCES/etc. labels in LocationGrid.
  </action>
  <verify>Run `npx vue-tsc --noEmit 2>&1 | head -30` to confirm no TypeScript errors. Visually confirm in the template that: (a) region name is on a second line below location name, (b) directional arrows are present, (c) TRAVEL label has no top margin override.</verify>
  <done>Travel tiles show location name + level on first line, region name on second line below. Directional arrow character appears at the left of each tile. Font sizes increased (~0.95rem for names). TRAVEL label has zero top margin.</done>
</task>

</tasks>

<verification>
- TravelPanel renders with two-line tile layout (name+level on top, region below)
- Each tile shows a directional arrow character on the left
- Font sizes are visibly larger than before (0.88rem -> 0.95rem for names)
- TRAVEL section label sits flush at top of panel body with no extra spacing
- LocationGrid section labels (ENEMIES, RESOURCES, etc.) are unaffected
- No TypeScript compilation errors
</verification>

<success_criteria>
1. Region name displays below location name in travel tiles
2. Directional arrows cycle through 8 arrow characters across tiles
3. Font size increased for location names
4. No padding/margin above TRAVEL label
5. No regressions in LocationGrid styling
</success_criteria>

<output>
After completion, create `.planning/quick/50-move-region-name-below-location-name-in-/50-SUMMARY.md`
</output>
