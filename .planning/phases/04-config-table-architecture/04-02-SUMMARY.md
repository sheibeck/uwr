---
phase: 04-config-table-architecture
plan: 02
subsystem: database
tags: [spacetimedb, migration, ability-system, database-lookups]

# Dependency graph
requires:
  - phase: 04-01
    provides: AbilityTemplate table with 11 metadata columns and seeded data
provides:
  - Database-driven ability execution (all ABILITIES constant lookups replaced with DB queries)
  - Removed hardcoded constants (legacyDescriptions block, ABILITY_STAT_SCALING execution usage)
  - Client bindings with full AbilityTemplate metadata exposure
affects: [ability-execution, combat-damage, healing, cooldowns, client-tooltips]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "btree index .filter() pattern for non-unique database lookups"
    - "Database row reuse across function scope to avoid redundant lookups"
    - "Null coalescing for optional DB fields (ability.power ?? 0n)"
    - "Required parameters for database-sourced values (statScaling no longer optional)"

key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/data/combat_scaling.ts
    - src/module_bindings/ability_template_type.ts

key-decisions:
  - "ABILITY_STAT_SCALING kept for seeding only (documented), not for execution"
  - "getAbilityStatScaling now requires statScaling parameter (no fallback to constant)"
  - "legacyDescriptions removed entirely (descriptions already in database)"
  - "All ability lookups use .filter() pattern for btree index (not .find())"
  - "Single ability fetch at executeAbility start, reused throughout function scope"

patterns-established:
  - "Database-driven config pattern: extend table → seed data → migrate consumers → remove constants"

# Metrics
duration: 4min (active work) + 3h58min (user testing/verification)
completed: 2026-02-13
---

# Phase 04 Plan 02: Config Table Architecture - Migrate Consumers to Database Summary

**All ability metadata consumers migrated from hardcoded constants to AbilityTemplate database lookups. legacyDescriptions (85 lines) removed. Combat flows verified working identically.**

## Performance

- **Duration:** 4 min (implementation) + 3h58min (checkpoints + testing)
- **Started:** 2026-02-13T14:26:54Z
- **Completed:** 2026-02-13T22:09:23Z
- **Tasks:** 4 (3 implementation + 1 verification checkpoint)
- **Files modified:** 5 + regenerated bindings

## Accomplishments
- Migrated abilityCooldownMicros and abilityCastMicros helper functions to database lookups
- Migrated executeAbility, damage calculation, and healing blocks to read from database rows
- Updated getAbilityStatScaling to require statScaling from DB (no constant fallback)
- Removed legacyDescriptions block (85 lines of hardcoded descriptions)
- Kept ABILITY_STAT_SCALING for seeding only (documented as seeding-only with comment)
- Regenerated client bindings exposing all 11 new AbilityTemplate columns
- Published module successfully to SpacetimeDB
- Combat flows verified working identically (direct damage, DoT, healing all correct)

## Task Commits

Each task was committed atomically:

1. **Task 1a: Migrate helper functions** - `77fb163` (refactor)
2. **Task 1b: Migrate executeAbility and damage/healing** - `2cfec12` (feat)
3. **Task 2: Remove constants, regenerate bindings, publish** - `88316c1` (chore)
4. **Task 3: Combat verification checkpoint** - User approved (no code changes)

