---
phase: quick
plan: 282
subsystem: ui
tags: [onboarding, ux, animation, vue, css]

# Dependency graph
requires: []
provides:
  - Onboarding hint raised to z-index 9000 (renders above all floating panels)
  - Orange pulsing CSS animation class (.onboarding-pulse) for action bar buttons
  - Character ActionBar button pulses orange during onboarding
  - CharacterInfoPanel Inventory and Abilities tabs pulse orange during onboarding
  - Auto-dismiss changed from "panel opens" to "Abilities tab clicked"
  - tab-change event emitted by CharacterInfoPanel for all tab switches
affects: [onboarding, CharacterInfoPanel, ActionBar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS keyframe animation for button pulse defined in App.vue global style block"
    - "Onboarding state drives :class and :style bindings on child components via props"
    - "setTab() helper pattern in CharacterInfoPanel emits tab-change event on every tab switch"

key-files:
  created: []
  modified:
    - src/ui/styles.ts
    - src/App.vue
    - src/components/ActionBar.vue
    - src/components/CharacterInfoPanel.vue

key-decisions:
  - "z-index 9000 chosen: above floating panels (6), command bar (100), but below death screen (9999)"
  - "Auto-dismiss trigger changed from characterInfo panel opening to Abilities tab being clicked - more precise guidance"
  - "Orange pulse applied to Inventory AND Abilities tabs simultaneously to guide the full workflow"

patterns-established:
  - "tab-change event pattern: CharacterInfoPanel emits on every tab change, parent handles logic"

requirements-completed: [QUICK-282]

# Metrics
duration: 10min
completed: 2026-02-21
---

# Quick Task 282: Fix Onboarding Hint Z-Index and Add Orange Pulse Summary

**Onboarding hint z-index raised to 9000 with orange pulsing glow on Character ActionBar button and Inventory/Abilities tabs, auto-dismiss changed to trigger on Abilities tab click**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-21
- **Completed:** 2026-02-21
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Raised `onboardingHint` z-index from 500 to 9000 so it renders above all floating panels
- Added `@keyframes onboardingButtonPulse` and `.onboarding-pulse` CSS class to App.vue for orange glow animation
- Replaced the old `openPanels` watch (which dismissed on panel open) with `onCharacterTabChange` handler (dismisses only when Abilities tab clicked)
- Added `:onboarding` prop and `@tab-change` event wiring to CharacterInfoPanel in App.vue template
- Character button in ActionBar now gets `onboarding-pulse` class when `highlightInventory` is true
- CharacterInfoPanel now emits `tab-change` on every tab click via `setTab()` helper
- Inventory and Abilities tab buttons show orange glow/color when `onboarding` prop is true

## Task Commits

1. **Task 1: Raise onboarding hint z-index and add CSS pulse animation** - `99c90d9` (feat)
2. **Task 2: Pulse Character button in ActionBar; pulse tabs and emit tab-change in CharacterInfoPanel** - `483f10e` (feat)

## Files Created/Modified

- `src/ui/styles.ts` - Changed `onboardingHint.zIndex` from 500 to 9000
- `src/App.vue` - Added `onboardingButtonPulse` keyframe, `.onboarding-pulse` class, `onCharacterTabChange` handler, removed old `openPanels` watch, wired `:onboarding` and `@tab-change` to CharacterInfoPanel
- `src/components/ActionBar.vue` - Added `:class="{ 'onboarding-pulse': props.highlightInventory }"` to Character button
- `src/components/CharacterInfoPanel.vue` - Added `onboarding` prop, `tab-change` emit, `setTab()` helper replacing direct `activeTab` assignments, orange pulse styles on Inventory and Abilities tab buttons

## Decisions Made

- z-index 9000 places the hint above floating panels (6) and the command bar (100) but below the death screen overlay (9999) — precise layering
- Auto-dismiss changed to fire only on Abilities tab click rather than on panel open, so players can browse Inventory first without losing the guide
- Orange pulse applied to both Inventory and Abilities tabs to convey "do both of these things"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

Onboarding UX improvements complete. No further onboarding work outstanding from this task.

---
*Phase: quick*
*Completed: 2026-02-21*
