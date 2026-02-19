---
phase: quick-190
plan: 01
subsystem: ui
tags: [cleanup, dead-code, colors, refactor, typescript]

# Dependency graph
requires: []
provides:
  - Single source of truth for rarity/quality color maps in src/ui/colors.ts
  - Removal of dead code from server data files
affects: [future-color-usage, crafting-ui, loot-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Color utility module: rarity/craft quality colors centralized in src/ui/colors.ts"
    - "Import from colors.ts for any rarity or craft quality color lookups in client code"

key-files:
  created:
    - src/ui/colors.ts
  modified:
    - spacetimedb/src/index.ts
    - src/App.vue
    - src/components/CraftingModal.vue
    - src/ui/styles.ts

key-decisions:
  - "RARITY_COLORS and CRAFT_QUALITY_COLORS are the canonical hex maps — import from src/ui/colors.ts, not inline maps"
  - "tooltipRarityColor() in App.vue delegates to rarityColor() from colors.ts and keeps its style-object wrapper for Vue binding"
  - "styles.ts references RARITY_COLORS for rarityCommon-rarityLegendary and qualityBorder* values except qualityBorderCommon (#555555) which differs from rarity common (#fff)"

patterns-established:
  - "Pattern: Color single source of truth — all rarity and craft quality color maps go through src/ui/colors.ts"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-02-19
---

# Phase quick-190 Plan 01: Codebase Re-org Audit Summary

**Dead code removed from server data files (dead ABILITIES import, LEGENDARIES block, QUALITY_TIER_COLORS, materialTierToQuality, App.vue.backup) and rarity/craft quality color maps consolidated from 3+2 definitions to 1 source in src/ui/colors.ts**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files modified:** 6 + 1 deleted

## Accomplishments
- Removed dead `ABILITIES` import from `spacetimedb/src/index.ts` (object was already empty/removed)
- Deleted stale `src/App.vue.backup` file with no references anywhere
- Created `src/ui/colors.ts` with `RARITY_COLORS`, `CRAFT_QUALITY_COLORS`, `rarityColor()`, `craftQualityColor()` as single source of truth
- Updated `App.vue` to import from `colors.ts` and remove inline color maps
- Updated `CraftingModal.vue` to import from `colors.ts` and remove local `rarityColor()` and `craftQualityColor` computed inline maps
- Updated `styles.ts` to import `RARITY_COLORS` and reference constants instead of hardcoded hex values

## Task Commits

1. **Task 1: Remove dead code from server data files** - `14aa278` (refactor)
2. **Task 2: Consolidate rarity/quality color maps into single utility** - `6afdcca` (refactor)

## Files Created/Modified
- `src/ui/colors.ts` - New single source of truth for rarity/craft quality color maps
- `spacetimedb/src/index.ts` - Removed dead `ABILITIES` import
- `src/App.vue` - Import rarityColor/craftQualityColor from colors.ts, removed inline maps
- `src/components/CraftingModal.vue` - Import from colors.ts, removed local rarityColor() and craftQualityColor computed
- `src/ui/styles.ts` - Import RARITY_COLORS, replace hardcoded hex values in rarityCommon-rarityLegendary and qualityBorder* entries
- `src/App.vue.backup` - Deleted (stale backup file, untracked)

## Decisions Made
- `qualityBorderCommon` keeps hardcoded `#555555` (dark border for common items) rather than referencing `RARITY_COLORS.common` (`#ffffff`) since the border color intentionally differs from the text color
- `tooltipRarityColor()` in App.vue keeps its function signature (returns `{ color: string }` object) but delegates color lookup to imported `rarityColor()`, maintaining Vue binding compatibility

## Deviations from Plan

### Findings during execution
Several items from the plan's audit findings were already cleaned up prior to this execution by an earlier run:
- `ability_catalog.ts` `ABILITIES = {}` export was already removed
- `affix_catalog.ts` LEGENDARIES comment block, `QUALITY_TIER_COLORS`, `QUALITY_TIER_NUMBER`, `QUALITY_TIERS`, `QualityTier` were already removed
- `crafting_materials.ts` dead `materialTierToQuality()` function was already removed
- `combat.ts` commented-out legendary drop block was already replaced with single-line TODO
- `combat_scaling.ts` had no dead ABILITIES import to remove

The previous execution had already committed both task changes. This execution committed the remaining item: deletion of `src/App.vue.backup` (which was untracked and thus missed by the prior commit).

None - plan executed as specified (prior execution had committed the bulk of the work).

## Issues Encountered
None.

## Next Phase Readiness
- All rarity/craft quality color lookups should use `rarityColor()` and `craftQualityColor()` from `src/ui/colors.ts`
- Any new component needing rarity/quality colors should import from this module

## Self-Check: PASSED

- `src/ui/colors.ts` exists with RARITY_COLORS, CRAFT_QUALITY_COLORS, rarityColor, craftQualityColor exports
- `src/App.vue.backup` does not exist
- No remaining references to removed dead code (LEGENDARIES, QUALITY_TIER_COLORS, QUALITY_TIER_NUMBER, materialTierToQuality, dead ABILITIES import in index.ts)
- No hardcoded rarity hex values in App.vue or CraftingModal.vue (moved to colors.ts)
- commits 14aa278 and 6afdcca exist in git log

---
*Phase: quick-190*
*Completed: 2026-02-19*