## Files Created/Modified
- `spacetimedb/src/index.ts` - Migrated 5 ABILITIES[ lookups to ctx.db.abilityTemplate.by_key.filter(); removed legacyDescriptions (85 lines); all execution code now reads from database
- `spacetimedb/src/reducers/combat.ts` - Updated abilityCooldownMicros caller to pass ctx parameter
- `spacetimedb/src/reducers/items.ts` - Updated abilityCooldownMicros and abilityCastMicros callers to pass ctx parameter
- `spacetimedb/src/data/combat_scaling.ts` - Made statScaling required parameter in getAbilityStatScaling; kept ABILITY_STAT_SCALING for seeding with documentation comment
- `src/module_bindings/ability_template_type.ts` - Regenerated with 11 new optional fields (power, damageType, statScaling, DoT/HoT/debuff/AoE)

## Decisions Made

**1. Use .filter() pattern for btree index lookups**
- Rationale: by_key is a btree index, not unique constraint; must use .filter() not .find()
- Impact: Pattern `const rows = [...ctx.db.abilityTemplate.by_key.filter(abilityKey)]; const ability = rows[0];` used throughout
- Alternative: Could have made by_key unique, but btree allows future flexibility

**2. Keep ABILITY_STAT_SCALING for seeding only**
- Rationale: Seeding function needs it to populate database; removing would require adding statScaling to all 80+ abilities in ability_catalog.ts
- Impact: Constant kept but documented as "seeding only"; execution code reads from DB parameter
- Alternative: Could have moved statScaling into ability_catalog.ts entries (more work, same result)

**3. Remove legacyDescriptions entirely**
- Rationale: Descriptions already seeded in database from Plan 04-01; fallback no longer needed
- Impact: Reduced ensureAbilityTemplates by 85 lines; descriptions now single-source in DB
- Verification: User confirmed seeding checkpoint showed all abilities have descriptions populated

**4. Reuse ability row across executeAbility scope**
- Rationale: Avoid redundant database lookups; ability fetched once at start, reused in damage/healing blocks
- Impact: Cleaner code, better performance, single fetch point for debugging
- Alternative: Could have re-fetched in each block (wasteful, harder to maintain)

**5. Make statScaling required in getAbilityStatScaling**
- Rationale: All callers now have DB row with statScaling; no fallback needed
- Impact: Function signature change forces compile-time verification of DB migration
- Alternative: Could have kept optional with fallback (hides migration bugs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ABILITY_STAT_SCALING deletion would break seeding**
- **Found during:** Task 2 (constant removal step)
- **Issue:** Plan said to delete ABILITY_STAT_SCALING entirely, but ensureAbilityTemplates uses it to populate statScaling column in database. Removing would cause undefined writes.
- **Fix:** Kept ABILITY_STAT_SCALING constant with documentation comment: "kept for seeding purposes only". Updated getAbilityStatScaling to require statScaling parameter (no fallback to constant).
- **Files modified:** spacetimedb/src/data/combat_scaling.ts
- **Commit:** 88316c1 (included in Task 2 commit)
- **Rationale:** Seeding must continue to work for new abilities; execution code correctly migrated to DB lookups; constant documented as seeding-only prevents future misuse

## Issues Encountered

None - migration executed cleanly. The ABILITY_STAT_SCALING seeding issue was caught during Task 2 and resolved inline per deviation rules.

## User Setup Required

None - module auto-published, client bindings auto-regenerated.

## User-Discovered Issues (During Testing)

**During Task 3 checkpoint verification, user discovered and fixed unrelated cooldown bug:**
- **Issue:** Abilities that failed validation (combat state checks, mana checks, etc) were still going on cooldown
- **Root cause:** Cooldown application happened before execution validation
- **Fix:** User applied fixes in 3 commits (c84bbf5, e5a8275, 409c6b4) to both server and client
- **Impact:** Not related to this plan's migration; opportunistic fix during testing

## Next Phase Readiness

- All ability metadata now read from database, not hardcoded constants
- Client can display ability metadata (power, damageType, statScaling, DoT/HoT/debuff/AoE) from AbilityTemplate table
- Foundation ready for future config table migrations (armor, items, enemies)
- ABILITIES constant still exists for seeding (intentional - adds new abilities to database)
- Pattern established: extend table → seed → migrate consumers → remove execution constants

## Self-Check: PASSED

**Files created/modified verification:**
```
FOUND: spacetimedb/src/index.ts
FOUND: spacetimedb/src/reducers/combat.ts
FOUND: spacetimedb/src/reducers/items.ts
FOUND: spacetimedb/src/data/combat_scaling.ts
FOUND: src/module_bindings/ability_template_type.ts
```

**Commits verification:**
```
FOUND: 77fb163
FOUND: 2cfec12
FOUND: 88316c1
```

All claimed files exist and all commits are in git history.

---
*Phase: 04-config-table-architecture*
*Completed: 2026-02-13*
