---
phase: quick-165
plan: 01
subsystem: combat-scaling
tags: [ability-scaling, class-balance, hybrid-formula, combat]
dependency_graph:
  requires: []
  provides: [correct-ability-stat-scaling-for-all-16-classes]
  affects: [spacetimedb/src/data/combat_scaling.ts, ability_template-table]
tech_stack:
  added: []
  patterns: [class-config-aware-hybrid-formula, 60-40-weighted-split]
key_files:
  modified:
    - spacetimedb/src/data/combat_scaling.ts
decisions:
  - "Hybrid formula uses 60% primary + 40% secondary from CLASS_CONFIG instead of hardcoded STR+INT sum"
  - "Enchanter damage abilities use CHA (primary), not INT"
  - "Paladin damage abilities use WIS (primary), not hybrid — paladin has no secondary stat"
  - "Ranger/Monk/Beastmaster/Bard use hybrid formula with their respective CLASS_CONFIG stats"
  - "clear-database republish required to re-seed AbilityTemplate rows with corrected statScaling values"
metrics:
  duration: ~3min
  completed: "2026-02-18"
  tasks: 3
  files: 1
---

# Quick Task 165: Ability Stat Scaling Audit/Fix Summary

**One-liner:** Corrected 17 ability scaling entries across 6 classes and replaced hardcoded STR+INT hybrid formula with 60/40 CLASS_CONFIG-aware weighted split.

## What Was Done

### Task 1: Fix hybrid formula in getAbilityStatScaling (commit 75b0d2d)

Replaced the hardcoded `(str + int) * 1n` hybrid branch with a class-config-aware 60/40 weighted split:

```typescript
// Before
return (characterStats.str + characterStats.int) * 1n;

// After
const config = getClassConfig(className);
if (config.secondary) {
  const primaryVal = characterStats[config.primary] ?? 0n;
  const secondaryVal = characterStats[config.secondary] ?? 0n;
  return ((primaryVal * 60n + secondaryVal * 40n) / 100n) * ABILITY_STAT_SCALING_PER_POINT;
}
return characterStats[config.primary] * ABILITY_STAT_SCALING_PER_POINT;
```

### Task 2: Fix 17 incorrect ABILITY_STAT_SCALING entries (commit 44e9540)

| Class | Abilities | Old | New | Reason |
|-------|-----------|-----|-----|--------|
| enchanter | mind_fray, slow, charm_fray | int | cha | enchanter primary=cha |
| paladin | holy_strike, radiant_smite | hybrid | wis | paladin primary=wis, no secondary |
| ranger | marked_shot, rapid_shot, piercing_arrow | wis | hybrid | primary=dex, secondary=wis |
| monk | crippling_kick, palm_strike, tiger_flurry | str | hybrid | primary=dex, secondary=str |
| beastmaster | pack_rush, beast_fang, alpha_assault | str | hybrid | primary=str, secondary=dex |
| bard | discordant_note, echoed_chord, crushing_crescendo | cha | hybrid | primary=cha, secondary=int |

Classes unchanged (already correct): warrior (str), rogue (dex), wizard/necromancer/summoner (int), cleric/druid/shaman (wis), spellblade/reaver (already hybrid — formula fix changes behavior).

### Task 3: Republish module (commit 065758d)

Ran `spacetime publish uwr --clear-database -y --project-path spacetimedb`. Module initialized cleanly with no panics. AbilityTemplate rows re-seeded with corrected statScaling values.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

### Files created/modified
- [x] spacetimedb/src/data/combat_scaling.ts — modified

### Commits
- [x] 75b0d2d — fix(quick-165): update hybrid formula to 60/40 primary/secondary split
- [x] 44e9540 — fix(quick-165): correct 17 ability scaling entries per CLASS_CONFIG audit
- [x] 065758d — chore(quick-165): republish module with corrected ability statScaling seeds

## Self-Check: PASSED
