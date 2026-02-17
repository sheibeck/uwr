---
phase: quick-110
plan: 01
subsystem: ui
tags: [ui, panels, action-bar, inventory, stats, character, renown, tabs]
dependency_graph:
  requires: []
  provides: [CharacterInfoPanel, tabbed-character-panel, unified-renown-tabs]
  affects: [ActionBar, App.vue, RenownPanel]
tech_stack:
  added: []
  patterns: [NpcDialogPanel-tab-bar-style, tabbed-wrapper-component]
key_files:
  created:
    - src/components/CharacterInfoPanel.vue
  modified:
    - src/components/ActionBar.vue
    - src/components/RenownPanel.vue
    - src/App.vue
decisions:
  - CharacterInfoPanel is a thin wrapper that delegates all event forwarding to InventoryPanel and StatsPanel — no logic duplication
  - InventoryPanel and StatsPanel remain standalone components imported by CharacterInfoPanel (not directly by App.vue)
  - onboarding watcher updated to track characterInfo panel open state instead of inventory
  - highlightInventory prop on ActionBar now highlights the Character button (characterInfo panel key)
metrics:
  duration: ~2min
  completed: 2026-02-17
  tasks_completed: 2
  files_changed: 4
---

# Quick Task 110: Combine Inventory and Stats Panels into Character Panel

**One-liner:** Single tabbed "Character" panel with Inventory/Stats tabs replaces two separate action bar buttons, Renown panel tabs updated to match Journal underline style.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create CharacterInfoPanel + update ActionBar + App.vue | b422318 | CharacterInfoPanel.vue (new), ActionBar.vue, App.vue |
| 2 | Update Renown panel tab styling to match Journal pattern | 74abcd1 | RenownPanel.vue |

## What Was Built

### CharacterInfoPanel.vue (new)
A thin tabbed wrapper component with two tabs — Inventory (default) and Stats. Uses the exact NpcDialogPanel/Journal tab-bar inline style pattern: `gap: 0`, `borderBottom: 1px solid rgba(255,255,255,0.1)`, `marginBottom: 8px`, active tab with `rgba(255,255,255,0.08)` background and `2px solid #60a5fa` underline.

Props accepted (union of both child panel props, deduplicated):
- `styles`, `connActive`, `selectedCharacter`, `equippedSlots`, `inventoryItems`, `inventoryCount`, `maxInventorySlots`, `combatLocked`, `statBonuses`, `locations`, `regions`

All InventoryPanel events forwarded: `equip`, `unequip`, `use-item`, `eat-food`, `delete-item`, `split-stack`, `organize`, `show-tooltip`, `move-tooltip`, `hide-tooltip`

### ActionBar.vue changes
- Removed Inventory button (`emit('toggle', 'inventory')`)
- Removed Stats button (`emit('toggle', 'stats')`)
- Added Character button (`emit('toggle', 'characterInfo')`) in same position
- Updated `actionStyle` highlight check: `panel === 'characterInfo'` for onboarding inventory highlight
- Updated PanelKey type: removed `inventory` and `stats`, added `characterInfo`

### App.vue changes
- Replaced InventoryPanel and StatsPanel imports with CharacterInfoPanel import
- Replaced separate inventory and stats panel blocks with single characterInfo panel block
- Updated `usePanelManager` defaults: removed `inventory: { x: 600, y: 140 }` and `stats: { x: 600, y: 140 }`, added `characterInfo: { x: 600, y: 140 }`
- Updated onboarding watcher: `panels.includes('characterInfo')` instead of `panels.includes('inventory')`

### RenownPanel.vue changes
Replaced old `actionButton`/`actionButtonActive` style spreads (with `gap: 8px` and `paddingBottom`) with the NpcDialogPanel underline tab-bar pattern. All three tabs (Factions, Renown, Leaderboard) now use:
- Container: `display: flex, gap: 0, borderBottom: 1px solid rgba(255,255,255,0.1), marginBottom: 8px`
- Active: `rgba(255,255,255,0.08)` background, `2px solid #60a5fa` bottom border, `#fff` color
- Inactive: transparent background, `2px solid transparent` border, `#d1d5db` color

## Verification

- Action bar order: Log, Help, Camp, **Character**, Hotbar, Crafting, Journal, Renown, Travel, Loot, Friends
- Separate Inventory and Stats buttons removed
- Clicking Character opens floating "Character" panel with Inventory tab active by default
- Switching to Stats tab shows character stats (StatsPanel content)
- All inventory actions (equip, unequip, use, eat, delete, split, organize, tooltips) work within the Inventory tab
- Renown panel tabs now use the same underline style as Journal panel
- No new TypeScript compilation errors introduced

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- src/components/CharacterInfoPanel.vue: FOUND
- src/components/ActionBar.vue: FOUND (modified)
- src/components/RenownPanel.vue: FOUND (modified)
- src/App.vue: FOUND (modified)
- Commit b422318: FOUND
- Commit 74abcd1: FOUND
