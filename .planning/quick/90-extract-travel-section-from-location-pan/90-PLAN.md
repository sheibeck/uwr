---
phase: quick-90
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/components/ActionBar.vue
  - src/composables/usePanelManager.ts
autonomous: true

must_haves:
  truths:
    - "TravelPanel content no longer appears inside the Location panel body"
    - "A standalone Travel floating panel exists that can be toggled open/closed"
    - "A Travel button appears in the Action bar and toggles the Travel panel"
    - "The Location panel still shows location name, region, combat, and LocationGrid"
  artifacts:
    - path: "src/App.vue"
      provides: "Separated Travel panel as independent floating panel + Location panel without travel"
    - path: "src/components/ActionBar.vue"
      provides: "Travel button in action bar"
    - path: "src/composables/usePanelManager.ts"
      provides: "Updated always-open panel list if needed"
  key_links:
    - from: "src/components/ActionBar.vue"
      to: "src/App.vue"
      via: "emit('toggle', 'travelPanel')"
      pattern: "toggle.*travelPanel"
    - from: "src/App.vue"
      to: "src/components/TravelPanel.vue"
      via: "standalone floating panel wrapper with v-if"
      pattern: "panels\\.travelPanel.*open"
---

<objective>
Extract the Travel section from the Location panel into its own independent floating panel, and add a Travel button to the Action bar.

Purpose: The Location panel is growing too large. Separating Travel into its own panel gives users independent control over its visibility and position.
Output: TravelPanel as a standalone toggleable floating panel; Travel button in ActionBar; Location panel contains only location info, combat, and LocationGrid.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/components/ActionBar.vue
@src/components/TravelPanel.vue
@src/composables/usePanelManager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract TravelPanel into standalone floating panel and add ActionBar button</name>
  <files>
    src/App.vue
    src/components/ActionBar.vue
    src/composables/usePanelManager.ts
  </files>
  <action>
**In `src/App.vue`:**

1. Add a new panel key `travelPanel` to the `usePanelManager` defaults object (around line 1487), alongside existing panels. Use position `{ x: 600, y: 140 }` like other toggleable panels.

2. Remove the `<TravelPanel ... />` component (lines ~318-328) from inside the existing "travel" panel body (the Location panel). The Location panel body should only contain the `<template v-if="activeCombat">` block (CombatPanel) and the `<template v-else>` block with just `<LocationGrid>` (no TravelPanel before it).

3. Add a NEW standalone floating panel for TravelPanel, following the exact pattern of other toggleable panels (e.g., Renown panel at line ~227). Place it BEFORE the Track Panel comment block (before line ~261). Use this structure:

```html
<!-- Travel Panel -->
<div v-if="panels.travelPanel && panels.travelPanel.open" data-panel-id="travelPanel" :style="{ ...styles.floatingPanel, ...(panelStyle('travelPanel').value || {}) }" @mousedown="bringToFront('travelPanel')">
  <div :style="styles.floatingPanelHeader" @mousedown="startDrag('travelPanel', $event)"><div>Travel</div><button type="button" :style="styles.panelClose" @click="closePanelById('travelPanel')">x</button></div>
  <div :style="styles.floatingPanelBody"><TravelPanel :styles="styles" :conn-active="conn.isActive" :selected-character="selectedCharacter" :locations="connectedLocations" :regions="regions" :travel-cooldowns="travelCooldowns" :all-locations="locations" :location-connections="locationConnections" @move="moveTo" /></div>
  <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('travelPanel', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('travelPanel', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('travelPanel', $event, { right: true, bottom: true })" />
</div>
```

Use the multiplication sign character (x) for the close button, matching other panels.

**In `src/components/ActionBar.vue`:**

4. Add `'travelPanel'` to the `PanelKey` type union (line ~84-98).

5. Add a Travel button inside the `<template v-if="hasActiveCharacter">` block, after the Renown button and before the Loot button (between lines ~65 and ~66). Follow the exact pattern of other buttons:

```html
<button
  @click="emit('toggle', 'travelPanel')"
  :style="actionStyle('travelPanel')"
  :disabled="isLocked('travelPanel')"
>
  Travel
</button>
```

**In `src/composables/usePanelManager.ts`:**

6. In the `loadFromStorage` function (around line ~121-123), the "always ensure fixed panels start open" block currently forces `panels.travel.open = true`. Remove the `travelPanel` from being forced open (do NOT add `if (panels.travelPanel) panels.travelPanel.open = true;`). The old `travel` key (the Location panel) should remain forced open. Leave the `travel` always-open logic unchanged.

7. Similarly in the server sync watch (around line ~399-401), do NOT add `travelPanel` to the "always ensure fixed panels start open" list. The new travelPanel should be a normal toggleable panel.

**Important:** The existing `travel` panel key stays as-is -- it IS the Location panel and always stays open. The NEW `travelPanel` key is the extracted travel-only panel that toggles like Inventory, Stats, etc.
  </action>
  <verify>
    - Run `npx vue-tsc --noEmit` to verify no TypeScript errors
    - Visually confirm: Location panel no longer shows travel destinations
    - Visually confirm: Travel button appears in action bar
    - Visually confirm: Clicking Travel button opens a standalone Travel floating panel with destinations
    - Visually confirm: Travel panel can be closed with the X button and reopened via ActionBar
  </verify>
  <done>
    - TravelPanel removed from Location panel body
    - Standalone Travel floating panel renders with v-if toggle, draggable header, resize handles, close button
    - Travel button in ActionBar toggles the travelPanel
    - Location panel still shows location name, region info, combat, and LocationGrid
    - No TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. Location panel shows location name, region, time indicator, and LocationGrid (no travel section)
2. ActionBar has a "Travel" button that highlights when Travel panel is open
3. Clicking Travel button opens a floating Travel panel with all travel destinations, stamina costs, cooldown info
4. Travel panel can be closed with X, dragged by header, resized by handles
5. Actually traveling (clicking a destination) still works and moves the character
6. Cross-region confirmation dialog still works from the standalone Travel panel
7. Combat still shows correctly in the Location panel when in combat
</verification>

<success_criteria>
- Travel section fully extracted from Location panel into its own independent floating panel
- ActionBar Travel button toggles the panel
- All existing travel functionality preserved (destinations, stamina costs, cooldowns, cross-region confirmation)
- Location panel is slimmer, showing only location info + combat/enemies/resources
</success_criteria>

<output>
After completion, create `.planning/quick/90-extract-travel-section-from-location-pan/90-SUMMARY.md`
</output>
