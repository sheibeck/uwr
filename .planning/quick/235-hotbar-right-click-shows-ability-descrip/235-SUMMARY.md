---
phase: quick-235
plan: "01"
subsystem: client-ui
tags: [hotbar, tooltip, popup, ux]
dependency_graph:
  requires: []
  provides: [hotbar-right-click-popup]
  affects: [hotbar-tooltip]
tech_stack:
  added: []
  patterns: [vue-ref-state, document-event-listener, contextmenu-prevent]
key_files:
  modified:
    - src/composables/useHotbar.ts
    - src/App.vue
decisions:
  - "Use hotbarAbilityDescription helper function instead of inline IIFE for cleaner template"
  - "Document click listener on hideAbilityPopup dismisses popup globally"
  - "Popup uses @click.stop to prevent immediate self-dismissal"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-235 Plan 01: Hotbar Right-Click Ability Description Popup Summary

Hover tooltip shows name + stats only; right-click opens a persistent popup with ability name and description that dismisses on any page click.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Remove description from hotbarTooltipItem | b44120e | src/composables/useHotbar.ts |
| 2 | Add ability popup state, handlers, right-click wiring, and template | 5124b05 | src/App.vue |

## What Was Built

**Task 1 — useHotbar.ts:**
- Removed the `const description = ...` line from `hotbarTooltipItem`
- Removed `description` from the return object so hover tooltips no longer show description text
- The `liveAbility.description` data is still accessible on the ability object for the popup

**Task 2 — App.vue:**
- Added `abilityPopup` ref with `{ visible, x, y, name, description }` shape
- Added `showAbilityPopup(payload)` — sets popup visible with position and content
- Added `hideAbilityPopup()` — resets popup to hidden state
- Added `hotbarAbilityDescription(slot)` — resolves description from live ability lookup or fallback
- Added `document.addEventListener('click', hideAbilityPopup)` in `onMounted`
- Added `document.removeEventListener('click', hideAbilityPopup)` in `onBeforeUnmount`
- Added `@contextmenu.prevent` on hotbar buttons that calls `showAbilityPopup` with button position
- Added `abilityLookup` to the destructured `useHotbar` return
- Added popup template div using `styles.tooltip`, anchored by `abilityPopup.x/y`, with `@click.stop`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `src/composables/useHotbar.ts` - description removed from hotbarTooltipItem return
- [x] `src/App.vue` - abilityPopup ref, showAbilityPopup, hideAbilityPopup, contextmenu handler, popup template
- [x] Commits b44120e and 5124b05 exist
- [x] No new TypeScript errors introduced (pre-existing TS2339 getBoundingClientRect errors on EventTarget are the same pattern as existing line 127/128 errors)

## Self-Check: PASSED
