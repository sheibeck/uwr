---
phase: 03-renown-foundation
plan: 01
subsystem: database
tags: [spacetimedb, typescript, faction, standing, renown, rpg]

# Dependency graph
requires:
  - phase: 01-races
    provides: Character table, create_character/delete_character reducers, ensureRaces pattern
  - phase: 02-hunger
    provides: Character lifecycle hooks pattern (hunger row per-character), views pattern (my_hunger)
provides:
  - Faction table (4 factions: Iron Compact, Verdant Circle, Ashen Order, Free Blades) with rivalFactionId cross-links
  - FactionStanding table (per-character, per-faction standing score) with by_character index
  - ensureFactions two-phase seeding function
  - factionId optional field on EnemyTemplate (all 30 templates assigned)
  - grantFactionStandingForKill helper (+10 primary faction, -5 rival on kill)
  - my_faction_standings view (authenticated player's faction standings)
  - Character creation initializes 4 FactionStanding rows at 0
  - Character deletion cleans up FactionStanding rows
  - Kill-based standing mutation in combat loop
affects: quest-system, world-events, renown-ui, renown-rewards

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-phase faction seeding: phase1=insert rows without cross-refs, phase2=wire rivalFactionId after all rows exist"
    - "Per-character standing initialization at character creation time (iterate all factions, insert standing=0)"
    - "Standing mutation via by_character index filter + find by factionId, then upsert"
    - "View using by_character index (NOT .iter()) to comply with SpacetimeDB view restrictions"

key-files:
  created:
    - spacetimedb/src/data/faction_data.ts
    - spacetimedb/src/views/faction.ts
    - src/module_bindings/my_faction_standings_table.ts
    - src/module_bindings/my_faction_standings_type.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/characters.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/views/index.ts
    - spacetimedb/src/views/types.ts
    - src/module_bindings/index.ts

key-decisions:
  - "Kill-based standing only in Phase 3; quest-completion and tribute-based standing deferred to future phases"
  - "Single-column by_character index only on FactionStanding (multi-column indexes broken in SpacetimeDB)"
  - "Standing per kill: +10 to faction enemy belongs to, -5 to rival faction"
  - "FactionStanding rows initialized at character creation for all 4 factions (eager vs lazy)"
  - "Enemy faction assignment: constructs/sentinels=Iron Compact, animals/nature=Verdant Circle, undead/dark=Ashen Order, humanoid outlaws=Free Blades"

patterns-established:
  - "Two-phase seeding: insert without cross-refs first, then wire cross-refs in a second pass"
  - "Per-entity initialization loop: for each faction, insert standing row at creation"

# Metrics
duration: 14min
completed: 2026-02-12
---

# Phase 3 Plan 01: Renown Foundation Summary

**SpacetimeDB faction standing system with 4 factions, per-character standing rows, kill-based standing mutation (+10/-5 rival), my_faction_standings view, and full character lifecycle integration**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-12T03:37:09Z
- **Completed:** 2026-02-12T03:51:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Faction table seeded with 4 factions (Iron Compact, Verdant Circle, Ashen Order, Free Blades) with rival cross-links using two-phase seeding
- FactionStanding table with by_character index; character creation initializes 4 rows at standing 0, deletion cleans them up
- All 30 enemy templates assigned to factions; combat kills call grantFactionStandingForKill for standing mutations
- my_faction_standings view registered and functional, bindings regenerated including MyFactionStandings types

## Task Commits

Each task was committed atomically:

1. **Task 1: Faction/FactionStanding tables, seeding, and schema wiring** - `a759efc` (feat)
2. **Task 2: Wire faction standing into character lifecycle, combat, views, publish and regenerate** - `8be1659` (feat)

## Files Created/Modified
- `spacetimedb/src/data/faction_data.ts` - FACTION_DATA constant (4 factions) and ensureFactions two-phase seeding
- `spacetimedb/src/views/faction.ts` - registerFactionViews with my_faction_standings view
- `spacetimedb/src/views/types.ts` - Added Faction and FactionStanding to ViewDeps
- `spacetimedb/src/views/index.ts` - Import and call registerFactionViews
- `spacetimedb/src/index.ts` - Faction/FactionStanding tables, factionId on EnemyTemplate, standing helpers, schema() and registerViews() wiring
- `spacetimedb/src/reducers/characters.ts` - FactionStanding init in create_character, cleanup in delete_character
- `spacetimedb/src/reducers/combat.ts` - grantFactionStandingForKill call in kill resolution loop
- `src/module_bindings/index.ts` - Regenerated to include faction view types
- `src/module_bindings/my_faction_standings_table.ts` - Generated binding for my_faction_standings view
- `src/module_bindings/my_faction_standings_type.ts` - Generated type for my_faction_standings view

## Decisions Made
- Kill-based standing only (+10 primary, -5 rival). Quest and tribute standing deferred to future phases as planned.
- Single-column `by_character` index only on FactionStanding — multi-column indexes are broken in SpacetimeDB.
- Eager initialization: 4 FactionStanding rows created at character creation time (simpler than lazy creation on first kill).
- Enemy faction assignments made at seeding time (not runtime lookup) for performance.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed unused import of FACTION_DATA in index.ts**
- **Found during:** Task 1 (verification / TypeScript compile)
- **Issue:** `FACTION_DATA` was imported from faction_data.ts into index.ts but never used (the constant is used internally within ensureFactions only)
- **Fix:** Changed import to `import { ensureFactions } from './data/faction_data';`
- **Files modified:** `spacetimedb/src/index.ts`
- **Verification:** TypeScript compilation shows no errors for the new import
- **Committed in:** a759efc (Task 1 commit)

**2. [Rule 3 - Observation] Previous commit (c1a4be5) had already partially implemented Phase 3**
- **Found during:** Task 1 (git status showed no diff for index.ts changes)
- **Issue:** The Phase 2 (Hunger) execution had pre-emptively added Faction/FactionStanding tables, seeding code, faction assignments on enemy templates, and standing helpers to index.ts. Module bindings for faction tables were also already generated.
- **Fix:** No fix needed. The pre-existing work was correct and complete. The remaining work was: creating faction_data.ts (import-able module), views/faction.ts, updating types.ts/views/index.ts, wiring characters.ts and combat.ts, and republishing.
- **Files modified:** N/A (pre-existing work confirmed correct)
- **Committed in:** a759efc captured the new faction_data.ts and import fix

---

**Total deviations:** 2 (1 unused import auto-fixed, 1 pre-existing work discovery)
**Impact on plan:** No scope creep. Pre-existing partial implementation reduced work; remaining pieces were cleanly added.

## Issues Encountered
- SpacetimeDB SQL `IS NOT NULL` filter not supported — used different query to verify faction assignment (queried all factionId values)
- `COUNT(*)` requires column alias in SpacetimeDB SQL — minor SQL quirk, not blocking

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Faction standing system fully operational server-side
- my_faction_standings view returns standings for authenticated player's active character
- Client bindings include Faction, FactionStanding, MyFactionStandings types ready for UI consumption
- Phase 3 Plan 02 (Renown UI) can now consume this data model

---
*Phase: 03-renown-foundation*
*Completed: 2026-02-12*

## Self-Check: PASSED

- spacetimedb/src/data/faction_data.ts: FOUND
- spacetimedb/src/views/faction.ts: FOUND
- src/module_bindings/my_faction_standings_table.ts: FOUND
- src/module_bindings/my_faction_standings_type.ts: FOUND
- .planning/phases/03-renown-foundation/03-01-SUMMARY.md: FOUND
- Commit a759efc: FOUND
- Commit 8be1659: FOUND
