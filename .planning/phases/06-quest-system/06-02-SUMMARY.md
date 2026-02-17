---
phase: 06-quest-system
plan: 02
subsystem: quests
tags: [spacetimedb, typescript, quests, npc, dialogue, passive-search]

# Dependency graph
requires:
  - phase: 06-01
    provides: QuestTemplate/QuestItem/NamedEnemy/SearchResult tables and quest reducers
provides:
  - Passive search mechanic (performPassiveSearch helper wired into travel reducer)
  - 14 new quest templates seeded with delivery/kill_loot/explore/boss_kill types
  - 14 affinity-gated NPC dialogue options offering new quest types
  - Delivery chain Marla -> Scout Thessa -> Keeper Mordane
affects: [06-03, 19-03, frontend-quest-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Passive search fires on every location entry via performPassiveSearch in moveOne"
    - "Independent BigInt rolls using bit-shifted seed for separate resource/quest/enemy checks"
    - "upsertQuestByName extended with optional quest type fields for non-kill quest types"

key-files:
  created:
    - spacetimedb/src/helpers/search.ts
  modified:
    - spacetimedb/src/reducers/movement.ts
    - spacetimedb/src/seeding/ensure_world.ts
    - spacetimedb/src/data/dialogue_data.ts

key-decisions:
  - "performPassiveSearch uses BigInt() cast to avoid TypeScript strict mode errors when operating on any-typed ctx fields"
  - "seed = charId XOR nowMicros with bit-shifted variants for 3 independent rolls"
  - "Dialogue options for new quest types added as root-level nodes (parentOptionKey: null) with affinity gates"
  - "14 new quest templates use expanded upsertQuestByName that accepts optional questType/targetLocation/targetNpc/itemDrop fields"
  - "Named enemy name field reuses qt.targetItemName for the boss name per plan convention"

patterns-established:
  - "performPassiveSearch: called after ensureSpawnsForLocation in moveOne, reads fresh character row"
  - "Quest type seeding: kill=default, non-kill types require questType field + type-appropriate target fields"

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 06 Plan 02: Quest Seeding and Passive Search Summary

**Passive search system wired into travel (65%/40%/20% rolls for resources/quest items/named enemies) plus 14 seeded quest templates (delivery, kill_loot, explore, boss_kill) with 14 affinity-gated NPC dialogue branches**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T03:35:32Z
- **Completed:** 2026-02-17T03:39:30Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Created `spacetimedb/src/helpers/search.ts` with `performPassiveSearch` — deletes previous SearchResult, rolls 3 independent BigInt checks for resources (65%), explore quest items (40%), boss_kill named enemies (20%)
- Wired `performPassiveSearch` into `moveOne` in movement.ts after `ensureSpawnsForLocation`
- Extended `upsertQuestByName` helper in ensure_world.ts to support optional questType, targetLocationName, targetNpcName, targetItemName, and itemDropChance fields
- Seeded 14 new quest templates: 2 delivery (Old Debts, Iron Compact Leak), 4 kill_loot (Stolen Supply Cache, Croaker Bile Glands, Encryption Key + Croaker Culling existing), 5 explore, 3 boss_kill
- Added 14 new affinity-gated dialogue options across 7 NPCs with Acquaintance (25) and Friend (50) gates
- Delivery chain: Old Debts (Marla -> Scout Thessa), Iron Compact Leak (Scout Thessa -> Keeper Mordane)

## Task Commits

1. **Task 1: Passive search helper and travel wiring** - `1afd36d` (feat)
2. **Task 2: 14 quest templates and dialogue branches** - `b226a16` (feat)

**Plan metadata:** (upcoming docs commit)

## Files Created/Modified

- `spacetimedb/src/helpers/search.ts` - New performPassiveSearch helper with independent rolls for resources/quest items/named enemies
- `spacetimedb/src/reducers/movement.ts` - Import and call performPassiveSearch after ensureSpawnsForLocation in moveOne
- `spacetimedb/src/seeding/ensure_world.ts` - Extended upsertQuestByName + 14 new quest template seeds
- `spacetimedb/src/data/dialogue_data.ts` - 14 new affinity-gated dialogue options for quest offer branches

## Decisions Made

- BigInt casts (`BigInt(character.id as bigint)`) added to resolve TypeScript strict mode errors when operating on `any`-typed ctx/character fields with bigint literal operands
- Named enemies use `qt.targetItemName` as the enemy's name (per plan convention), since that field holds the boss's display name for boss_kill quests
- All 14 new dialogue options are root-level nodes (`parentOptionKey: null`) with affinity gates — this makes them appear in the NPC dialogue menu when player meets the affinity threshold
- Pre-existing TypeScript errors in movement.ts (TS7006, TS2365) were verified as pre-existing and not introduced by this plan

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed negative modulo in BigInt roll calculations**
- **Found during:** Task 1 (passive search helper)
- **Issue:** TypeScript strict mode: `((seed >> 8n) ^ (seed * 7n)) % 100n` on `any`-typed values fails with "Operator '%' cannot be applied to types 'number' and 'bigint'"
- **Fix:** Added explicit `BigInt()` casts for charId and nowMicros, and explicit `: bigint` type annotations on roll variables
- **Files modified:** spacetimedb/src/helpers/search.ts
- **Verification:** tsc --noEmit shows no errors in search.ts
- **Committed in:** 1afd36d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Type safety fix required for strict TypeScript compilation. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in movement.ts (TS7006, TS2365) were present before this plan. Confirmed via git stash test — they existed in the original file.

## Next Phase Readiness

- Passive search fires on every location entry, SearchResult rows created with deterministic pseudo-random rolls
- 14 quest templates seeded with correct types, targets, and item names
- 14 dialogue options visible to players meeting affinity thresholds
- Ready for Phase 06-03 (frontend quest display integration) and Phase 19-03 (NPC interaction frontend)

---
*Phase: 06-quest-system*
*Completed: 2026-02-17*
