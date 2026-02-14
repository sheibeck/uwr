---
phase: 11-death-corpse-system
plan: 01
subsystem: combat
tags: [spacetimedb, death-mechanics, corpse-system, loot-recovery, typescript]

# Dependency graph
requires:
  - phase: combat-system
    provides: Combat defeat handling, character death detection, XP penalty system
  - phase: item-system
    provides: ItemInstance table with ownership and equipped state tracking
  - phase: character-system
    provides: Character respawn, location binding, character deletion cleanup
provides:
  - Corpse and CorpseItem tables with level-gating (5+) and same-location combining
  - createCorpse helper transferring inventory items (not equipped) to corpse
  - 30-day decay cleanup system with item deletion
  - loot_corpse_item and loot_all_corpse reducers with ownership verification
  - Corpse location messaging on respawn
affects: [ui-panels, loot-system, death-penalties, resurrection-mechanics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opportunistic cleanup on related operations (respawn triggers decay check)"
    - "Same-location entity combining with timestamp refresh pattern"
    - "Level-gated feature activation (corpse creation at level 5+)"
    - "Item ownership preservation through corpse looting (ItemInstance.ownerCharacterId unchanged)"

key-files:
  created:
    - spacetimedb/src/schema/tables.ts: "Corpse and CorpseItem table definitions"
    - spacetimedb/src/helpers/corpse.ts: "createCorpse, cleanupDecayedCorpses, removeCorpseIfEmpty helpers"
    - spacetimedb/src/reducers/corpse.ts: "loot_corpse_item and loot_all_corpse reducers"
  modified:
    - spacetimedb/src/reducers/combat.ts: "Corpse creation on character death"
    - spacetimedb/src/reducers/characters.ts: "Respawn corpse messaging, delete cleanup"
    - spacetimedb/src/reducers/index.ts: "Register corpse reducers"
    - spacetimedb/src/index.ts: "Add corpse helpers to deps"

key-decisions:
  - "Corpse creation level gating at 5+ (matches existing XP penalty threshold)"
  - "Same-location corpse combining updates timestamp to newest death"
  - "ItemInstance ownership never changes (items return by deleting CorpseItem row)"
  - "Decay cleanup runs opportunistically on respawn (not scheduled reducer)"
  - "Empty corpse auto-deletion on loot completion for cleanliness"

patterns-established:
  - "Level-gated feature pattern: `if (character.level < 5n) return null`"
  - "Same-location entity combining: find existing by location, update timestamp"
  - "Opportunistic cleanup hooks: respawn/login operations trigger decay check"
  - "Ownership verification pattern: corpse.characterId !== character.id guard"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 11 Plan 01: Backend Corpse System Summary

**Level-gated corpse creation (5+) with inventory-only item transfer, 30-day decay, same-location combining, and ownership-verified looting reducers**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T06:27:24Z
- **Completed:** 2026-02-14T06:32:46Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Corpse and CorpseItem tables with by_character and by_location indexes for efficient queries
- Level 5+ characters create corpses on death, levels 1-4 skip corpse creation entirely
- Only unequipped inventory items transfer to corpse; equipped items and gold stay on character
- Same-location corpse combining prevents corpse spam (updates timestamp to newest death)
- loot_corpse_item (single item) and loot_all_corpse (batch) reducers with location + ownership verification
- 30-day decay cleanup with permanent item deletion and player notification
- Empty corpses auto-delete after final item looted
- Respawn shows corpse location message listing all corpse locations with unique names

## Task Commits

Each task was committed atomically:

1. **Task 1: Corpse and CorpseItem tables + createCorpse helper** - `77bccfa` (feat)
2. **Task 2: Death hook in combat, respawn modification, corpse looting reducers** - `8afc294` (feat)
3. **Task 3: Publish module and regenerate client bindings** - `79b2ef8` (feat)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - Corpse and CorpseItem table definitions with indexes
- `spacetimedb/src/helpers/corpse.ts` - createCorpse, cleanupDecayedCorpses, removeCorpseIfEmpty helpers
- `spacetimedb/src/reducers/corpse.ts` - loot_corpse_item and loot_all_corpse reducers
- `spacetimedb/src/reducers/combat.ts` - Corpse creation before XP penalty in both defeat paths
- `spacetimedb/src/reducers/characters.ts` - Respawn corpse messaging, delete cleanup, decay cleanup
- `spacetimedb/src/reducers/index.ts` - Register corpse reducers
- `spacetimedb/src/index.ts` - Import and add corpse helpers/tables to reducerDeps
- `src/module_bindings/corpse_table.ts` - Generated Corpse table bindings
- `src/module_bindings/corpse_item_table.ts` - Generated CorpseItem table bindings
- `src/module_bindings/loot_corpse_item_reducer.ts` - Generated single-item loot reducer
- `src/module_bindings/loot_all_corpse_reducer.ts` - Generated batch loot reducer

## Decisions Made
- **Level gating threshold:** Used `character.level < 5n` to match existing XP penalty threshold (`character.level <= 5n` skips penalty, so corpse starts at level 5)
- **Same-location combining:** When character dies at location with existing corpse, reuse corpse row and update createdAt timestamp to current time (newest death time used for decay)
- **Item ownership preservation:** ItemInstance.ownerCharacterId never changes during corpse creation/looting - items return by simply deleting CorpseItem row
- **Decay cleanup trigger:** Opportunistic cleanup on respawn (not scheduled reducer) to avoid overhead - check only happens when player explicitly respawns
- **Empty corpse cleanup:** removeCorpseIfEmpty called after single-item loot, batch loot always deletes corpse - prevents empty corpse rows

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Pre-existing TypeScript compilation errors:** Server and client codebases have pre-existing type errors (RowBuilder property access before insert/update, Row type usage patterns). These errors existed before corpse system work and are unrelated to Task 1-3 implementation. Corpse-specific code follows established patterns in the codebase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Backend corpse system complete and ready for Plan 02 (UI integration):
- Corpse and CorpseItem tables available in client bindings
- loot_corpse_item and loot_all_corpse reducers callable from client
- Corpse location messaging already displays on respawn
- Ready for Location panel "Points of Interest" section showing corpses
- Ready for corpse context menus and loot UI

No blockers. Plan 02 can proceed with UI implementation.

## Self-Check: PASSED

All files exist:
- spacetimedb/src/schema/tables.ts ✓
- spacetimedb/src/helpers/corpse.ts ✓
- spacetimedb/src/reducers/corpse.ts ✓
- spacetimedb/src/reducers/combat.ts ✓
- spacetimedb/src/reducers/characters.ts ✓
- src/module_bindings/corpse_table.ts ✓
- src/module_bindings/loot_corpse_item_reducer.ts ✓

All commits exist:
- 77bccfa ✓
- 8afc294 ✓
- 79b2ef8 ✓

---
*Phase: 11-death-corpse-system*
*Completed: 2026-02-14*
