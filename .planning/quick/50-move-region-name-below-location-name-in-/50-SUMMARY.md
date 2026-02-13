---
phase: quick-50
plan: 01
subsystem: ui-location-panel
tags: [ui, travel, readability, layout]
dependency-graph:
  requires: []
  provides: [two-line-travel-layout, directional-arrows]
  affects: [location-panel, travel-section]
tech-stack:
  added: []
  patterns: [two-line-flex-layout, unicode-arrows, inline-style-overrides]
key-files:
  created: []
  modified:
    - src/components/TravelPanel.vue
    - src/ui/styles.ts
decisions:
  - name: "Removed gridSectionLabel top margin globally"
    rationale: "TRAVEL is first section in panel body which already has padding; other sections (ENEMIES, RESOURCES) still have spacing from gap property"
    alternatives: ["Inline override only for TRAVEL"]
    choice: "Global change to gridSectionLabel marginTop with inline override for TRAVEL as safety measure"
  - name: "Arrow character selection via modulo index"
    rationale: "Cycles through 8 directional arrows (up, right, down, left, diagonals) based on tile position"
    alternatives: ["Random arrow", "Fixed arrow per location"]
    choice: "Deterministic index-based cycling for consistent UX"
  - name: "Two-line layout with flex-direction column"
    rationale: "Separates location name + level from region name for improved readability"
    alternatives: ["Side-by-side with smaller region text", "Three-line layout"]
    choice: "Two-line with region below at reduced opacity"
metrics:
  duration_seconds: 96
  tasks_completed: 1
  files_modified: 2
  commits: 1
  completed_at: "2026-02-13T02:30:00Z"
---

# Quick Task 50: Move Region Name Below Location Name in Travel Panel

**One-liner:** Two-line travel tile layout with directional arrows, larger fonts, and zero TRAVEL label margin for improved readability and navigation cues.

## Objective

Restyle the Travel section in the Location panel to improve readability: move region name below the location name (two-line layout), increase font sizes, add directional arrows back to each travel tile, and remove the top margin above the TRAVEL section label.

**Purpose:** Improve travel area readability and restore visual navigation cues.

## Changes Made

### Task 1: Restyle travel tiles with two-line layout, arrows, increased font, and remove TRAVEL label top margin

**Files modified:** `src/components/TravelPanel.vue`, `src/ui/styles.ts`

**In `src/ui/styles.ts`:**
1. Changed `gridSectionLabel` marginTop from `'0.5rem'` to `'0rem'` — removes padding above section labels globally since first section (TRAVEL) is in panel body that already has padding
2. Changed `gridTileTravel` fontSize from `'0.88rem'` to `'0.95rem'` for better readability
3. Changed `gridTileTravel` alignItems from `'center'` to `'flex-start'` to support two-line text layout with top-aligned arrow

**In `src/components/TravelPanel.vue`:**
1. Added `directionArrows` array with 8 unicode arrow characters: up, right, down, left, upper-right, lower-right, lower-left, upper-left
2. Updated `v-for` from `v-for="entry in sortedLocations"` to `v-for="(entry, index) in sortedLocations"` to access index for arrow cycling
3. Restructured tile inner content to two-line layout:
   - Arrow character on left (1rem font size, color matched to con color)
   - Column container with two rows:
     - Row 1: Location name (0.95rem) + Level indicator (0.75rem)
     - Row 2: Region name (0.75rem, 50% opacity)
4. Added inline style override to TRAVEL label: `[styles.gridSectionLabel, { marginTop: 0 }]` as safety measure to ensure zero margin even if global style changes

**Commit:** `3cd521f`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- [x] TravelPanel renders with two-line tile layout (name+level on top, region below)
- [x] Each tile shows a directional arrow character on the left (cycling through 8 arrows)
- [x] Font sizes increased from 0.88rem to 0.95rem for location names
- [x] Arrow at 1rem font size, region name at 0.75rem with 50% opacity
- [x] TRAVEL section label has marginTop: 0 (both global change and inline override)
- [x] No TypeScript compilation errors in TravelPanel.vue
- [x] LocationGrid section labels unaffected (ENEMIES, RESOURCES, etc. still use gridSectionLabel)

## Success Criteria

All success criteria met:

1. ✅ Region name displays below location name in travel tiles
2. ✅ Directional arrows cycle through 8 arrow characters across tiles
3. ✅ Font size increased for location names (0.88rem → 0.95rem)
4. ✅ No padding/margin above TRAVEL label (marginTop: 0rem)
5. ✅ No regressions in LocationGrid styling

## Key Decisions Made

1. **Global marginTop change with inline safety override:** Changed gridSectionLabel marginTop to 0rem globally since TRAVEL (first section) appears in panel body with existing padding. Added inline override on TRAVEL label as safety measure. Other sections (ENEMIES, RESOURCES) still get spacing from gap property on floatingPanelBody.

2. **Deterministic arrow cycling:** Arrow characters cycle based on index modulo 8, ensuring consistent arrows for each position in the sorted list rather than random assignment.

3. **Two-line flex layout:** Used flex-direction: column to stack location name + level above region name, with region name at reduced opacity (0.5) for visual hierarchy.

## Self-Check: PASSED

**Files created:** None
**Files modified:**
- FOUND: C:\projects\uwr\src\components\TravelPanel.vue
- FOUND: C:\projects\uwr\src\ui\styles.ts

**Commits:**
- FOUND: 3cd521f

All claimed artifacts verified present on disk and in git history.
