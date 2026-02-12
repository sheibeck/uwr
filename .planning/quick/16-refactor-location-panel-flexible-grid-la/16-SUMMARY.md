---
phase: 16
plan: 01
subsystem: client-ui
tags: [ui-refactor, context-menus, grid-layout, location-panel]
dependency_graph:
  requires: []
  provides: [context-menu-system, grid-layout-pattern]
  affects: [location-ui, combat-panel]
tech_stack:
  added: []
  patterns: [right-click-context-menus, grid-tiles, teleport-pattern]
key_files:
  created:
    - src/components/ContextMenu.vue
    - src/components/LocationGrid.vue
  modified:
    - src/components/CombatPanel.vue
    - src/App.vue
    - src/ui/styles.ts
decisions:
  - Use Teleport to body for context menu to avoid clipping
  - Clamp context menu position to viewport boundaries
  - Grid tiles always visible (no accordions) for better information density
  - Left-click selects enemies (yellow border), right-click opens context menu
  - Both left and right click on characters trigger character actions panel
  - CombatPanel now combat-only — out-of-combat content moved to LocationGrid
metrics:
  duration: ~4min
  tasks_completed: 2
  files_created: 2
  files_modified: 3
  commits: 2
  completed_at: 2026-02-12T17:08:13Z
---

# Quick Task 16: Location Panel Grid Refactor

**One-liner:** Context menu system with grid layout for location content — cleaner game-like interaction replacing button-heavy accordions

## Tasks Completed

### Task 1: Create ContextMenu and LocationGrid components
- Created `ContextMenu.vue`: Reusable right-click context menu component
  - Props: visible, x, y, title, subtitle, items array, styles
  - Clamps position to viewport boundaries
  - Closes on outside click, Escape key, or action selection
  - Uses Teleport to body to avoid clipping by overflow:hidden parents
  - Hover effects via reactive state (inline styles)
- Created `LocationGrid.vue`: Grid layout for location items
  - Sections: Enemies, Resources, Characters, NPCs (only shown if populated)
  - Enemy tiles: show name/level/con color, group count badge, left-click selection, right-click context menu
  - Resource tiles: show name/state, progress bar for gathering, right-click context menu
  - Character tiles: left/right click both open character actions panel, disconnected indicator
  - NPC tiles: right-click shows Talk/Open Store options
  - Empty state: "Nothing of interest here."
- Added styles to `styles.ts`:
  - Context menu styles: menu container, title, subtitle, items, disabled items
  - Grid styles: section labels, tile variants (default, selected, depleted, NPC), grid wrap

**Commit:** `1678bec`

### Task 2: Refactor CombatPanel, wire LocationGrid into App.vue
- Stripped out-of-combat content from `CombatPanel.vue`:
  - Removed enemies accordion out-of-combat block (lines 157-214)
  - Removed resources/characters/NPCs accordions (lines 216-336)
  - Removed props: enemySpawns, resourceNodes, canEngage, charactersHere, npcsHere
  - Removed emits: pull, gather-resource, hail, open-vendor, character-action
  - Kept combat-only functionality: activeResult, activeCombat, flee, select-enemy, dismiss-results, take-loot
  - Removed EnemySummary type and NpcRow import
- Updated `App.vue`:
  - Imported LocationGrid component
  - Replaced second CombatPanel instance (out-of-combat) with LocationGrid
  - Updated combat-mode CombatPanel props to remove out-of-combat ones
  - LocationGrid receives: enemySpawns, resourceNodes, charactersHere, npcsHere, canEngage
  - LocationGrid emits: pull, gather-resource, hail, open-vendor, character-action
  - Updated AccordionKey type: removed resources, characters, npcs (only travel and enemies remain)
  - Updated accordionState reactive object to match

**Commit:** `682e364`

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

**Out-of-combat view:**
- [x] Enemies, resources, NPCs, characters display as compact grid tiles (no accordions except Travel)
- [x] Right-click any tile opens appropriate context menu with correct actions
- [x] Left-click enemy tile toggles selection highlight (yellow border)
- [x] Context menu closes on outside click, Escape, or action selection
- [x] Pull actions work from context menu (both careful and body pull)
- [x] Gather action works from context menu
- [x] NPC Talk/Open Store actions work from context menu
- [x] Character actions open the existing CharacterActionsPanel
- [x] Combat mode completely unchanged — hp bars, effects, flee, targeting, results, loot all work
- [x] No new TypeScript errors (pre-existing errors unrelated to changes)

**Pattern verification:**
- Context menu positioning clamps correctly to viewport
- Grid tiles wrap responsively
- Selected enemy highlight persists until toggled off
- Depleted resources show muted style
- Gathering resources show progress bar

## Self-Check: PASSED

**Created files verified:**
```
[FOUND]: src/components/ContextMenu.vue
[FOUND]: src/components/LocationGrid.vue
```

**Modified files verified:**
```
[FOUND]: src/components/CombatPanel.vue (out-of-combat content removed)
[FOUND]: src/App.vue (LocationGrid wired in)
[FOUND]: src/ui/styles.ts (context menu and grid styles added)
```

**Commits verified:**
```
[FOUND]: 1678bec feat(quick-16): create ContextMenu and LocationGrid components
[FOUND]: 682e364 feat(quick-16): refactor CombatPanel to combat-only, wire LocationGrid
```

## Impact

**Before:** Location content spread across 4 collapsible accordions with inline action buttons on every item — required scrolling, lots of visual clutter, many clicks to interact.

**After:** All location content visible in compact grid layout. Actions accessed via right-click context menus. Cleaner, more game-like interaction pattern. Combat mode completely unchanged.

**Key improvements:**
1. Information density: All location content visible without scrolling through accordions
2. Cleaner UI: Replaced 8+ inline buttons per section with single context menu system
3. Game-like interaction: Right-click feels natural for game interactions
4. Separation of concerns: CombatPanel is now strictly combat-only (easier to maintain)
5. Reusable pattern: ContextMenu component can be used elsewhere in the UI

## Notes

- Context menu uses Teleport to body to avoid clipping issues
- Grid tiles use flexbox with wrap for responsive layout
- Enemy selection state tracked locally in LocationGrid (not global)
- Character tiles trigger character actions panel on both left and right click (consistent with existing behavior)
- Accordion state cleaned up — only travel and enemies remain (enemies used during combat)
