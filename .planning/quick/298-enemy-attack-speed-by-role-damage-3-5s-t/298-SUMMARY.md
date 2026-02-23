---
phase: 298-enemy-attack-speed-by-role
plan: 01
subsystem: combat
tags: [enemy, attack-speed, balance, combat]
dependency-graph:
  requires: []
  provides: [per-role-enemy-attack-speed, getEnemyAttackSpeed-helper]
  affects: [combat-loop, enemy-dps-balance]
tech-stack:
  patterns: [role-config-driven-timing, inverse-damage-scaling]
key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat_enemies.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/index.ts
decisions:
  - "Damage rebalanced inversely: faster enemies hit softer to preserve DPS"
  - "Initial spawn stagger kept as-is (not role-based) since it is just first-attack offset"
metrics:
  duration: ~5min
  completed: 2026-02-23
---

# Quick Task 298: Enemy Attack Speed by Role Summary

Per-role enemy attack speed: damage 3.5s, tank 5.0s, healer/support 4.0s with inverse damage rebalancing to preserve DPS.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Add attackSpeedMicros to ENEMY_ROLE_CONFIG and rebalance damage | 521ad0a | Added attackSpeedMicros per role, rebalanced baseDamage/damagePerLevel inversely, added getEnemyAttackSpeed helper, computeEnemyStats returns attackSpeedMicros |
| 2 | Use role-based attack speed for enemy auto-attack scheduling | 8c8c12b | Enemy attack loop resolves role template and uses per-role speed instead of hardcoded 5s; pets and pull-add delay unchanged |

## Changes Made

### combat_enemies.ts
- Added `attackSpeedMicros` field to `ENEMY_ROLE_CONFIG` type and all role entries
- Rebalanced per-hit damage inversely with speed (damage: 12->8 base, 5->4/level; healer: 6->5 base; support: 7->6 base, 3->2/level)
- Added `getEnemyAttackSpeed(role)` exported helper
- `computeEnemyStats` now returns `attackSpeedMicros`

### combat.ts
- Added `getEnemyAttackSpeed` to deps destructuring
- In enemy auto-attack loop: look up `enemyRoleTemplateId` to resolve role, then use role-based speed for all three scheduling sites (skip/stagger, after pet attack, after character attack)
- Kept `AUTO_ATTACK_INTERVAL` for pets (line 209, 2483) and pull-add delay (line 1093)

### index.ts
- Added `getEnemyAttackSpeed` to import from combat_enemies and deps object

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compiles (no new errors)
- Module publishes successfully to local SpacetimeDB
- Remaining `AUTO_ATTACK_INTERVAL` usages are only pets and pull-add delay (confirmed via grep)

## Self-Check: PASSED
