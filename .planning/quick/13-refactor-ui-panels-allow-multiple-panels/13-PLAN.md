---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
  - src/App.vue
  - src/components/ActionBar.vue
  - src/components/LogWindow.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Multiple action bar panels can be open simultaneously"
    - "Each panel remembers its own position and size across page reloads"
    - "All floating panels (including Log) can be resized by dragging edges/corners"
    - "All floating panels can be dragged by their header to reposition"
    - "Log window is a movable and resizable floating panel"
    - "ActionBar buttons show active highlight for each currently-open panel"
  artifacts:
    - path: "src/composables/usePanelManager.ts"
      provides: "Centralized panel state management with per-panel position, size, visibility, drag, and resize logic"
    - path: "src/App.vue"
      provides: "Refactored template rendering multiple action-bar panels simultaneously via openPanels Set"
    - path: "src/components/ActionBar.vue"
      provides: "Updated to accept openPanels Set instead of single activePanel"
    - path: "src/ui/styles.ts"
      provides: "Resize handle styles for panel corners"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/usePanelManager.ts"
      via: "composable import"
      pattern: "usePanelManager"
    - from: "src/App.vue"
      to: "src/components/ActionBar.vue"
      via: "openPanels prop"
      pattern: "openPanels"
---

<objective>
Refactor the UI panel system from single-panel-at-a-time to multi-panel with per-panel resize and persistent state.

Purpose: Allow the user to arrange their workspace freely — opening inventory, stats, and crafting side by side, resizing each to preference, with all layout persisted across sessions.

Output: A composable-driven panel manager that handles position, size, drag, resize, visibility, and localStorage persistence for all floating panels including the Log window.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/components/ActionBar.vue
@src/components/LogWindow.vue
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create usePanelManager composable and add resize styles</name>
  <files>src/composables/usePanelManager.ts, src/ui/styles.ts</files>
  <action>
Create `src/composables/usePanelManager.ts` that centralizes ALL floating panel state management. This replaces the scattered `panelPos`, `groupPanelPos`, `travelPanelPos`, `hotbarPos`, and all their drag refs/handlers in App.vue.

The composable manages a registry of named panels. Each panel entry stores:
- `open: boolean` (visibility)
- `x: number`, `y: number` (position)
- `w: number`, `h: number` (size — 0 means "use CSS default / auto")
- `zIndex: number` (stacking order, incremented on focus)

Panel IDs include all action-bar panels (character, inventory, hotbar, friends, stats, crafting, journal, quests, renown) plus the fixed panels (group, travel, combat/location, log). Note: vendor, characterActions, trade, and track are "transient" panels that open programmatically — they also go through the same system.

**Key exports from the composable:**

```typescript
interface PanelState {
  open: boolean;
  x: number;
  y: number;
  w: number;  // 0 = auto/CSS default
  h: number;  // 0 = auto/CSS default
  zIndex: number;
}

function usePanelManager(defaults: Record<string, { x: number; y: number; w?: number; h?: number }>) {
  // Returns:
  // - panels: Reactive<Record<string, PanelState>>
  // - openPanels: ComputedRef<Set<string>> — set of open panel IDs
  // - togglePanel(id: string): void — open if closed, close if open
  // - openPanel(id: string): void — open and bring to front
  // - closePanel(id: string): void
  // - bringToFront(id: string): void — increment zIndex
  // - startDrag(id: string, event: MouseEvent): void
  // - startResize(id: string, event: MouseEvent, edges: { right?: boolean; bottom?: boolean; left?: boolean; top?: boolean }): void
  // - onMouseMove(event: MouseEvent): void — handles both drag and resize
  // - onMouseUp(): void
  // - panelStyle(id: string, extraStyles?: Record<string, any>): ComputedRef or object — returns { left, top, width?, height?, zIndex }
}
```

**Drag logic:** Same as existing — offset-based, clamped to >= 16px from edges.

**Resize logic:** On mousedown on a resize handle, record which edges are being resized (right, bottom, left, top). On mousemove, adjust w/h (and x/y for left/top edges). Enforce minimum size of 200x120. When w or h is 0 (auto), first resize initializes from the element's current clientWidth/clientHeight.

**Z-index management:** Track a `topZ` counter starting at 10. On `bringToFront(id)`, increment `topZ` and assign to panel. Called automatically on drag start, resize start, and panel open.

