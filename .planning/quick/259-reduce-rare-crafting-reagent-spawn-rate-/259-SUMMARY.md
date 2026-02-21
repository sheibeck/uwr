---
phase: quick-259
plan: 01
subsystem: crafting
tags: [spacetimedb, gather, crafting, reagents, balance, typescript]

# Dependency graph
requires: []
provides:
  - "5x-scaled base terrain pool weights in location.ts (all 7 terrains)"
  - "5x-scaled MATERIAL_DEFS gatherEntries weights (4 gatherable materials)"
  - "Modifier reagent spawn rate reduced from ~23% to ~5.7% of gathers"
affects: [crafting, gathering, resource-nodes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pool dilution pattern: scale dominant item weights 5x to reduce rare item share without touching rare item weights"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/location.ts
    - spacetimedb/src/data/crafting_materials.ts

key-decisions:
  - "Scale base pool weights 5x (not reduce modifier weights) to preserve integer weight math — CRAFTING_MODIFIER_WEIGHT_MULTIPLIER=0.5 is broken because floor(1*0.5)=0, max(1,0)=1, so modifier weights always stay at 1n regardless of multiplier"
  - "CRAFTING_MODIFIER_DEFS gatherEntries stay at weight 1n — they are intentionally rare reagents"
  - "No schema changes required — data constant edit only, but module must be republished to maincloud by user"

patterns-established:
  - "Balance reagent scarcity via pool dilution (scale dominant weights) rather than attempting multiplier-based reduction on weight:1n entries"

requirements-completed: [QUICK-259]

# Metrics
duration: 8min
completed: 2026-02-21
---

# Quick-259: Reduce Rare Crafting Reagent Spawn Rate Summary

**Modifier reagent gather share reduced from ~23% to ~5.7% by scaling all terrain base pool weights and MATERIAL_DEFS gather weights 5x, leaving modifier weights at 1n**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- All 7 terrain base pools scaled 5x (mountains, woods, plains, swamp, dungeon, town, city)
- 4 MATERIAL_DEFS gather entries scaled 5x (Copper Ore, Iron Ore, Darksteel Ore, Moonweave Cloth)
- Dungeon modifier share now 3/53 = 5.7% (down from 3/13 = 23%)
- CRAFTING_MODIFIER_DEFS untouched — all 9 modifier reagents remain at weight 1n
- Root cause documented: CRAFTING_MODIFIER_WEIGHT_MULTIPLIER=0.5 was broken (floor(1*0.5)=0, max(1,0)=1 = no effect)

## Task Commits

Each task was committed atomically:

1. **Task 1: Scale base pool weights 5x in location.ts** - `e19f4ac` (feat)
2. **Task 2: Scale MATERIAL_DEFS gatherEntries weights 5x in crafting_materials.ts** - `dca5f4d` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `spacetimedb/src/helpers/location.ts` - All 7 terrain base pool weights multiplied 5x in getGatherableResourceTemplates
- `spacetimedb/src/data/crafting_materials.ts` - MATERIAL_DEFS gatherEntries weights multiplied 5x for 4 gatherable materials

## Decisions Made

- Scaled base pool and MATERIAL_DEFS weights up (5x) rather than trying to fix the CRAFTING_MODIFIER_WEIGHT_MULTIPLIER bug. The multiplier approach is fundamentally broken for weight=1n items (floor(1*0.5)=0, max(1,0)=1 — multiplier has zero effect). Pool dilution via scaling is the correct approach.
- Did not touch CRAFTING_MODIFIER_DEFS weights — they remain at 1n as intended for rarity.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Module must be republished to maincloud by user** for changes to take effect:
```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb --server maincloud -y
```

## Pool Math Verification (Dungeon)

| Category | Items | Total Weight |
|---|---|---|
| Base entries | Iron Shard 15n + Ancient Dust 15n + Stone 10n | 40 |
| Material entries (tier ≤ 3) | Darksteel Ore 10n | 10 |
| Modifier entries | Clear Crystal 1n + Ancient Rune 1n + Iron Ward 1n | 3 |
| **Total** | | **53** |

Modifier share: 3/53 = **5.66%** (target: ~5%, down from ~23%)

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/location.ts (modified, committed e19f4ac)
- FOUND: spacetimedb/src/data/crafting_materials.ts (modified, committed dca5f4d)
- FOUND: .planning/quick/259-reduce-rare-crafting-reagent-spawn-rate-/259-SUMMARY.md (created)

## Next Phase Readiness

- Changes are server-side data constants only — no client changes needed
- Module republish to maincloud required before live players see the change
- CRAFTING_MODIFIER_WEIGHT_MULTIPLIER remains in code as dead weight — could be removed in a future cleanup task

---
*Phase: quick-259*
*Completed: 2026-02-21*
