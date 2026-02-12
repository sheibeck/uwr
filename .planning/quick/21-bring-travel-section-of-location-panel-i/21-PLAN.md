---
phase: quick-21
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/TravelPanel.vue
  - src/App.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Travel section displays as grid tiles matching enemies/resources visual style"
    - "Each destination shows con-colored name, level, and region in a compact tile"
    - "Each tile has a Go button to travel to that location"
    - "No accordion wrapper around travel section - always visible like other sections"
    - "Travel section label uses same TRAVEL uppercase style as ENEMIES/RESOURCES"
  artifacts:
    - path: "src/components/TravelPanel.vue"
      provides: "Grid-based travel tiles with Go buttons"
    - path: "src/App.vue"
      provides: "Travel section rendered without accordion wrapper"
    - path: "src/ui/styles.ts"
      provides: "gridTileTravel style for travel-specific tile appearance"
  key_links:
    - from: "src/components/TravelPanel.vue"
      to: "src/ui/styles.ts"
      via: "styles prop"
      pattern: "styles\\.gridTile|styles\\.gridWrap|styles\\.gridSectionLabel"
    - from: "src/App.vue"
      to: "src/components/TravelPanel.vue"
      via: "component usage without accordion wrapper"
      pattern: "TravelPanel"
---

<objective>
Replace the Travel section's accordion + row-based miniMap layout with a grid tile layout matching the Enemies/Resources sections in LocationGrid. Keep Go buttons on each tile (no context menu needed since travel has a single action). Remove the `<details>` accordion wrapper so Travel is always visible like the other sections.

Purpose: Achieve visual consistency across all location panel sections.
Output: Travel section using gridWrap/gridTile pattern with Go buttons, no accordion.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/TravelPanel.vue
@src/components/LocationGrid.vue
@src/ui/styles.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor TravelPanel to grid tile layout with Go buttons</name>
  <files>src/components/TravelPanel.vue, src/ui/styles.ts</files>
  <action>
  **In `src/ui/styles.ts`:**
  Add a `gridTileTravel` style (before the closing `} as const`) for travel tiles. Base it on `gridTile` but use a slightly different accent -- a teal/cyan tint to differentiate from the blue enemy tiles and green NPC tiles:
  ```
  gridTileTravel: {
    background: 'rgba(100, 180, 220, 0.1)',
    border: '1px solid rgba(100, 180, 220, 0.25)',
    padding: '0.35rem 0.55rem',
    borderRadius: '8px',
    fontSize: '0.78rem',
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    userSelect: 'none',
    justifyContent: 'space-between',
  }
  ```

  Also add a `gridTileGoButton` style for the compact Go button inside each tile:
  ```
  gridTileGoButton: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#e6e8ef',
    padding: '0.15rem 0.45rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.7rem',
    flexShrink: 0,
  }
  ```

  **In `src/components/TravelPanel.vue`:**
  Replace the entire template with a grid tile layout:
  1. Remove the miniMap container and miniMapRow structure entirely.
  2. Use the same section pattern as LocationGrid:
     - `<div :style="styles.gridSectionLabel">TRAVEL</div>` as the header
     - `<div :style="styles.gridWrap">` wrapping the tiles
  3. Each destination becomes a tile using `gridTileTravel` style:
     - Left side: con-colored location name + level badge `L{level}` + region name in smaller muted text
     - Right side: a compact "Go" button using `gridTileGoButton` style
  4. Keep all existing logic: `mappedConnections` computed, `conStyleForDiff`, region lookup, sort by level.
  5. The "Go" button emits `move` with `entry.location.id`, disabled when `!connActive || entry.location.id === selectedCharacter.locationId`.
  6. Remove the direction arrows -- they were arbitrary visual dressing (cycling through arrow chars).

  The tile content layout should be:
  ```html
  <div :style="styles.gridTileTravel">
    <div style="display: flex; align-items: baseline; gap: 0.4rem; min-width: 0;">
      <span :style="entry.conStyle">{{ entry.location.name }}</span>
      <span :style="{ fontSize: '0.65rem', opacity: 0.6 }">{{ entry.regionName }}</span>
      <span :style="[{ fontSize: '0.65rem' }, entry.conStyle]">L{{ entry.targetLevel }}</span>
    </div>
    <button :style="styles.gridTileGoButton" @click="..." :disabled="...">Go</button>
  </div>
  ```

  Keep the "Select a character to travel." empty state as-is.
  </action>
  <verify>Run `npx vue-tsc --noEmit 2>&1 | head -5` to check for TypeScript errors in the modified files. Visually confirm the template uses gridSectionLabel, gridWrap, and gridTileTravel styles.</verify>
  <done>TravelPanel renders as grid tiles with TRAVEL section label, con-colored names, compact Go buttons, no miniMap rows, no direction arrows.</done>
</task>

<task type="auto">
  <name>Task 2: Remove accordion wrapper from Travel section in App.vue</name>
  <files>src/App.vue</files>
  <action>
  In `src/App.vue`, find the `<details>` block wrapping TravelPanel (around lines 299-313):
  ```html
  <details :style="styles.accordion" :open="accordionState.travel" @toggle="onTravelAccordionToggle">
    <summary :style="styles.accordionSummary">Travel</summary>
    <TravelPanel ... />
  </details>
  ```

  Replace with just the bare `<TravelPanel>` component (no `<details>`, no `<summary>`):
  ```html
  <TravelPanel
    :styles="styles"
    :conn-active="conn.isActive"
    :selected-character="selectedCharacter"
    :locations="connectedLocations"
    :regions="regions"
    @move="moveTo"
  />
  ```

  The TRAVEL section label is now rendered inside TravelPanel itself (from Task 1), so no external heading needed.

  Then clean up accordion state related to travel:
  1. Remove `travel` from the `AccordionKey` type union (search for `type AccordionKey`).
  2. Remove `travel: true` from the `accordionState` reactive object initialization.
  3. Remove the `onTravelAccordionToggle` function entirely.
  4. Remove `travel` from the localStorage persistence logic if present (in `persistAccordionState` / `loadAccordionState` functions).

  If `AccordionKey` type and `accordionState` only had `travel` and `enemies` (from quick-16 summary), removing `travel` leaves just `enemies`. That is fine.
  </action>
  <verify>Run `npx vue-tsc --noEmit 2>&1 | head -5` to check for TypeScript errors. Search App.vue for any remaining references to `accordionState.travel` or `onTravelAccordionToggle` -- there should be none.</verify>
  <done>Travel section renders directly without accordion wrapper. No accordion toggle state for travel. AccordionKey type no longer includes 'travel'.</done>
</task>

</tasks>

<verification>
- TravelPanel displays grid tiles matching the visual pattern of enemies/resources in LocationGrid
- Each tile shows con-colored destination name, region, level, and a Go button
- Go buttons work (emit move event with location ID)
- No accordion around the travel section
- No TypeScript errors introduced
- Other sections (enemies, resources, NPCs, characters) are unaffected
</verification>

<success_criteria>
Travel section visually consistent with other location panel sections: uses gridSectionLabel for the TRAVEL header, gridWrap for the tile container, and gridTileTravel for each destination tile. Go buttons functional. Accordion removed entirely.
</success_criteria>

<output>
After completion, create `.planning/quick/21-bring-travel-section-of-location-panel-i/21-SUMMARY.md`
</output>
