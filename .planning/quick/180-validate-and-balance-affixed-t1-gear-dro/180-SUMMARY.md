---
phase: quick-180
plan: "01"
subsystem: combat-loot
tags: [balance, loot, crafting, items]
dependency_graph:
  requires: []
  provides: [level-scaled T1 affixed drop rates]
  affects: [spacetimedb/src/helpers/items.ts, spacetimedb/src/reducers/combat.ts]
tech_stack:
  added: []
  patterns: [level-scaled probability, seed-based RNG]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/items.ts
decisions:
  - "Used seed offset +53n for uncommonRoll to avoid collisions with existing offsets (+31, +37, +41, +43, +47)"
  - "Capped levelPct at 30 (not 35) so dangerBonus provides meaningful additional scaling in harder zones"
  - "Cap total uncommonChance at 35% to keep T1 affixed drops clearly below T2+ creature rates"
metrics:
  duration: "< 10 minutes"
  completed: "2026-02-18"
  tasks_completed: 2
  files_changed: 1
---

# Phase quick-180 Plan 01: Validate and Balance Affixed T1 Gear Drop Chances Summary

Level-scaled uncommon drop chance for T1 creatures (5% at L1 scaling to 35% cap at L6+) replacing the hard common-only cap that caused 0% affixed drops.

## What Was Built

Modified `rollQualityTier` in `spacetimedb/src/helpers/items.ts` to handle the `maxTier === 1` case with a level-and-danger-scaled probability instead of always returning 'common'.

### The Fix

**Before:** When `dangerMultiplier` was provided and `maxTier === 1` (all enemies level 1-10), the danger-based tier selection would compute a tier (e.g., uncommon for danger 160), then `if (baseTierNum > maxTier) baseTierNum = maxTier` would clamp it back to 1 = common. Result: 0% affixed drops from any T1 creature regardless of danger.

**After:** When `maxTier === 1`, the function now branches into a dedicated T1 path:
```typescript
const levelPct = Math.min(30, level * 5);           // L1=5%, L6=30%
const dangerBonus = danger > 120 ? Math.floor((danger - 120) / 10) : 0;
const uncommonChance = Math.min(35, levelPct + dangerBonus);
const uncommonRoll = Number((seedBase + 53n) % 100n);
return uncommonRoll < uncommonChance ? 'uncommon' : 'common';
```

## Effective Drop Rates

| Enemy | Danger | Gear Drop% | Uncommon% | Affixed/kill |
|-------|--------|-----------|-----------|--------------|
| L1 animal | 100 | 12% | 5% | ~0.6% |
| L1 humanoid | 100 | 27% | 5% | ~1.4% |
| L3 humanoid | 100 | 31% | 15% | ~4.7% |
| L3 beast | 160 | 16% | 19% | ~3.0% |
| L5 humanoid | 160 | 35% | 29% | ~10.2% |
| L6 undead | 200 | 24% | 35% | ~8.4% |

## Crafting Equivalence

Crafting one affixed T1 item requires ~15-20 kills + gathering (for materials, Lesser Essence at 12%, modifier reagent at 15%). Finding one naturally around L3-5 now requires comparable investment, validating the balance intent.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `spacetimedb/src/helpers/items.ts` has zero TypeScript errors (pre-existing errors in other files are unrelated and pre-date this change)
- T2+ danger-based logic unchanged (maxTier >= 2 path not modified)
- Fallback non-danger code path unchanged
- Seed offset +53n is unique among existing offsets in the function (+31, +37, +41, +43, +47)

## Self-Check: PASSED

- File exists: `spacetimedb/src/helpers/items.ts` - FOUND
- Commit c61eba7 exists - FOUND
- No TypeScript errors introduced in modified file - VERIFIED
