---
phase: quick-152
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePanelManager.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "New players see log panel on the left side, top-aligned"
    - "New players see location panel on the right side, top-aligned"
    - "New players see hotbar panel just left of the location panel, top-aligned"
    - "New players see group panel just left of the hotbar panel, top-aligned"
    - "/resetwindows command restores this exact layout instead of centering all panels"
  artifacts:
    - path: "src/composables/usePanelManager.ts"
      provides: "getDefaultLayout() function and updated resetAllPanels"
    - path: "src/App.vue"
      provides: "Updated default panel positions in usePanelManager call"
  key_links:
    - from: "src/composables/usePanelManager.ts"
      to: "src/App.vue"
      via: "resetAllPanels uses same layout logic as defaults"
      pattern: "getDefaultLayout|DEFAULT_LAYOUT"
---

<objective>
Set a proper default panel layout for new players and make /resetwindows restore it.

Purpose: New players currently see panels at arbitrary positions. The 4 always-open panels (log, location, hotbar, group) should be positioned in a clear, usable layout from the start. The /resetwindows command should restore this same layout instead of stacking everything in the center.

Output: Updated default positions and resetAllPanels function.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/usePanelManager.ts
@src/App.vue (lines 1932-1955 for usePanelManager defaults, lines 446-458 for resetAllPanels)
@src/ui/styles.ts (panel size styles: floatingPanel 320px, floatingPanelWide 720px, floatingPanelCompact 260px, floatingPanelHotbar 160px)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create getDefaultLayout helper and update defaults + resetAllPanels</name>
  <files>src/composables/usePanelManager.ts, src/App.vue</files>
  <action>
Create a `getDefaultLayout` function in usePanelManager.ts that computes viewport-aware positions for the 4 always-open panels. This function is called both for initial defaults (in App.vue) and by resetAllPanels.

Layout specification (all panels top-aligned at y=16):
- **Log panel**: left side. x=16, y=16. Keep its w=500, h=300.
- **Location panel (travel)**: right side. x = window.innerWidth - 320 - 16 (320px is floatingPanel default width, 16px margin). y=16.
- **Hotbar panel**: just left of location. x = locationX - 160 - 8 (160px is hotbar width, 8px gap). y=16.
- **Group panel**: just left of hotbar. x = hotbarX - 260 - 8 (260px is compact panel width, 8px gap). y=16.

All other panels (characterInfo, hotbarPanel, friends, crafting, journal, renown, worldEvents, loot, vendor, trade, track, travelPanel, combat) keep generic centered defaults since they open on demand.

**In usePanelManager.ts:**

1. Export a function `getDefaultLayout()` that returns a `Record<string, { x: number; y: number; w?: number; h?: number; open?: boolean }>` with:
   - `log`: { x: 16, y: 16, w: 500, h: 300, open: true }
   - `travel`: { x: vw - 336, y: 16 } (where vw = window.innerWidth, clamped to min 400)
   - `hotbar`: { x: travelX - 168, y: 16 } (160 + 8 gap)
   - `group`: { x: hotbarX - 268, y: 16 } (260 + 8 gap)
   - All other panel IDs with x/y centered (same as current generic center logic: Math.round(vw/2 - 160), Math.round(vh/2 - 100)).

   The panel IDs that need centered defaults: `character`, `characterInfo`, `hotbarPanel`, `friends`, `crafting`, `journal`, `renown`, `worldEvents`, `loot`, `vendor`, `trade`, `track`, `travelPanel`, `combat`.

2. Update `resetAllPanels` to call `getDefaultLayout()` and apply the returned positions to each panel instead of centering all panels at the same point. For each key in the layout, set panels[id].x and panels[id].y. If layout specifies w/h, also set those. Keep markDirty() and saveToStorage() calls.

**In App.vue:**

3. Import `getDefaultLayout` from `usePanelManager.ts`.

4. Replace the hardcoded defaults object in the `usePanelManager(...)` call (lines 1932-1950) with a call to `getDefaultLayout()`. This ensures new players without any saved state get the correct layout.

Note: The `getDefaultLayout` function reads `window.innerWidth` / `window.innerHeight` at call time. For SSR safety this is fine since this is a browser-only game. If `window` is undefined, fall back to 1920x1080.
  </action>
  <verify>
1. `npm run build` succeeds with no TypeScript errors.
2. Clear localStorage (`localStorage.removeItem('uwr.panelStates')`) and reload — log panel should be top-left, location panel top-right, hotbar just left of location, group just left of hotbar.
3. Type `/resetwindows` — panels should snap to the same layout described above rather than stacking in center.
  </verify>
  <done>
- New players (no localStorage, no server state) see the 4 always-open panels arranged as: log top-left, location top-right, hotbar left-of-location, group left-of-hotbar, all top-aligned.
- /resetwindows restores this same layout.
- All other panels default to screen center.
  </done>
</task>

</tasks>

<verification>
- Build passes: `npm run build`
- Visual check: clear localStorage, reload, confirm panel positions match spec
- /resetwindows command: type it, confirm panels snap to correct positions
</verification>

<success_criteria>
- Log panel appears at top-left (x=16, y=16)
- Location panel appears at top-right (rightmost edge minus panel width minus margin)
- Hotbar panel is immediately left of location panel with small gap
- Group panel is immediately left of hotbar panel with small gap
- /resetwindows produces the same layout
- No regression: all other panels still open/close/drag correctly
</success_criteria>

<output>
After completion, create `.planning/quick/152-set-default-panel-layout-for-new-players/152-SUMMARY.md`
</output>
