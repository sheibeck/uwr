---
phase: quick-291
plan: 01
subsystem: frontend
tags: [refactor, vue, composables, components]
dependency-graph:
  requires: []
  provides: [FloatingPanel, useCharacterScope, useTooltip, useAudio]
  affects: [App.vue]
tech-stack:
  added: []
  patterns: [provide-inject-panel-manager, composable-extraction]
key-files:
  created:
    - src/components/FloatingPanel.vue
    - src/composables/useCharacterScope.ts
    - src/composables/useTooltip.ts
    - src/composables/useAudio.ts
  modified:
    - src/App.vue
decisions:
  - "Use Vue provide/inject for panel manager functions to avoid passing 6 props to every FloatingPanel instance"
  - "Trade panel close-cancel behavior maintained via watcher on panels.trade.open rather than closePanel wrapper"
  - "FloatingPanel supports header slot for travel/group panels with custom header content"
metrics:
  duration: 522s
  completed: 2026-02-23T18:01:32Z
---

# Quick Task 291: Reorganize Frontend src/ - Reduce Duplication

Extracted FloatingPanel wrapper component with provide/inject pattern, useCharacterScope composable for 11 character-scoped computed properties, useTooltip composable for tooltip/popup/context-menu state, and useAudio composable for sound effects. App.vue reduced from 2670 to 2369 lines (301 lines removed, 11.3% reduction).

## Tasks Completed

### Task 1: FloatingPanel component and useCharacterScope composable
**Commit:** 914ef1c

**FloatingPanel.vue** -- Reusable panel wrapper that encapsulates the repeated floating panel boilerplate (v-if guard, styles, drag/resize/close, header/body/resize-handles). Uses `inject('panelManager')` to access panel functions without prop drilling. Supports:
- `panelId`, `title` (required basics)
- `wide`, `compact`, `hotbar` (style variants)
- `alwaysOpen` (skip v-if check for always-visible panels)
- `closable` (show/hide close button)
- `bodyStyle` (override body style, e.g., combat panel)
- `extraClass` (for CSS class animations like loot pulse)
- Named `#header` slot for custom header content (travel location panel, group panel)

All 14+ panel instances in App.vue converted to use FloatingPanel. Panel manager functions provided once via `provide('panelManager', ...)`.

**useCharacterScope.ts** -- Extracted 11 computed properties that follow the "guard on selectedCharacter, filter array by characterId" pattern:
- characterNpcDialogs, characterQuests, characterQuestItems, characterNamedEnemies
- characterSearchResult (find, not filter)
- characterFactionStandings, characterRenown (find), characterRenownPerks
- characterPanelLayouts
- locationQuestItems, locationNamedEnemies (derived from character-scoped computeds)

**Files:** src/components/FloatingPanel.vue (new), src/composables/useCharacterScope.ts (new), src/App.vue (modified)

### Task 2: useTooltip and useAudio composables
**Commit:** c732cdf

**useTooltip.ts** -- Extracted all tooltip/popup/context-menu state and handlers:
- `tooltip` ref (item tooltip: visible, x, y, item, anchor)
- `abilityPopup` ref (ability popup: visible, x, y, name, description, stats)
- `hotbarContextMenu` ref (context menu state)
- `tooltipRarityColor()`, `showTooltip()`, `moveTooltip()`, `hideTooltip()`
- `showAbilityPopup()`, `hideAbilityPopup()`
- `showHotbarContextMenu()`, `hideHotbarContextMenu()`, `hotbarAbilityDescription()`

Accepts `abilityLookup` ref as dependency. Imports `rarityColor` internally (removed from App.vue import).

**useAudio.ts** -- Extracted audio/sound logic:
- `audioCtxRef`, `getAudioContext()`, `playTone()`
- `playVictorySound()`, `playDefeatSound()`, `playLevelUpSound()`
- Two watchers on `combinedEvents` for victory/defeat and level-up sounds
- `onBeforeUnmount` cleanup for audio context

Self-contained composable that manages its own watchers and cleanup.

**Files:** src/composables/useTooltip.ts (new), src/composables/useAudio.ts (new), src/App.vue (modified)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Trade panel close-cancel behavior**
- **Found during:** Task 1
- **Issue:** FloatingPanel's close button calls closePanelById directly, bypassing the old closePanel wrapper that called cancelTrade() for trade panels
- **Fix:** Added a watcher on `panels.trade?.open` that calls cancelTrade() when the panel is closed while a trade is active
- **Files modified:** src/App.vue
- **Commit:** 914ef1c

## Line Count Analysis

| Stage | Lines | Delta |
|-------|-------|-------|
| Original | 2670 | -- |
| After Task 1 | 2554 | -116 |
| After Task 2 | 2369 | -185 |
| **Total reduction** | **2369** | **-301 (11.3%)** |

The plan estimated ~800-900 line reduction. The actual reduction is 301 lines because many panel wrappers were already formatted as compressed single-line blocks (3-4 lines each instead of the 6-8 in the plan's example). The extraction is functionally complete -- all 14+ panels use FloatingPanel, all character-scoped computeds are in useCharacterScope, and all tooltip/audio logic is in separate composables.

## New Files Created

| File | Lines | Purpose |
|------|-------|---------|
| src/components/FloatingPanel.vue | 72 | Reusable panel wrapper with provide/inject |
| src/composables/useCharacterScope.ts | 102 | Character-scoped computed property factories |
| src/composables/useTooltip.ts | 125 | Tooltip/popup/context-menu state management |
| src/composables/useAudio.ts | 93 | Sound effects and audio context management |

## Self-Check: PASSED

- All 4 created files exist on disk
- Both task commits (914ef1c, c732cdf) verified in git log
- Vite production build succeeds with no errors