**Persistence:** On any state change (position, size, open/closed), debounce-write to `localStorage` key `uwr.panelStates`. On mount, read from localStorage and merge with defaults. The old `uwr.windowPositions` key should be migrated on first load: read old positions for group/panel/travel/hotbar, map them to the new panel IDs, then delete the old key.

**Fixed panels:** The travel/location panel, group panel, and hotbar are always rendered (not toggled via ActionBar). They use the same composable for position/size/drag/resize but their `open` state is not managed by ActionBar toggles. They start as `open: true` always.

**Default positions (matching current hardcoded values):**
- group: { x: 40, y: 140, w: 0, h: 0 }
- travel: { x: 1040, y: 110, w: 0, h: 0 }
- hotbar: { x: 120, y: 260, w: 0, h: 0 }
- character: { x: 980, y: 140, w: 0, h: 0 }
- inventory: { x: 980, y: 140, w: 0, h: 0 }
- (all other action-bar panels default similarly around x:600, y:140)
- log: { x: 40, y: 400, w: 500, h: 300 }

**In `src/ui/styles.ts`, add:**
- `resizeHandle`: positioned absolute at bottom-right corner, 12x12px, cursor: nwse-resize, with a subtle triangular grip indicator (use border-based CSS triangle or a small repeated diagonal line pattern via background gradient). Semi-transparent so it doesn't distract.
- `resizeHandleRight`: right edge resize strip, 4px wide, cursor: ew-resize, position absolute right:0 top:0 bottom:12px.
- `resizeHandleBottom`: bottom edge resize strip, 4px tall, cursor: ns-resize, position absolute bottom:0 left:0 right:12px.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm TypeScript compiles cleanly. Verify the composable file exists and exports usePanelManager.
  </verify>
  <done>usePanelManager composable exists with full panel state management (position, size, drag, resize, z-index, persistence). Resize handle styles added to styles.ts. TypeScript compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Refactor App.vue and ActionBar to use multi-panel system</name>
  <files>src/App.vue, src/components/ActionBar.vue</files>
  <action>
This is the main refactoring task. Replace the single-panel architecture in App.vue with the multi-panel composable.

**ActionBar.vue changes:**

1. Replace `activePanel: PanelKey` prop with `openPanels: Set<string>`.
2. Update `actionStyle` to check `props.openPanels.has(panel)` instead of `props.activePanel === panel`.
3. The `toggle` emit stays the same — parent handles multi-panel logic.
4. Update the PanelKey type to remove `'none'`.

**App.vue changes:**

**Step 1 — Import and initialize usePanelManager:**
```typescript
import { usePanelManager } from './composables/usePanelManager';

const {
  panels,
  openPanels,
  togglePanel,
  openPanel,
  closePanel: closePanelById,
  bringToFront,
  startDrag,
  startResize,
  onMouseMove: onPanelMouseMove,
  onMouseUp: onPanelMouseUp,
  panelStyle,
} = usePanelManager({
  group: { x: 40, y: 140 },
  travel: { x: 1040, y: 110 },
  hotbar: { x: 120, y: 260 },
  character: { x: 980, y: 140 },
  inventory: { x: 600, y: 140 },
  hotbarPanel: { x: 700, y: 140 },
  friends: { x: 500, y: 140 },
  stats: { x: 600, y: 140 },
  crafting: { x: 600, y: 140 },
  journal: { x: 600, y: 140 },
  quests: { x: 600, y: 140 },
  renown: { x: 600, y: 140 },
  vendor: { x: 600, y: 140 },
  characterActions: { x: 600, y: 200 },
  trade: { x: 600, y: 140 },
  track: { x: 600, y: 200 },
  combat: { x: 600, y: 140 },
  log: { x: 40, y: 400, w: 500, h: 300 },
});
```

**Step 2 — Remove old panel state:**
Delete: `activePanel` ref, `panelPos` ref, `groupPanelPos` ref, `travelPanelPos` ref, `hotbarPos` ref, all four `*Drag` refs, all `start*Drag` functions, all `on*Drag` functions, all `stop*Drag` functions, the old `togglePanel` function, the old `closePanel` function, the `panelTitle` computed.

Delete the old `uwr.windowPositions` localStorage watcher and the onMounted block that loads old positions.

Delete the old window.addEventListener calls for mousemove/mouseup (4 each).

**Step 3 — Replace with composable-driven event handlers:**
In onMounted, add:
```typescript
window.addEventListener('mousemove', onPanelMouseMove);
window.addEventListener('mouseup', onPanelMouseUp);
```
In onBeforeUnmount, remove them.

