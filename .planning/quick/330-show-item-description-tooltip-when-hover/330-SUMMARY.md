---
phase: quick-330
plan: 01
subsystem: ui
tags: [vue, tooltip, bank, item-data]

# Dependency graph
requires:
  - phase: 14
    provides: buildItemTooltipData composable for rich item tooltip rendering
provides:
  - Bank item tooltips with full description, stats, affixes, armorType, allowedClasses, craftQuality
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [reuse buildItemTooltipData for any panel needing rich item tooltips]

key-files:
  created: []
  modified:
    - src/components/BankPanel.vue
    - src/App.vue

key-decisions:
  - "Cast local ItemTemplateRow to any for buildItemTooltipData since it gracefully handles missing fields via nullish coalescing"

patterns-established:
  - "Any panel displaying items should use buildItemTooltipData to enrich slot data for tooltips"

requirements-completed: [TOOLTIP-01]

# Metrics
duration: 2min
completed: 2026-02-26
---

# Quick 330: Show Item Description Tooltip on Bank Hover Summary

**Bank item tooltips enriched with full item data (description, stats, affixes, armor type, allowed classes, craft quality) via buildItemTooltipData reuse**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T13:57:09Z
- **Completed:** 2026-02-26T13:59:28Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- BankPanel now enriches each resolved slot with full tooltip data via buildItemTooltipData
- App.vue passes itemAffixes prop to BankPanel for affix-aware tooltip rendering
- Bank item tooltips now match inventory item tooltip richness (description, base stats, affix stats, armor type, allowed classes, craft quality)

## Task Commits

Each task was committed atomically:

1. **Task 1: Enrich BankPanel resolved slots with full tooltip data** - `953f5fc` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/components/BankPanel.vue` - Added buildItemTooltipData import, itemAffixes prop, enriched ResolvedSlot interface, tooltip data computation in resolvedSlots computed
- `src/App.vue` - Added :item-affixes="itemAffixes" prop binding to BankPanel component

## Decisions Made
- Cast local ItemTemplateRow to `any` when passing to buildItemTooltipData since the function already handles missing fields gracefully with nullish coalescing (e.g., `template?.description ?? ''`, `template?.armorClassBonus ?? 0n`)
- Spread tooltipData first then override with bank-specific fields to avoid TypeScript duplicate property warnings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript duplicate property warnings**
- **Found during:** Task 1
- **Issue:** Spreading `...tooltipData` after explicitly setting `name` and `qualityTier` caused TS2783 warnings about properties being overwritten
- **Fix:** Moved spread to first position so bank-specific fields override tooltip defaults cleanly
- **Files modified:** src/components/BankPanel.vue
- **Verification:** vue-tsc --noEmit shows no BankPanel errors
- **Committed in:** 953f5fc (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor ordering fix for TypeScript correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bank tooltips now fully functional, matching inventory tooltip richness
- No blockers

## Self-Check: PASSED

- FOUND: src/components/BankPanel.vue
- FOUND: src/App.vue
- FOUND: commit 953f5fc

---
*Phase: quick-330*
*Completed: 2026-02-26*
