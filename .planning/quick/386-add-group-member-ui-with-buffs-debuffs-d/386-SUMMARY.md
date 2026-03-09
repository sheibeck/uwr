---
phase: quick-386
plan: 01
subsystem: ui
tags: [group-ui, combat, buffs, targeting]
dependency_graph:
  requires: [effectTimers, GroupPanel-data-shapes]
  provides: [GroupMemberBar-component, persistent-group-status-bar]
  affects: [NarrativeConsole, App]
tech_stack:
  added: []
  patterns: [fixed-position-overlay, click-to-target, effect-timer-reuse]
key_files:
  created:
    - src/components/GroupMemberBar.vue
  modified:
    - src/components/NarrativeConsole.vue
    - src/App.vue
decisions:
  - GroupMemberBar positioned fixed at top:44px (below 44px NarrativeHud)
  - Self card uses gold/amber left border; group members use neutral gray border
  - Scroll area paddingTop increased from 52px to 107px to prevent content hiding
  - Effect timer Map kept local to GroupMemberBar (same pattern as GroupPanel)
metrics:
  duration: 3min
  completed: "2026-03-09"
---

# Quick Task 386: Group Member UI with Buffs/Debuffs Summary

Persistent horizontal group member bar below NarrativeHud showing self + group member HP/mana/stamina bars, buff/debuff badges with countdown timers, and click-to-target defensive targeting.

## Changes Made

### Task 1: Create GroupMemberBar component (aa79052)
- Created `src/components/GroupMemberBar.vue` (170 lines template + script)
- Self card always shown with gold left border; group members with neutral border
- HP (red), Mana (blue), Stamina (orange) thin 10px bars with current/max labels
- Buff badges in green (#51cf66), debuff badges in red (#ff6b6b) with duration countdown
- Click any card to emit target event; targeted card gets cyan glow box-shadow
- Leader star indicator; other members sorted alphabetically
- Reuses effectLabel, effectIsNegative, effectRemainingSeconds from effectTimers.ts

### Task 2: Wire into NarrativeConsole and App.vue (82dd1a8)
- NarrativeConsole: imported GroupMemberBar, added 5 new optional props + target emit
- NarrativeConsole: rendered GroupMemberBar below NarrativeHud inside selectedCharacter guard
- NarrativeConsole: increased scroll paddingTop from 52px to 107px for overlay clearance
- App.vue: passed groupCharacterMembers, relevantEffects, defensiveTargetId, nowMicros, leaderId
- App.vue: forwarded @target to setDefensiveTarget handler

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx vue-tsc --noEmit` passes (only pre-existing App.vue warnings, no new errors)
- GroupMemberBar renders below NarrativeHud at fixed top:44px
- Solo mode shows only self card; group mode shows all members
- Click-to-target sets defensiveTargetId with visual highlight
- Effects display with color coding and countdown timers

## Self-Check: PASSED
