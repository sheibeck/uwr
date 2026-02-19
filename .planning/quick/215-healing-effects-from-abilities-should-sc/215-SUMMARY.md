---
phase: quick-215
plan: 01
subsystem: combat-scaling
tags: [healing, stat-scaling, combat, decisions]
dependency_graph:
  requires: []
  provides: [stat-scaled-healing]
  affects: [calculateHealingPower, applyHeal]
tech_stack:
  added: []
  patterns: [stat-scaling-via-getAbilityStatScaling]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/combat_scaling.ts
    - spacetimedb/src/helpers/combat.ts
decisions:
  - "Healing abilities now use getAbilityStatScaling (same path as damage) rather than a flat WIS-only multiplier — aligns with Decision #32, #34, #35"
  - "calculateHealingPower signature changed to (baseHealing, characterStats, className, statScaling) — old (baseHealing, casterWis, className) removed"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-19"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase quick-215 Plan 01: Healing Effects Scale from Ability statScaling Summary

Healing abilities now scale via `getAbilityStatScaling` (identical path to damage), using each class's primary/secondary stat rather than a hardcoded WIS multiplier.

## What Was Built

- `calculateHealingPower` in `combat_scaling.ts` now accepts `characterStats` and `statScaling` instead of a raw `casterWis` bigint. It delegates to `getAbilityStatScaling` internally, preserving Decision #32 (class gate for non-hybrid stats), Decision #34 (60/40 hybrid formula), and Decision #35 (1n per point scaling).
- `applyHeal` in `combat.ts` builds a `characterStats` object from the caster and passes `ability?.statScaling ?? 'none'` to both call-sites (direct heal and HoT path).

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Update calculateHealingPower signature and body | 3c4b7fa |
| 2 | Thread characterStats + statScaling through applyHeal | a4dcbce |

## Verification Results

1. Old 3-argument call-sites in `combat.ts` are gone — `grep calculateHealingPower.*character.wis` returns no results.
2. Both new 4-argument call-sites present — confirmed via grep.
3. TypeScript errors previously at `combat.ts(724)` and `combat.ts(733)` are resolved; all remaining errors are pre-existing in unrelated files.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/data/combat_scaling.ts` modified with new `calculateHealingPower` signature.
- `spacetimedb/src/helpers/combat.ts` modified with `characterStats` object and updated `calculateHealingPower` calls.
- Commits 3c4b7fa and a4dcbce verified in git log.
