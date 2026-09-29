---
phase: 06-quest-system
plan: 01
subsystem: database
tags: [spacetimedb, quests, combat, npc, schema]

# Dependency graph
requires:
  - phase: 19-npc-interactions
    provides: NPC affinity system and hailNpc infrastructure
provides:
  - QuestTemplate extended with questType, targetLocationId, targetNpcId, targetItemName, itemDropChance fields
  - QuestItem public table for explore quest loot items
  - NamedEnemy public table for boss_kill quest named enemies
  - SearchResult public table for location search results
  - loot_quest_item reducer with aggro chance mechanic
  - pull_named_enemy reducer that spawns named enemy into combat
  - Delivery quest auto-complete in hailNpc without blocking dialogue flow
  - kill_loot drop mechanic in combat kill loop with kill_loot guard on updateQuestProgressForKill
affects:
  - 06-quest-system (plans 02, 03)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "questType optional field defaults via ?? operator: (template.questType ?? 'kill') for backwards compat"
    - "kill_loot quests bypass normal kill counter and advance only via drop mechanic (explicit guard)"
    - "cast timer is client-side UX only - server trusts client called reducer when timer elapsed (same as resource gathering)"

key-files:
  created:
    - "spacetimedb/src/reducers/quests.ts"
  modified:
    - "spacetimedb/src/schema/tables.ts"
    - "spacetimedb/src/index.ts"
    - "spacetimedb/src/reducers/index.ts"
    - "spacetimedb/src/reducers/commands.ts"
    - "spacetimedb/src/reducers/combat.ts"

key-decisions:
  - "questType optional with ?? 'kill' default for full backwards compatibility with existing kill quests"
  - "kill_loot quests excluded from updateQuestProgressForKill via early-continue guard preventing double-completion"
  - "rollKillLootDrop defined as function inside registerCombatReducers closure to access deps.appendPrivateEvent"
  - "Delivery quest completion does NOT return early in hailNpc so follow-up dialogue branches remain visible"
  - "loot_quest_item uses BigInt() cast for deterministic XOR roll to resolve TypeScript type inference issue"
  - "30% aggro chance in loot_quest_item uses try/catch to silently skip if location is safe or no spawn available"
  - "kill_loot drops create QuestItem with discovered=true, looted=true since item drops directly to inventory (no search step)"

patterns-established:
  - "Quest type guard pattern: (template.questType ?? 'kill') === 'kill_loot' — always null-safe"
  - "rollKillLootDrop scoped to registerCombatReducers closure — all new combat-related quest hooks follow this pattern"

# Metrics
duration: 5min
completed: 2026-02-17
---

# Phase 06 Plan 01: Quest System Backend Schema Summary

**Extended QuestTemplate with 5 quest-type fields plus QuestItem, NamedEnemy, SearchResult tables; implemented loot_quest_item and pull_named_enemy reducers, delivery auto-complete in hailNpc, and kill_loot drop mechanic in combat kill loop**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-17T03:28:27Z
- **Completed:** 2026-02-17T03:33:13Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added 5 optional quest type fields to QuestTemplate (questType, targetLocationId, targetNpcId, targetItemName, itemDropChance) with full backwards compatibility
- Created QuestItem, NamedEnemy, SearchResult public tables with proper indexes and registered in schema
- Implemented loot_quest_item reducer with discover/loot validation, explore quest completion, and 30% aggro chance on loot
- Implemented pull_named_enemy reducer that marks named enemy dead and spawns it into active combat
- Wired delivery quest auto-complete into hailNpc without blocking the NPC dialogue flow
- Added kill_loot guard to updateQuestProgressForKill preventing kill count from completing loot-based quests
- Added rollKillLootDrop inside registerCombatReducers closure that rolls item drops on enemy kill

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend QuestTemplate and add QuestItem, NamedEnemy, SearchResult tables** - `969a6c3` (feat)
2. **Task 2: Implement quest type reducers and integration hooks** - `b7c5edc` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - QuestTemplate extended with 5 new fields; QuestItem, NamedEnemy, SearchResult tables added
- `spacetimedb/src/index.ts` - Imports QuestItem, NamedEnemy, SearchResult
- `spacetimedb/src/reducers/quests.ts` - New file with registerQuestReducers: loot_quest_item and pull_named_enemy reducers
- `spacetimedb/src/reducers/index.ts` - Imports and calls registerQuestReducers
- `spacetimedb/src/reducers/commands.ts` - Delivery quest auto-complete block added to hailNpc function
- `spacetimedb/src/reducers/combat.ts` - kill_loot guard in updateQuestProgressForKill; rollKillLootDrop function added and called

## Decisions Made
- questType defaults via `?? 'kill'` for backwards compatibility — undefined = kill quest, no migration needed
- kill_loot quests are excluded from normal kill counter via early-continue guard — they advance ONLY via item drop rolled in rollKillLootDrop
- rollKillLootDrop is a function declaration (not const) inside registerCombatReducers closure so deps is in scope
- Delivery auto-complete in hailNpc does NOT return early — character still sees NPC dialogue tree for follow-up quest chains
- loot_quest_item cast timer is purely client-side — server validates and marks looted when called (same pattern as resource gathering)
- kill_loot drops create QuestItem rows with discovered=true and looted=true since they drop directly without search step

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed BigInt XOR TypeScript type inference error**
- **Found during:** Task 2 (implementing loot_quest_item and rollKillLootDrop)
- **Issue:** `(character.id ^ ctx.timestamp.microsSinceUnixEpoch) % 100n` caused TS2365 error because `any ^ bigint` resolves to `number | bigint`, making `% bigint` ambiguous
- **Fix:** Added explicit `BigInt(character.id)` cast: `(BigInt(character.id) ^ ctx.timestamp.microsSinceUnixEpoch) % 100n`
- **Files modified:** spacetimedb/src/reducers/quests.ts, spacetimedb/src/reducers/combat.ts
- **Verification:** npx tsc --noEmit shows 0 new errors vs baseline
- **Committed in:** b7c5edc (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Trivial type cast fix. No scope creep.

## Issues Encountered
None — all pre-existing TypeScript errors in the codebase (226 errors) remained unchanged. No new errors introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend schema and reducer infrastructure complete for all 4 new quest types
- Plan 02 can add seeding data (NpcDialogueOption quest chains with new questType fields)
- Plan 03 can add client-side UI for quest item looting (cast timer), named enemy pulling, and delivery turn-in display

---
*Phase: 06-quest-system*
*Completed: 2026-02-17*
