---
phase: 04-config-table-architecture
plan: 01
subsystem: database
tags: [spacetimedb, schema-migration, ability-metadata, config-tables]

# Dependency graph
requires:
  - phase: 3.1.1-combat-balance-part-2
    provides: AbilityMetadata interface with DoT/HoT/debuff/AoE fields in ability_catalog.ts
  - phase: 3.1.2-combat-balance-for-enemies
    provides: ABILITY_STAT_SCALING mapping in combat_scaling.ts
provides:
  - AbilityTemplate table with 11 optional metadata columns (power, damageType, statScaling, DoT/HoT/debuff/AoE)
  - Enhanced ensureAbilityTemplates seeding function populating metadata from ABILITIES constant
  - Database-side single source of truth for ability metadata (foundation for Plan 02 consumer migration)
affects: [04-02-config-table-consumers, combat-damage-calculation, ability-tooltips]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional SpacetimeDB columns added at end of table definition for automatic schema migration"
    - "Use undefined (not null) for missing optional SpacetimeDB column values"
    - "Description preservation via resolveDescription helper with ABILITIES.description → legacyDescriptions fallback"

key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts

key-decisions:
  - "All 11 new columns added at end of AbilityTemplate table as optional for automatic SpacetimeDB migration"
  - "statScaling populated from ABILITY_STAT_SCALING mapping, not from ABILITIES constant (separate data source)"
  - "Description preserved using resolveDescription helper: ABILITIES.description with legacyDescriptions fallback"
  - "Metadata fields use undefined (not null) for missing values per SpacetimeDB TypeScript SDK convention"

patterns-established:
  - "Config table extension pattern: add optional columns at end, seed from existing constants, migrate consumers in separate plan"

# Metrics
duration: 3min
completed: 2026-02-13
---

# Phase 04 Plan 01: Config Table Architecture - Ability Metadata Summary

**AbilityTemplate table extended with 11 optional metadata columns (power, damageType, statScaling, DoT/HoT/debuff/AoE) and seeding function enhanced to populate from ABILITIES constant and ABILITY_STAT_SCALING mapping**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-13T14:20:48Z
- **Completed:** 2026-02-13T14:24:20Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Extended AbilityTemplate table with 11 optional metadata columns for complete ability configuration
- Enhanced ensureAbilityTemplates to seed all metadata from ABILITIES constant and ABILITY_STAT_SCALING
- Preserved ability descriptions using resolveDescription helper (ABILITIES.description → legacyDescriptions fallback)
- Created database-side single source of truth for ability metadata (foundation for Plan 02 consumer migration)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend AbilityTemplate table with metadata columns** - `4f3403c` (feat)
2. **Task 2: Enhance ensureAbilityTemplates to seed metadata from ABILITIES** - `bfbf1c0` (feat)

## Files Created/Modified
- `spacetimedb/src/index.ts` - Extended AbilityTemplate table with 11 optional columns (power, damageType, statScaling, dotPowerSplit, dotDuration, hotPowerSplit, hotDuration, debuffType, debuffMagnitude, debuffDuration, aoeTargets); enhanced ensureAbilityTemplates seeding to populate all metadata from ABILITIES and ABILITY_STAT_SCALING

## Decisions Made

**1. All new columns added at end as optional**
- Rationale: SpacetimeDB automatic migration requires new columns at end, all optional
- Impact: Existing rows gain undefined values for new columns; future module publish migrates schema safely

**2. statScaling populated from ABILITY_STAT_SCALING mapping**
- Rationale: statScaling lives in combat_scaling.ts, not ability_catalog.ts (separate data source)
- Impact: Import ABILITY_STAT_SCALING; lookup via key during seeding

**3. Description preservation via resolveDescription helper**
- Rationale: User requested "make sure we don't lose ability descriptions" — descriptions exist in ABILITIES.description with legacyDescriptions fallback
- Impact: Every ability row gets description value (not undefined/null); no data loss

**4. Use undefined for missing optional fields**
- Rationale: SpacetimeDB TypeScript SDK convention — undefined means "not set" for optional columns
- Impact: Consistent with SDK patterns; avoids null/undefined confusion

## Deviations from Plan

None - plan executed exactly as written. Description preservation was explicitly called out in special instructions and handled via existing resolveDescription helper.

## Issues Encountered

None - schema extension and seeding enhancement straightforward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AbilityTemplate table schema extended and populated with all metadata
- Ready for Plan 02: migrate consumers (combat damage calculation, ability tooltips) to read from database
- Module can be published with automatic schema migration (new optional columns at end)
- All abilities have power, damageType, statScaling populated (or undefined for utility abilities)

## Self-Check: PASSED

**Files created/modified verification:**
```
FOUND: spacetimedb/src/index.ts
```

**Commits verification:**
```
FOUND: 4f3403c
FOUND: bfbf1c0
```

All claimed files exist and all commits are in git history.

---
*Phase: 04-config-table-architecture*
*Completed: 2026-02-13*
