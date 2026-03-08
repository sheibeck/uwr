---
phase: quick-368
plan: 01
subsystem: combat
tags: [combat, balance, auto-attack, ui-clarity]
dependency_graph:
  requires: []
  provides: [balanced-auto-attack-damage, labeled-combat-messages]
  affects: [combat-log, player-damage]
tech_stack:
  patterns: [weapon-dps-scaling, level-based-damage]
key_files:
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Auto-attack formula: baseDamage + dps/2 + level + STR for meaningful damage at all levels"
  - "Player auto-attacks labeled with weapon name; enemy auto-attacks use 'strikes' wording"
metrics:
  duration: 2min
  completed: "2026-03-08T19:52:00Z"
  tasks_completed: 1
  tasks_total: 1
---

# Quick Task 368: Fix Auto-Attack Damage and Clarify Combat Messages

Auto-attack damage formula updated to include weapon DPS, character level, and STR bonus (not just baseDamage + STR), yielding 5-6 damage at level 1 instead of 1. All auto-attack messages labeled with weapon name (player) or "strikes" wording (enemy) to distinguish from ability damage.

## What Changed

### Player Auto-Attack Damage Formula
- **Before:** `baseDamage = weapon.baseDamage + STR` (3 + 0 = 3, after armor ~1 damage)
- **After:** `baseDamage = weapon.baseDamage + weapon.dps/2 + character.level + STR` (3 + 2 + 1 + 0 = 6, after armor ~5 damage)
- Scales with weapon quality (DPS), character progression (level), and stats (STR)

### Combat Message Clarity
- Player auto-attack messages now include weapon name: "Your Training Sword hits X for 5 damage"
- Enemy auto-attack messages use "strikes" / "strike": "Goblin strikes you for 4 damage"
- Ability messages remain unchanged ("hits" / "crits"), making the two visually distinct

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix auto-attack damage and label messages | ddc40d2 | spacetimedb/src/reducers/combat.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compiles without new errors (pre-existing errors in corpse.ts/location.ts unchanged)
- Old player auto-attack messages ("You miss", "You hit", "Critical hit on") fully replaced
- Old enemy auto-attack messages ("hits you for", "crits you for") fully replaced
- No changes to resolveAttack, ability damage, or other combat functions

## Self-Check: PASSED