**Step 4 — Replace the single floating panel div with per-panel rendering:**

Currently there is ONE `<div v-if="activePanel !== 'none'" ...>` that conditionally renders the content. Replace this with individual floating panel divs for EACH panel type. Each panel renders independently based on `panels[id].open`.

Use a helper approach to reduce template repetition. Create a local component or template structure for the floating panel wrapper:

For each action-bar panel, render:
```html
<div
  v-if="panels.character.open"
  :style="{
    ...styles.floatingPanel,
    ...panelStyle('character'),
  }"
  @mousedown="bringToFront('character')"
>
  <div :style="styles.floatingPanelHeader" @mousedown="startDrag('character', $event)">
    <div>Characters</div>
    <button type="button" :style="styles.panelClose" @click="closePanelById('character')">x</button>
  </div>
  <div :style="styles.floatingPanelBody">
    <CharacterPanel ... />
  </div>
  <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('character', $event, { right: true })" />
  <div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('character', $event, { bottom: true })" />
  <div :style="styles.resizeHandle" @mousedown.stop="startResize('character', $event, { right: true, bottom: true })" />
</div>
```

Repeat this pattern for: inventory (add `styles.floatingPanelWide`), hotbarPanel, friends, stats, crafting (wide), journal (wide), quests (wide), renown, vendor (wide), characterActions, trade (wide), track, combat.

For panels that need `floatingPanelWide`, merge it into the style object.

**IMPORTANT:** The wide/compact style variants per panel must be preserved:
- Wide panels: inventory, journal, vendor, quests, crafting, stats, trade
- Normal: character, friends, renown, track, characterActions
- The `hotbarPanel` name distinguishes from the floating hotbar dock

**Step 5 — Update existing fixed panels (group, travel, hotbar) to use composable:**

Replace their hardcoded `:style` bindings with `panelStyle('group')` etc. Replace `@mousedown="startGroupDrag"` with `@mousedown="startDrag('group', $event)"`. Add resize handles to group and travel panels.

The hotbar is special (not a standard panel shape) — keep its existing structure but use `panelStyle('hotbar')` for position. No resize handle needed for hotbar.

**Step 6 — Update all references to old `activePanel`:**

Search for every `activePanel.value =` assignment and replace:
- `activePanel.value = 'vendor'` → `openPanel('vendor')`
- `activePanel.value = 'characterActions'` → `openPanel('characterActions')`
- `activePanel.value = 'trade'` → `openPanel('trade')`
- `activePanel.value = 'track'` → `openPanel('track')`
- `activePanel.value = 'character'` → `openPanel('character')`
- `activePanel.value = 'none'` (in closePanel) → `closePanelById(panelId)` (context-dependent)

For the character select handler: `@select="selectedCharacterId = $event; closePanelById('character')"`.

For the trade watcher that opens/closes trade panel:
```typescript
watch(() => activeTrade.value, (trade) => {
  if (trade) openPanel('trade');
  else closePanelById('trade');
});
```

For the login/character watcher that opens character panel:
```typescript
watch([() => isLoggedIn.value, () => player.value?.activeCharacterId], ([loggedIn, activeId]) => {
  if (!loggedIn) {
    selectedCharacterId.value = '';
    // Close all panels
    for (const id of openPanels.value) closePanelById(id);
    return;
  }
  if (activeId && !selectedCharacterId.value) {
    selectedCharacterId.value = activeId.toString();
    return;
  }
  if (!activeId) openPanel('character');
});
```

For the onboarding watcher that checks panel opens:
```typescript
watch(() => [...openPanels.value], (panels) => {
  if (onboardingStep.value === 'inventory' && panels.includes('inventory')) {
    onboardingStep.value = 'hotbar';
  } else if (onboardingStep.value === 'hotbar' && panels.includes('hotbarPanel')) {
    onboardingStep.value = null;
  }
});
```

**Step 7 — Update ActionBar binding:**
```html
<ActionBar
  :styles="styles"
  :open-panels="openPanels"
  :has-active-character="Boolean(selectedCharacter)"
  :combat-locked="lockHotbarEdits"
  :highlight-inventory="highlightInventory"
  :highlight-hotbar="highlightHotbar"
  @toggle="togglePanel"
/>
```

**Step 8 — panelTitle removal:**
The panelTitle computed is no longer needed since each panel div has its own hardcoded title string in its header.

