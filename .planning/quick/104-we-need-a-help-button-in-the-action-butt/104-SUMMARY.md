---
phase: quick-104
plan: 01
subsystem: UI
tags: [help, documentation, onboarding, overlay, UX]
dependency_graph:
  requires: [ActionBar, App, styles]
  provides: [Help overlay, Help button]
  affects: [ActionBar, App]
tech_stack:
  added: [HelpOverlay.vue component]
  patterns: [Full-screen overlay with boolean toggle, Escape key dismissal]
key_files:
  created:
    - src/components/HelpOverlay.vue
  modified:
    - src/components/ActionBar.vue
    - src/App.vue
decisions:
  - Help overlay uses simple boolean toggle (showHelp ref) instead of panel manager system for lightweight implementation
  - Help button always visible in ActionBar (not gated by active character) for maximum accessibility
  - Overlay z-index set to 9000 to appear above floating panels but below tooltips/context menus
  - Bind stone and crafting station icons replicated inline using CSS from styles.bindStoneIcon and styles.craftingIcon
  - Escape key dismissal implemented via onMounted/onUnmounted listeners for accessibility
metrics:
  duration: 206s
  completed_at: 2026-02-16T23:42:28Z
  tasks_completed: 1
  files_modified: 3
  commits: 1
---

# Phase quick-104 Plan 01: Help Button and Overlay Summary

**One-liner:** Full-screen help overlay with game basics (right-click menus, travel costs, icons, combat) accessible via always-visible Help button in action bar.

## Overview

Added a comprehensive help system to improve new player onboarding and serve as a quick reference for existing players. The Help button appears in the action bar at all times (no active character required) and opens a full-screen overlay explaining game mechanics, UI conventions, and icon meanings.

## Implementation Details

### HelpOverlay Component

Created `src/components/HelpOverlay.vue` with:

- **Layout:** Full-screen backdrop (position: fixed, inset: 0) with centered dialog
- **Styling:** Dark RPG aesthetic matching existing game UI (#141821 background, gold accent titles, PT Serif font)
- **Content Sections:**
  - **Getting Started:** Character creation basics
  - **Interacting with the World:** Right-click context menus, left-click targeting
  - **Travel:** Stamina costs, cross-region cooldowns, difficulty color coding
  - **Location Icons:** Inline replicas of bind stone (blue radial gradient circle) and crafting station (rotated gold diamond) with explanations
  - **Combat:** Enemy engagement, hotbar abilities, group mechanics
  - **Useful Tips:** Panel manipulation, command bar usage, Log panel
- **Dismissal:** Close button at bottom center, Escape key listener (onMounted/onUnmounted)
- **Props:** styles object for accessing bind stone and crafting icon styles
- **Emits:** close event

### ActionBar Integration

Modified `src/components/ActionBar.vue`:

- Added Help button OUTSIDE the `v-if="hasActiveCharacter"` block (between Characters and first character-gated button)
- Button emits `('toggle', 'help')` event
- Added `'help'` to PanelKey type union
- Button uses `actionStyle('help')` for consistent styling

### App.vue Integration

Modified `src/App.vue`:

- **Import:** Added HelpOverlay component import
- **State:** Added `showHelp` ref (boolean, default false) near other overlay state refs
- **Template:** Added `<HelpOverlay v-if="showHelp" :styles="styles" @close="showHelp = false" />` after gift overlay, before footer
- **Toggle Handler:** Created wrapper function for `togglePanel` that intercepts 'help' panel:
  - Renamed usePanelManager's togglePanel to togglePanelInternal
  - Created new togglePanel wrapper that checks `if (panelId === 'help')` → toggle showHelp boolean
  - Otherwise delegates to togglePanelInternal
  - Avoids adding Help to panel manager system (no position/resize/z-index management needed)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] Help button appears in action bar without active character
- [x] Clicking Help opens full-screen overlay
- [x] All documented sections present and readable
- [x] Bind stone icon (blue radial gradient circle) visible inline
- [x] Crafting station icon (rotated gold diamond) visible inline
- [x] Overlay closes on Close button click
- [x] Overlay closes on Escape key press
- [x] No new TypeScript compilation errors (verified with `npx vue-tsc --noEmit`)
- [x] Overlay z-index (9000) renders above floating panels

## Technical Notes

### Icon Replication Strategy

Used existing CSS styles from `styles.bindStoneIcon` and `styles.craftingIcon` directly in HelpOverlay template:

```vue
<div :style="styles.bindStoneIcon"></div>
<div :style="styles.craftingIcon"></div>
```

This ensures perfect visual consistency with actual in-game icons without duplication.

### Toggle Interception Pattern

Wrapper pattern allows Help to behave like a simple overlay while other panels continue using the full panel manager system:

```typescript
const togglePanel = (panelId: string) => {
  if (panelId === 'help') {
    showHelp.value = !showHelp.value;
    return;
  }
  togglePanelInternal(panelId);
};
```

This avoids polluting the panel manager with a panel that doesn't need positioning, resizing, or z-index management.

## Self-Check

**Status:** PASSED

### Created Files
```bash
FOUND: src/components/HelpOverlay.vue
```

### Modified Files
```bash
FOUND: src/components/ActionBar.vue (Help button added)
FOUND: src/App.vue (HelpOverlay import, showHelp ref, toggle wrapper)
```

### Commits
```bash
FOUND: a191d13 (feat(quick-104): add Help button and overlay with game basics)
```

All files created, modified as expected, and committed successfully.
