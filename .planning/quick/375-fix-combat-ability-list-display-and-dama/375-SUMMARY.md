---
phase: quick-375
plan: 01
subsystem: combat-ui
tags: [bugfix, combat, race-condition]
dependency_graph:
  requires: []
  provides: [combat-ui-visibility-fix]
  affects: [src/App.vue, spacetimedb/src/reducers/combat.ts]
tech_stack:
  patterns: [same-batch-event-scanning, fallback-watcher]
key_files:
  modified:
    - src/App.vue
    - spacetimedb/src/reducers/combat.ts
decisions:
  - Scan ALL private events when isInCombat becomes true (not just new ones) since events arrive in same reducer transaction batch
  - No combat damage logging gap found -- all ability kinds produce appendPrivateEvent calls via resolveAbility
metrics:
  duration: 2min
  completed: "2026-03-08T20:48:00Z"
  tasks_completed: 3
  tasks_total: 3
---

# Quick Task 375: Fix Combat Ability List Display and Damage Logging

Fixed combatIntroSeen race condition by scanning all existing private events on combat start instead of using baseline-offset pattern; verified combat damage logging is complete across all ability kinds.

## Task Results

### Task 1: Fix combatIntroSeen race condition so combat UI appears
- **Commit:** f028d50
- **Files:** src/App.vue
- **What:** Replaced the baseline-offset pattern (combatEventBaseline) with a full-scan approach. The old pattern set the baseline to the current event count when isInCombat became true, but the intro event ("The world grows still around you.") was already in the same SpacetimeDB transaction batch, so the baseline equaled the new length and the length watcher never fired. The fix scans ALL existing events immediately when combat starts, with a length watcher as fallback for multi-batch delivery.

### Task 2: Investigate and verify combat damage logging completeness
- **Commit:** 3be2806
- **Files:** spacetimedb/src/reducers/combat.ts
- **What:** Investigated resolveAbility in helpers/combat.ts. All ability kinds (damage, heal, dot, hot, buff, debuff, aoe_damage, aoe_heal) log via appendPrivateEvent. No logging gap found. Added clarifying comment to processPlayerAutoAttackForRound noting that ability damage is logged separately.

### Task 3: Publish and verify
- **What:** Published to local SpacetimeDB. No schema changes, no binding regeneration needed.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- Type checking passed (no new errors introduced)
- Server module published successfully to local SpacetimeDB
- Combat action bar should now appear within 1-2s of combat starting
- All combat damage (auto-attacks + abilities) confirmed to produce narrative events
