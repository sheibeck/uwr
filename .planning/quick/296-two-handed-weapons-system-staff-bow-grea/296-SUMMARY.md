---
phase: quick-296
plan: 01
subsystem: combat/items
tags: [weapons, two-handed, greatsword, balance, equip-logic]
dependency_graph:
  requires: []
  provides:
    - TWO_HANDED_WEAPON_TYPES constant
    - greatsword weapon type (starter, T1, T2)
    - two-handed equip enforcement in equip_item reducer
    - isTwoHandedWeapon helper
  affects:
    - combat damage calculations (speed/crit changes)
    - starter item grants (shield skip for 2H classes)
    - character creation flow
tech_stack:
  added: []
  patterns:
    - two-handed equip mutual exclusion (auto-unequip conflicting slot)
key_files:
  created: []
  modified:
    - spacetimedb/src/data/combat_constants.ts
    - spacetimedb/src/data/combat_scaling.ts
    - spacetimedb/src/data/item_defs.ts
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/reducers/items.ts
decisions:
  - Greatsword allowed for warrior, paladin, reaver (melee 2H archetype)
  - Staff, bow, greatsword all share 5.0s slow tier
  - Greatsword gets highest melee crit multiplier (250n = 2.5x)
  - Auto-unequip approach for 2H conflicts (no error messages, seamless swap)
metrics:
  duration: ~5 minutes
  completed: 2026-02-23
---

# Quick Task 296: Two-Handed Weapons System Summary

Rebalanced all weapon speed tiers (fast/normal/medium/slow) and introduced greatsword as a new two-handed weapon type with full equip enforcement preventing simultaneous mainHand+offHand for 2H weapons.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Update weapon speed tiers, crit multipliers, and add greatsword to data constants | 83db05c | WEAPON_SPEED_MICROS rebalanced (9 entries), TWO_HANDED_WEAPON_TYPES set, greatsword in crit map and inferWeaponType |
| 2 | Add greatsword item definitions and rebalance base damage values | c235133 | Training Greatsword starter, Crude/Steel Greatsword world drops, staff/bow damage buffed for 5.0s speed |
| 3 | Implement two-handed equip enforcement and update helpers | 380a0d9 | isTwoHandedWeapon helper, equip_item 2H mutual exclusion, shield grant skip for 2H classes |

## Speed Tier Changes

| Tier | Speed | Weapons | Crit |
|------|-------|---------|------|
| Fast | 3.0s | dagger, rapier | 1.5x |
| Normal | 3.5s | sword, blade, mace | 1.75x |
| Medium | 4.0s | axe | 2.0x |
| Slow | 5.0s | staff, bow, greatsword | 2.25x-2.5x |

## Damage Rebalancing

- **Staff/Bow T1**: 4n/5n -> 6n/7n (buffed for slower 5.0s speed)
- **Staff/Bow T2**: 5n/6n -> 8n/8n (buffed for slower 5.0s speed)
- **Greatsword T1**: 7n/8n (new, highest per-hit T1)
- **Greatsword T2**: 9n/10n (new, highest per-hit T2)
- **Starter staff/bow**: 3n/4n -> 4n/5n (buffed)
- **Starter greatsword**: 5n/6n (new, highest starter per-hit)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Module publishes successfully to local SpacetimeDB
- All 9 weapon types present in WEAPON_SPEED_MICROS
- TWO_HANDED_WEAPON_TYPES contains staff, bow, greatsword
- inferWeaponType checks greatsword before sword
- equip_item reducer enforces 2H/offHand mutual exclusion
- Client build errors are pre-existing (readonly type incompatibilities in App.vue), not caused by these changes

## Self-Check: PASSED

All 6 modified files verified present. All 3 task commits (83db05c, c235133, 380a0d9) verified in git log.
