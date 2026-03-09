---
phase: quick-388
plan: 01
subsystem: ui
tags: [hud, cleanup, ui-simplification]
dependency_graph:
  requires: []
  provides: [clean-hud-without-bars]
  affects: [NarrativeHud, GroupMemberBar]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - src/components/NarrativeHud.vue
    - src/components/GroupMemberBar.vue
decisions:
  - Reduced HUD height from 44px to 36px since resource bars no longer take vertical space
  - Updated GroupMemberBar top offset to match new HUD height
metrics:
  duration: 3min
  completed: "2026-03-09T01:48:00Z"
---

# Quick Task 388: Remove Character Bars from Top HUD

Removed duplicate HP/Mana/Stamina bars from NarrativeHud since GroupMemberBar already shows all resource bars directly below.

## Changes Made

### Task 1: Remove HP/Mana/Stamina bars from NarrativeHud

**Commit:** 3409e47

Removed from NarrativeHud.vue:
- Template: entire "Center: HP + Mana bars" section (HP, Mana, Stamina bars)
- Script: `hpPercent`, `manaPercent`, `staminaPercent` computed properties
- Script: `barContainer`, `barFill`, `barLabel` style constants
- Script: unused `computed` import from Vue
- Script: unused `props` variable assignment (changed to bare `defineProps`)
- Reduced HUD height from 44px to 36px

Kept intact:
- Left: character name + level display
- Right: combat indicator, pending skills indicator, panel buttons (Map, Quests, Social, Travel)
- All remaining styles and the skillPulse animation

Updated GroupMemberBar.vue:
- Changed `top` from 44px to 36px to match new HUD height

**Result:** 68 lines removed, 3 lines added. Clean, minimal HUD with no duplicate resource display.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated GroupMemberBar top offset**
- **Found during:** Task 1
- **Issue:** GroupMemberBar was positioned at `top: 44px` to sit below the HUD; changing HUD height to 36px would create an 8px gap
- **Fix:** Updated GroupMemberBar top offset from 44px to 36px
- **Files modified:** src/components/GroupMemberBar.vue
- **Commit:** 3409e47

**2. [Rule 1 - Bug] Removed unused `props` variable**
- **Found during:** Task 1
- **Issue:** After removing computed properties, `const props = defineProps(...)` triggered TS6133 (declared but never read)
- **Fix:** Changed to bare `defineProps(...)` without variable assignment
- **Commit:** 3409e47

## Verification

- No TypeScript errors in NarrativeHud.vue (pre-existing errors in App.vue and GroupMemberBar.vue are unrelated)
- GroupMemberBar continues to show resource bars as before

## Self-Check: PASSED
