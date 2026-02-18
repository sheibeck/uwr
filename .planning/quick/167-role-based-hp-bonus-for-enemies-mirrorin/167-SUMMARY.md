---
phase: quick-167
plan: "01"
subsystem: combat
tags: [enemy-hp, role-config, combat-balance, bug-fix]
dependency_graph:
  requires: []
  provides: [role-based-enemy-hp-bonus, stale-heal-cap-fix]
  affects: [combat.ts, enemy-hp-computation]
tech_stack:
  added: []
  patterns: [role-driven-stat-pattern, template-plus-bonus-formula]
key_files:
  modified:
    - spacetimedb/src/helpers/combat.ts
decisions:
  - "Enemy combat HP = template.maxHp (individual seeded baseline) + role.baseHpBonus + role.hpBonusPerLevel * level — mirrors armor pattern"
  - "HP bonus priority order: tank(60/15) > healer(45/12) > support(35/10) > damage(20/8)"
  - "Enemy heal ability reads combatEnemy.maxHp (computed) not enemyTemplate.maxHp (seeded stale value)"
metrics:
  duration: ~4min
  completed: 2026-02-18
  tasks_completed: 2
  files_modified: 1
---

# Quick Task 167: Role-Based HP Bonus for Enemies Summary

**One-liner:** Individual seeded enemy maxHp preserved as baseline with configurable role HP bonus (baseHpBonus + hpBonusPerLevel * level) added on top, ordered tank > healer > support > damage.

## What Was Done

Added configurable role-based HP bonuses to enemies, mirroring the armor pattern introduced in quick-159. Individual enemy `maxHp` values from `ensure_enemies.ts` are now preserved as the baseline, with an additive role-based bonus on top.

Also fixed a bug where enemy healer abilities capped healing at the stale seeded `template.maxHp` instead of the correct computed combat `maxHp` stored on the `combatEnemy` row.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add role-based HP bonus config and update computeEnemyStats | dfd1ea3 | spacetimedb/src/helpers/combat.ts |
| 2 | Publish module and verify | (no file changes) | — |

## Changes Made

### ENEMY_ROLE_CONFIG Rename and Reorder

**Before:**
```typescript
{ hpPerLevel: bigint; baseHp: bigint; ... }

damage:  { baseHp: 40n,  hpPerLevel: 10n }
tank:    { baseHp: 60n,  hpPerLevel: 15n }
healer:  { baseHp: 30n,  hpPerLevel: 8n  }
support: { baseHp: 35n,  hpPerLevel: 10n }
```

**After:**
```typescript
{ hpBonusPerLevel: bigint; baseHpBonus: bigint; ... }

tank:    { baseHpBonus: 60n, hpBonusPerLevel: 15n }  // most HP
healer:  { baseHpBonus: 45n, hpBonusPerLevel: 12n }  // second
support: { baseHpBonus: 35n, hpBonusPerLevel: 10n }  // third
damage:  { baseHpBonus: 20n, hpBonusPerLevel: 8n  }  // least
```

### computeEnemyStats Formula Change

**Before:**
```typescript
const baseHp = role.baseHp + role.hpPerLevel * effectiveLevel;
```

**After:**
```typescript
const baseHp = template.maxHp + role.baseHpBonus + role.hpBonusPerLevel * effectiveLevel;
```

Now mirrors the existing armor line: `template.armorClass + role.baseArmor + role.armorPerLevel * effectiveLevel`

### Heal Cap Bug Fix

**Before:**
```typescript
const healTargetTemplate = ctx.db.enemyTemplate.id.find(healTarget.enemyTemplateId);
const maxHp = healTargetTemplate?.maxHp ?? 100n;
const nextHp = healTarget.currentHp + directHeal > maxHp ? maxHp : ...
```

**After:**
```typescript
const maxHp = healTarget.maxHp;  // computed combat maxHp, not stale template value
const nextHp = healTarget.currentHp + directHeal > maxHp ? maxHp : ...
```

The `combatEnemy` row already stores the correctly computed `maxHp` from `computeEnemyStats`. Reading from the template was returning the seeded baseline without the role bonus, causing enemy healers to over-heal when the role bonus was significant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed orphaned healTargetTemplate reference in log line**
- **Found during:** Task 1 verification (TypeScript check)
- **Issue:** After removing `healTargetTemplate` from the heal cap code, line 1679 still referenced `healTargetTemplate?.name` in the log message
- **Fix:** Changed `healTarget.displayName ?? healTargetTemplate?.name ?? 'an ally'` to `healTarget.displayName ?? 'an ally'`
- **Files modified:** spacetimedb/src/helpers/combat.ts
- **Commit:** dfd1ea3

## Verification

- ENEMY_ROLE_CONFIG uses `baseHpBonus`/`hpBonusPerLevel` (not `baseHp`/`hpPerLevel`)
- HP priority ordering: tank(60n/15n) > healer(45n/12n) > support(35n/10n) > damage(20n/8n)
- `computeEnemyStats`: `template.maxHp + role.baseHpBonus + role.hpBonusPerLevel * effectiveLevel`
- Enemy heal cap reads from `combatEnemy.maxHp` (not `template.maxHp`)
- `ensure_enemies.ts` was NOT modified
- Module published successfully: `Updated database with name: uwr`
- No runtime errors in logs

## Self-Check: PASSED

- [x] `spacetimedb/src/helpers/combat.ts` exists and modified
- [x] Commit `dfd1ea3` exists: `feat(quick-167): add role-based HP bonus system mirroring armor pattern`
- [x] Module published successfully (no errors in `spacetime logs uwr`)
- [x] No references to old field names (`role.baseHp`, `role.hpPerLevel`) in combat.ts
