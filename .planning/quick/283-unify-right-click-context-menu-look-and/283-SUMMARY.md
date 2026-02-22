---
phase: 283-unify-right-click-context-menu-look-and
plan: "01"
subsystem: ui
tags: [context-menu, ui-consistency, vue-components]
dependency_graph:
  requires: []
  provides: [unified-context-menu-shell]
  affects: [CharacterInfoPanel, App]
tech_stack:
  added: []
  patterns: [vue-slot, component-reuse]
key_files:
  created: []
  modified:
    - src/components/ContextMenu.vue
    - src/components/CharacterInfoPanel.vue
    - src/App.vue
decisions:
  - "Use optional default slot in ContextMenu rather than new props to keep the API minimal and backward-compatible"
  - "Replace @mouseleave close with ContextMenu's built-in outside-click and Escape handlers for all three menus"
metrics:
  duration: "~15 minutes"
  completed: "2026-02-21"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase 283 Plan 01: Unify Right-Click Context Menu Look and Feel

All three right-click context menus (inventory bag, ability in CharacterInfoPanel, hotbar slot in App.vue) now share the same visual shell from `ContextMenu.vue` / `styles.contextMenu`: dark translucent background (`rgba(12,16,24,0.95)`), 1px white-ish border, 10px border-radius, `blur(12px)` backdrop filter, and consistent shadow.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend ContextMenu with optional default slot | aa9fd2f | src/components/ContextMenu.vue |
| 2 | Migrate CharacterInfoPanel ability context menu to ContextMenu component | 713ee07 | src/components/CharacterInfoPanel.vue |
| 3 | Migrate App.vue hotbar context menu to ContextMenu component | 746c992 | src/App.vue |

## What Was Built

Extended `ContextMenu.vue` with a `<template v-if="$slots.default"><slot /></template>` block between the subtitle section and the items list. This allows callers to inject custom body content (ability stats, descriptions) while retaining the shared shell and all existing behavior (clamped positioning, outside-click/Escape close handlers).

`CharacterInfoPanel.vue` now uses `<ContextMenu>` for the ability right-click menu. The slot content renders cost/cast/cooldown stat rows and an optional description block with matching muted text styling. The old `@mouseleave` close approach is replaced by ContextMenu's built-in outside-click and Escape handlers.

`App.vue` now uses `<ContextMenu>` for the hotbar slot right-click menu. The optional description slot block is only rendered when `hotbarContextMenu.description` is truthy. The `ContextMenu` import was added to the App.vue script block.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist:
- src/components/ContextMenu.vue — modified, slot added
- src/components/CharacterInfoPanel.vue — migrated to ContextMenu component
- src/App.vue — migrated to ContextMenu component, import added

### Commits exist:
- aa9fd2f — feat(283-01): add optional default slot to ContextMenu
- 713ee07 — feat(283-01): migrate CharacterInfoPanel ability context menu to ContextMenu component
- 746c992 — feat(283-01): migrate App.vue hotbar context menu to ContextMenu component

## Self-Check: PASSED
