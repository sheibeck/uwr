---
phase: quick-176
plan: "01"
subsystem: combat
tags: [enemy-abilities, combat-log, night-enemies, quick-fix]
dependency_graph:
  requires: [quick-170]
  provides: [night-enemy-ability-execution]
  affects: [combat-log, enemy-combat-behavior]
tech_stack:
  added: []
  patterns: [ENEMY_ABILITIES-constant-lookup]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/abilities/enemy_abilities.ts
decisions:
  - Night enemy abilities defined as DoT (physical/magic) and debuff matching level-appropriate power budget from plan spec
  - sonic_screech defined as debuff (effectType ac_bonus, magnitude -2n) matching Gloomwing Bat seeded kind='debuff'
metrics:
  duration: "~3min"
  completed: "2026-02-18"
---

# Phase quick-176 Plan 01: Fix Newly Added Enemies Not Logging Special Ability Names Summary

Added 8 missing ENEMY_ABILITIES definitions so night enemies (quick-170) execute their special abilities instead of falling through to auto-attack.

## What Was Built

The 8 night enemy templates added in quick-170 had their ability keys registered in the EnemyAbility DB table (source #1 for ability selection) but lacked entries in the `ENEMY_ABILITIES` constant in `enemy_abilities.ts` (source #2 for ability execution). When `executeEnemyAbility` looked up `ENEMY_ABILITIES[abilityKey]` and got `undefined`, it silently returned, causing enemies to fall through to auto-attack on the next tick.

### Abilities Added

| Key | Name | Kind | Damage Type | Power | Enemy |
|-----|------|------|-------------|-------|-------|
| `moth_dust` | Moth Dust | dot | physical | 2n | Dusk Moth (L1) |
| `plague_bite` | Plague Bite | dot | physical | 2n | Night Rat (L1) |
| `spectral_flame` | Spectral Flame | dot | magic | 3n | Cinder Wraith (L3) |
| `shadow_pounce` | Shadow Pounce | dot | physical | 4n | Shadow Prowler (L4) |
| `drowning_grasp` | Drowning Grasp | dot | magic | 4n | Bog Specter (L4) |
| `soul_rend` | Soul Rend | dot | magic | 4n | Ashveil Phantom (L5) |
| `venom_fang` | Venom Fang | dot | physical | 2n | Nightfang Viper (L1) |
| `sonic_screech` | Sonic Screech | debuff (ac_bonus -2n) | magic | 3n | Gloomwing Bat (L1) |

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add 8 missing night enemy ability definitions | ed1d519 | spacetimedb/src/data/abilities/enemy_abilities.ts |
| 2 | Publish module | (no commit — publish only) | — |

## Verification

- All 8 ability keys confirmed present in `ENEMY_ABILITIES` constant (lines 453-567)
- No TypeScript errors in `enemy_abilities.ts`
- Module published successfully: "Database updated"
- Pre-existing PANIC in `combat_loop/generateLootTemplates` (BigInt serialization) is unrelated to this fix

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/data/abilities/enemy_abilities.ts` — FOUND (modified)
- Commit `ed1d519` — FOUND
- Module published — CONFIRMED ("Database updated" in logs)
