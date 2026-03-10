---
phase: quick-402
plan: 01
subsystem: ui
tags: [level-up, hud, ux, multi-level]
dependency_graph:
  requires: []
  provides: [inline-level-up-link, multi-level-auto-prompt]
  affects: [NarrativeHud.vue, App.vue]
tech_stack:
  added: []
  patterns: [vue-watch-computed, inline-hud-link]
key_files:
  created: []
  modified:
    - src/components/NarrativeHud.vue
    - src/App.vue
decisions:
  - Keep existing LEVEL UP right-side indicator as secondary reminder alongside new inline link
metrics:
  duration: ~5 minutes
  completed_date: "2026-03-10"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 402: Level Up Header Link and Multi-Level Summary

**One-liner:** Inline [level up] link next to character name in HUD, plus auto re-prompt watch for multi-level characters.

## What Was Built

### Task 1: Inline [level up] link in HUD header
Modified `NarrativeHud.vue` left section to render a clickable `[level up]` span immediately after the character name/level text when `pendingLevels > 0`. For multiple pending levels, shows `[level up x3]` style. Emits the same `level-up-click` event as the right-side LEVEL UP indicator.

### Task 2: Auto re-prompt watch in App.vue
Added a `watch(pendingLevels, ...)` in `App.vue` that detects when `pendingLevels` decreases but remains > 0 (meaning a level was applied but more remain). After a 2-second delay (to let narration settle), it automatically shows a narrative prompt telling the player to click [Confirm Level Up] to continue. This handles multi-level scenarios without requiring repeated manual trigger clicks.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1    | 8e89c2f | feat(quick-402-01): add inline [level up] link in HUD header |
| 2    | 49802c7 | feat(quick-402-02): auto re-prompt for remaining pending levels after level-up |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `src/components/NarrativeHud.vue` modified with inline link and `levelUpLinkStyle`
- `src/App.vue` modified with `watch(pendingLevels, ...)` auto-prompt
- Both commits exist: 8e89c2f, 49802c7
- No new TypeScript errors introduced (pre-existing unrelated errors unchanged)
