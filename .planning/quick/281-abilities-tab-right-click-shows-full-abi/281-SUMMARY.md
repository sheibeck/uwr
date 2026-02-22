---
phase: quick-281
plan: 01
subsystem: ui
tags: [abilities, context-menu, character-panel]
dependency_graph:
  requires: []
  provides: [richer-ability-context-menu]
  affects: [CharacterInfoPanel]
tech_stack:
  added: []
  patterns: [ability-object-passing]
key_files:
  created: []
  modified:
    - src/components/CharacterInfoPanel.vue
decisions:
  - Pass full ability object to showContextMenu instead of individual string args
  - Use minimal stub object with zeroed bigints for renown perk rows to reuse single function signature
metrics:
  duration: 10m
  completed: 2026-02-21
---

# Phase quick-281 Plan 01: Abilities Tab Right-Click Context Menu Summary

**One-liner:** Expanded abilities-tab context menu to show ability name, cost/cast/cooldown stats, and description above the "Add to Hotbar" button.

## What Was Built

The right-click context menu in the Abilities tab of `CharacterInfoPanel.vue` previously showed only the ability description string. It now displays a structured info block:

1. **Ability name header** - bold, visible at top of popup
2. **Stats row** - Cost (mana/stamina/Free), Cast time (Instant or Xs), Cooldown (None or Xs)
3. **Description** - shown only if present, below a separator
4. **"Add to Hotbar" button** - unchanged, still at bottom

## Changes Made

### `src/components/CharacterInfoPanel.vue`

- Expanded `availableAbilities` prop type to include `castSeconds`, `cooldownSeconds`, `resourceCost`, `damageType`
- Updated `contextMenu` ref type to hold `resource`, `resourceCost`, `castSeconds`, `cooldownSeconds`
- Changed `showContextMenu` signature from `(event, key, name, description)` to `(event, ability)` accepting a full ability object
- Updated `@contextmenu.prevent` on ability rows to pass the whole `ability` object
- Updated `@contextmenu.prevent` on renown perk rows to pass a stub object with zeroed bigints
- Replaced single description `<div>` in popup with structured name header + stats block + conditional description

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

### Files exist
- `src/components/CharacterInfoPanel.vue` - FOUND

### Commits exist
- `2272ab0` - feat(quick-281): expand ability context menu with full ability info - FOUND

## Self-Check: PASSED
