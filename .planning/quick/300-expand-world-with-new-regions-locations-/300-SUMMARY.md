---
phase: quick-300
plan: 01
subsystem: world-content
tags: [world-building, regions, locations, npcs, quests, dialogue, enemies, seeding]

# Dependency graph
requires:
  - phase: 06-quest-system
    provides: quest template schema and quest types (kill, kill_loot, explore, delivery, boss_kill)
  - phase: 19-npc-interactions
    provides: NPC dialogue/affinity tables and interaction reducers
provides:
  - 4 new regions (Greyveil Moors, Silverpine Forest, Ironhold Garrison, Dreadspire Ruins)
  - 40 new locations with interconnected non-linear topology
  - 16 new enemy templates covering levels 3-12 with 2-3 role variants each
  - 15 new NPCs (quest, vendor, lore types)
  - 25 new quests spanning all quest types
  - Dialogue trees for 15 NPCs (8 quest + 7 vendor/lore)
affects: [content-expansion, enemy-balancing, world-events, level-progression]

# Tech tracking
tech-stack:
  added: []
  patterns: [upsertRegionByName, upsertLocationByName, connectIfMissing for world topology]

key-files:
  modified:
    - spacetimedb/src/seeding/ensure_world.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/data/dialogue_data.ts

key-decisions:
  - "Non-linear world topology with 8+ cross-region connections enabling multiple paths"
  - "Dreadspire Ruins (L8-12) designed as group dungeon content with higher rewards"
  - "Dungeon enemies use groupMax: 3n for tougher encounters"
  - "Each non-dungeon region gets a safe town with bindStone and crafting"

patterns-established:
  - "Cross-region connections create loops, not linear chains"
  - "Level scaling via regionType dangerMultiplier (100-280) and location levelOffset (0-6)"

requirements-completed: [WORLD-300]

# Metrics
duration: 9min
completed: 2026-02-23
---

# Quick 300: Expand World with New Regions Summary

**4 new regions (40 locations) with 16 enemy templates (L3-12), 15 NPCs, 25 quests, and full dialogue trees creating an interconnected non-linear world topology**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-24T00:39:07Z
- **Completed:** 2026-02-24T00:48:08Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- World expanded from 3 regions to 7 regions with 10 locations each (70 total locations)
- Non-linear interconnected topology with 8+ cross-region connections enabling multiple paths between regions
- Level range extended from 1-6 to 1-12+ with appropriate enemy scaling for group content
- Complete NPC ecosystem with quest givers, vendors, lore NPCs, and full dialogue trees with affinity-gated content

## Task Commits

Each task was committed atomically:

1. **Task 1: Add new regions, locations, and inter-region connections** - `510a265` (feat)
2. **Task 2: Add new enemy templates and role templates for levels 5-12** - `242957d` (feat)
3. **Task 3: Add NPCs, quests, and dialogue for all new regions** - `60ed4ba` (feat)

## Files Created/Modified
- `spacetimedb/src/seeding/ensure_world.ts` - 4 new regions with 40 locations, 15 NPCs, 25 quests, cross-region connections
- `spacetimedb/src/seeding/ensure_enemies.ts` - 16 new enemy templates with 40+ role templates for levels 3-12
- `spacetimedb/src/data/dialogue_data.ts` - Dialogue trees for 15 NPCs with root nodes, conversation topics, quest offerings, and affinity gates

## World Topology

```
                    Greyveil Moors (L3-5)
                   /        |
  Hollowmere Vale --------- Silverpine Forest (L4-6)
       |                         |
  Embermarch Fringe -------- Ironhold Garrison (L6-8)
       |                         |
  Embermarch Depths          Dreadspire Ruins (L8-12)
       |                    /
  (cross-link via underground passage)
```

## Decisions Made
- Non-linear topology: Hollowmere connects to both Greyveil Moors and Silverpine Forest; Embermarch Fringe connects to Ironhold Garrison via Pyre Overlook shortcut; Embermarch Depths connects to Dreadspire via underground passage
- Dreadspire Ruins enemies use groupMax: 3n and higher XP rewards for group content
- Sage Tindra (lore NPC) given explore quest "The Lost Expedition" to provide quest content in Mossgrave Ruins area
- All new quest NPCs get full dialogue trees with root nodes, 2-4 first-tier topics, quest-granting options, and one affinity-25 gated deeper topic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- World content is seeded and ready for deployment
- Enemy templates are terrain-matched and will auto-populate via ensureLocationEnemyTemplates
- Vendor NPCs will auto-stock via ensureVendorInventory
- Module must be republished to apply new seeding data

---
*Quick Task: 300*
*Completed: 2026-02-23*
