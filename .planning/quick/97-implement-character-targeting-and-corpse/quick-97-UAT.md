---
status: complete
phase: quick-97
source: 97-SUMMARY.md
started: 2026-02-16T22:30:00Z
updated: 2026-02-16T22:41:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Character left-click selection
expected: Left-clicking a character in PLAYERS section toggles blue highlight. Clicking selected character deselects (removes highlight). Clicking different character moves highlight to new character.
result: pass

### 2. Character right-click context menu
expected: Right-clicking a character shows context menu with "Actions" option only (Corpse Summon option removed by design).
result: pass
notes: Expected behavior corrected - Corpse Summon context menu item was intentionally removed, only "Actions" remains

### 3. Hotbar Corpse Summon targeting requirement
expected: Clicking Corpse Summon on hotbar without character selected shows error "You must target a character first". With character selected, sends confirmation request to target.
result: pass

### 4. Hotbar Resurrect targeting requirement
expected: Clicking Resurrect on hotbar without corpse selected shows error "You must target a corpse first". With corpse selected, sends confirmation request to target.
result: pass

### 5. Cast bar after target accepts
expected: When target accepts Corpse Summon or Resurrect, caster sees 10-second cast bar progress indicator.
result: pass

### 6. Mana deducted on acceptance
expected: Resurrect costs 50 mana, Corpse Summon costs 60 mana. Mana deducted when target accepts, not when initiating. If target declines, no mana cost.
result: pass

### 7. Spell execution after cast completes
expected: Resurrect teleports dead character to corpse location with 50% HP/mana. Corpse Summon merges all corpses to caster location.
result: pass

### 8. Cooldown after spell completes
expected: Both spells show 3-second cooldown after cast bar completes and spell executes.
result: pass

### 9. Selection clearing on location change
expected: Moving to different location clears character selection, NPC selection, and corpse selection.
result: issue
reported: "Moving to a different location cleared the character selection, but not the corpse selection"
severity: major

### 10. Context menu Corpse Summon
expected: REMOVED - Corpse Summon context menu option was intentionally removed. Corpse Summon only available via hotbar.
result: skipped
notes: Feature removed by design - only hotbar access remains

## Summary

total: 10
passed: 8
issues: 1
pending: 0
skipped: 1

## Gaps

- truth: "Moving to different location clears character selection, NPC selection, and corpse selection"
  status: failed
  reason: "User reported: Moving to a different location cleared the character selection, but not the corpse selection"
  severity: major
  test: 9
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
