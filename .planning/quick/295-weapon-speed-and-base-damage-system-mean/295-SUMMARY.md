---
phase: quick
plan: "295"
subsystem: combat
tags: [weapon-speed, auto-attack, balance, dps-normalization]
dependency-graph:
  requires: [combat_constants, combat_scaling, item_defs, combat.ts, movement.ts]
  provides: [WEAPON_SPEED_MICROS, getWeaponSpeed, per-weapon-type auto-attack intervals]
  affects: [processPlayerAutoAttacks, combat participant creation, movement join-combat]
tech-stack:
  patterns: [inverse-damage-scaling, speed-tier-map, weapon-speed-lookup]
key-files:
  created: []
  modified:
    - spacetimedb/src/data/combat_constants.ts
    - spacetimedb/src/data/combat_scaling.ts
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/data/item_defs.ts
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/movement.ts
decisions:
  - "4 speed tiers: fast 3.0s, normal 3.5s, medium 4.0s (baseline), slow 5.0s"
  - "Default fallback for unarmed/unknown is 4.0s (medium)"
  - "AUTO_ATTACK_INTERVAL kept at 5s for enemies, pets, and pull delay"
  - "Damage scaled inversely with speed to normalize DPS across weapon types"
metrics:
  duration: "~6 minutes"
  completed: "2026-02-23"
---

# Quick Task 295: Weapon Speed and Base Damage System Summary

Per-weapon-type auto-attack intervals with inverse damage scaling so DPS stays balanced across weapon types. Fast weapons (daggers, rapiers) swing every 3s for less per hit; slow weapons (axes) swing every 5s for more per hit.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define weapon speed constants and rebalance weapon base damage | 8a595ef | combat_constants.ts, combat_scaling.ts, items.ts, item_defs.ts, ensure_items.ts |
| 2 | Wire weapon speed into the combat loop and all auto-attack scheduling | bb50bbb | combat.ts, movement.ts |
| 3 | Publish locally, regenerate bindings, verify no runtime errors | (verify only) | No code changes |

## What Changed

### New Constants (combat_constants.ts)
- `WEAPON_SPEED_MICROS` map: dagger/rapier=3.0s, staff/bow=3.5s, sword/blade/mace=4.0s, axe=5.0s
- `DEFAULT_WEAPON_SPEED_MICROS` = 4.0s fallback for unarmed/unknown weapon types
- `AUTO_ATTACK_INTERVAL` retained at 5s for enemies, pets, and pull delay calculation

### New Helper (combat_scaling.ts)
- `getWeaponSpeed(weaponType)` returns weapon auto-attack interval in microseconds

### Extended Return Type (helpers/items.ts)
- `getEquippedWeaponStats()` now returns a `speed` field (bigint, microseconds)
- Unarmed fallback returns `DEFAULT_WEAPON_SPEED_MICROS` (4.0s)

### Rebalanced Weapon Damage (item_defs.ts, ensure_items.ts)
Damage scaled inversely with weapon speed to keep DPS roughly equal:

**Tier 1 (world drops):**
| Type | Speed | baseDamage | dps |
|------|-------|------------|-----|
| Dagger, Rapier | 3.0s | 3n | 5n |
| Staff, Bow | 3.5s | 4n | 5n |
| Sword, Blade, Mace | 4.0s | 4n | 6n |
| Axe | 5.0s | 5n | 8n |

**Tier 2 (world drops):**
| Type | Speed | baseDamage | dps |
|------|-------|------------|-----|
| Dagger, Rapier | 3.0s | 4n | 5n |
| Staff, Bow | 3.5s | 5n | 6n |
| Sword, Blade, Mace | 4.0s | 5n | 7n |
| Axe | 5.0s | 7n | 9n |

**Starter weapons:** Speed-adjusted per type (dagger/rapier: 2n/4n, staff/bow: 3n/4n, sword/blade/mace: 3n/5n, axe: 4n/6n).

### Combat Loop Changes (combat.ts, movement.ts)
- `processPlayerAutoAttacks`: player auto-attack scheduling uses `weapon.speed` instead of flat `AUTO_ATTACK_INTERVAL`
- Combat participant creation: uses equipped weapon speed at combat start
- Movement join-combat: uses equipped weapon speed instead of hardcoded 5s constant
- Added TODO comment for future haste effect integration

### Unchanged
- Enemy auto-attacks: still use `AUTO_ATTACK_INTERVAL` (5s)
- Pet auto-attacks: still use `AUTO_ATTACK_INTERVAL` (5s)
- Pull add delay: still uses `AUTO_ATTACK_INTERVAL * PULL_ADD_DELAY_ROUNDS`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. Server module published locally without errors
2. Database initialized and seeded cleanly (no runtime errors in logs)
3. Client bindings regenerated successfully (no schema changes)
4. No type errors in modified files (pre-existing errors in unrelated files are out of scope)
5. `AUTO_ATTACK_INTERVAL` confirmed remaining only in enemy/pet/pull-delay paths

## Self-Check: PASSED

All modified files exist and compile. Both task commits verified in git log.