**Step 9 — LogWindow as floating panel:**
Remove the LogWindow from its current position in the flow layout (`logStage > logStack > logOverlay`). Instead, render it as a floating panel:

```html
<div
  v-if="panels.log.open"
  :style="{
    ...styles.floatingPanel,
    ...panelStyle('log'),
  }"
  @mousedown="bringToFront('log')"
>
  <div :style="styles.floatingPanelHeader" @mousedown="startDrag('log', $event)">
    <div>Log</div>
    <button type="button" :style="styles.panelClose" @click="closePanelById('log')">x</button>
  </div>
  <div :style="{ ...styles.floatingPanelBody, flex: 1, minHeight: 0 }">
    <LogWindow
      :styles="styles"
      :selected-character="selectedCharacter"
      :combined-events="combinedEvents"
      :format-timestamp="formatTimestamp"
    />
  </div>
  <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('log', $event, { right: true })" />
  <div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('log', $event, { bottom: true })" />
  <div :style="styles.resizeHandle" @mousedown.stop="startResize('log', $event, { right: true, bottom: true })" />
</div>
```

The Log panel should start open by default (`open: true` in defaults or set during init). The onboarding hint div stays where it is (inside the logOverlay area) or moves into the log panel header area.

Keep the `logStage`/`logStack`/`logOverlay` wrapper divs in the template but they can be simplified — the onboarding hint can remain there as an overlay, or be moved above the log panel. Simplest approach: keep the onboarding hint as a separate absolute-positioned div, and remove the logStage/logStack/logOverlay wrappers entirely since the LogWindow is now a floating panel.

**Preserve the existing behavior:** The `v-if="activePanel === 'inventory'"` etc. conditional rendering of panel CONTENT should remain — each panel's content only renders when that panel is open. This is already handled by `v-if="panels.inventory.open"` on the wrapper div.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no TypeScript errors. Run `npm run dev` and verify the app starts. Open the browser, confirm multiple panels can be opened from the ActionBar simultaneously. Confirm panels can be dragged. Confirm panels can be resized from bottom-right corner. Refresh the page and confirm positions/sizes persist.
  </verify>
  <done>
- ActionBar allows multiple panels to show active highlight simultaneously
- Clicking an ActionBar button toggles that specific panel without closing others
- Each panel has its own position and can be dragged independently
- Each panel has resize handles (right edge, bottom edge, corner) and can be resized
- Panel state (position, size, open/closed) persists in localStorage per-panel
- Log window is a floating, movable, resizable panel
- Group, travel/location, and hotbar panels also use the composable for position/drag/resize
- All existing panel functionality (props, events, content) preserved
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Multi-panel UI system — multiple panels open simultaneously, all panels resizable/movable, per-panel localStorage persistence, Log window as floating panel</what-built>
  <how-to-verify>
    1. Open the app in browser (npm run dev)
    2. Click "Inventory" in the ActionBar — panel opens
    3. Click "Stats" in the ActionBar — Stats opens WITHOUT closing Inventory. Both buttons should show active highlight.
    4. Click "Crafting" — all three panels visible simultaneously
    5. Drag each panel by its header — they move independently
    6. Drag the bottom-right corner of any panel — it resizes
    7. Drag the right edge — width changes
    8. Drag the bottom edge — height changes
    9. Click on a background panel — it comes to front (z-index)
    10. Refresh the page — all panel positions, sizes, and open/closed states are restored
    11. Verify the Log window is a floating panel that can be moved and resized
    12. Verify the Group and Travel/Location panels still work with drag and now also support resize
    13. Click "Inventory" again in ActionBar — Inventory panel closes, others remain open
    14. Verify vendor/trade panels still open correctly when triggered programmatically
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- Multiple action bar panels can be open at once (not radio-button)
- Every floating panel is draggable via header
- Every floating panel (except hotbar) has resize handles
- Per-panel position, size, and visibility persist in localStorage
- Log window is a floating, movable, resizable panel
- Z-index stacking works (clicking a panel brings it to front)
- Old localStorage key (uwr.windowPositions) is migrated on first load
- All panel content and interactivity preserved (no broken props/events)
</verification>

<success_criteria>
User can open Inventory, Stats, and Crafting simultaneously, arrange them on screen, resize each to preference, refresh the page and see the same layout restored. Log window floats and is resizable. All existing game functionality unbroken.
</success_criteria>

<output>
After completion, create `.planning/quick/13-refactor-ui-panels-allow-multiple-panels/13-SUMMARY.md`
</output>
