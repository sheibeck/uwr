---
phase: 20-perk-variety-expansion
plan: "02"
subsystem: renown-perks
tags: [perks, renown, combat, gathering, vendor, npc-affinity, travel, gold, xp]
dependency_graph:
  requires:
    - phase: 20-01
      provides: PerkEffect type with proc/crafting/social/scaling fields, 30 domain-categorized perks
  provides:
    - getPerkProcs helper for querying proc-type perks by event
    - getPerkBonusByField helper for summing perk bonus fields with level scaling
    - getAllPerkEffects helper for merged passive bonus totals
    - applyPerkProcs function for combat proc application with deterministic RNG
    - Gathering perk bonuses (double yield, rare materials) in finish_gather reducer
    - Vendor buy/sell price modifiers in buy_item/sell_item reducers
    - NPC affinity gain bonus in awardNpcAffinity helper
    - Travel cooldown reduction in move_character reducer
    - Gold find bonus applied to combat gold rewards
    - XP bonus applied to combat XP base before level calculation
  affects: [renown, combat, gathering, vendor, npc-affinity, travel]
tech_stack:
  added: []
  patterns:
    - getPerkBonusByField pattern for on-demand perk bonus queries at integration sites
    - applyPerkProcs pattern for deterministic RNG proc triggering (seed % 100n)
    - BigInt(100 + bonus) / 100n pattern for percentage bonus application
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/helpers/npc_affinity.ts
    - spacetimedb/src/reducers/movement.ts
    - spacetimedb/src/index.ts
key-decisions:
  - "Proc RNG uses (seed + perkIndex) % 100n deterministic arithmetic — no Math.random"
  - "on_kill AoE proc (Deathbringer) iterates all living combat enemies except the killed one"
  - "gatherDoubleChance and rareGatherChance are mutually exclusive — double check fires first"
  - "vendorBuyDiscount capped at 50% maximum to prevent free purchases"
  - "travelCooldownReduction capped at 80% maximum to prevent zero cooldown"
  - "NPC affinity bonus only applied for positive changes, not negative (no diplomacy discount on hostile actions)"
  - "XP bonus applied to base XP before awardCombatXp so level-scaling diff modifier still applies correctly"
metrics:
  duration: "25min"
  completed: "2026-02-17"
  tasks: 2
  files: 7
---

# Phase 20 Plan 02: Perk Logic Implementation Summary

Passive perk effect hooks fully wired across all game systems: combat proc triggering with deterministic RNG, double-yield gathering with rare material rolls, vendor buy/sell price modifiers, NPC affinity multipliers, travel cooldown reduction, gold find bonus, and XP bonus — all reading from character's chosen perks via new helper functions.

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-17T18:10:00Z
- **Completed:** 2026-02-17T18:34:51Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `getPerkProcs`, `getPerkBonusByField`, and `getAllPerkEffects` helpers to `renown.ts` for on-demand perk queries
- Added `applyPerkProcs` to `helpers/combat.ts` with full proc system: procDamageMultiplier, procHealPercent, procBonusDamage, on_kill AoE support
- Wired combat procs at on_hit/on_crit/on_kill/on_damage_taken events in `reducers/combat.ts`
- Applied gathering perks (double yield + rare materials) in `finish_gather` with deterministic seed-based rolls
- Applied vendor buy discount and sell bonus in `buy_item`/`sell_item` reducers
- Applied NPC affinity gain bonus in `awardNpcAffinity` for positive affinity changes only
- Applied travel cooldown reduction when calculating `readyAt` for cross-region travel
- Applied gold find bonus to combat gold reward and XP bonus to base XP before `awardCombatXp`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add perk query helpers and implement combat proc system** - `5eaa4d0` (feat)
2. **Task 2: Implement crafting/gathering and social/utility perk bonuses** - `53447da` (feat)

## Files Created/Modified

- `spacetimedb/src/helpers/renown.ts` - Added getPerkProcs, getPerkBonusByField, getAllPerkEffects helpers
- `spacetimedb/src/helpers/combat.ts` - Added applyPerkProcs function and import for getPerkProcs
- `spacetimedb/src/reducers/combat.ts` - Wired proc hooks at auto-attack hit/crit/kill/damage_taken points; applied gold find and XP bonus at reward sites
- `spacetimedb/src/reducers/items.ts` - Applied gathering perk bonuses (finish_gather), vendor buy discount (buy_item), vendor sell bonus (sell_item)
- `spacetimedb/src/helpers/npc_affinity.ts` - Applied npcAffinityGainBonus in awardNpcAffinity for positive changes
- `spacetimedb/src/reducers/movement.ts` - Applied travelCooldownReduction when setting cross-region cooldown
- `spacetimedb/src/index.ts` - Added executePerkAbility to exports (from stash; pre-existing work)

## Decisions Made

- Proc RNG uses `(seed + perkIndex) % 100n` deterministic arithmetic — consistent with existing combat RNG patterns in `rollAttackOutcome`
- on_kill AoE proc (Deathbringer) iterates `ctx.db.combatEnemy.by_combat.filter(combatId)` and skips the already-dead enemy
- gatherDoubleChance and rareGatherChance are mutually exclusive (double fires first, rare fires only if double didn't) — prevents compounding
- vendorBuyDiscount capped at `Math.min(vendorBuyDiscount, 50)` to prevent exploitative free purchases
- travelCooldownReduction capped at `Math.min(travelCdReduction, 80)` to keep minimum 20% of base cooldown
- NPC affinity bonus only applied for positive baseChange values — negative interactions (hostile NPC) shouldn't benefit from Smooth Talker
- XP bonus applied to base XP before calling `awardCombatXp` so the level diff modifier (xpModifierForDiff) still applies correctly

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

The stash system accidentally reverted movement.ts and npc_affinity.ts during a TypeScript compilation test. Files were recovered from the stash and verified correct before final commit. Pre-existing TypeScript errors in sell_all_junk (items.ts:247) and movement.ts cooldown check existed before this plan and were not introduced by this work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 20 Plan 02 complete — all perk effect types are now functional
- Gathering perks, combat procs, social/utility bonuses all wired and verified via module publish
- Phase 20 is now complete (Plans 01 and 02 done)
- Ready to begin Phase 13 (Crafting), Phase 16 (Travelling NPCs), or another expansion phase

## Self-Check: PASSED

Files verified:
- spacetimedb/src/helpers/renown.ts: EXISTS
- spacetimedb/src/helpers/combat.ts: EXISTS
- spacetimedb/src/reducers/items.ts: EXISTS
- spacetimedb/src/helpers/npc_affinity.ts: EXISTS
- spacetimedb/src/reducers/movement.ts: EXISTS

Commits verified:
- 5eaa4d0: feat(20-02): add perk proc system and combat integration
- 53447da: feat(20-02): implement crafting/gathering and social/utility perk bonuses
