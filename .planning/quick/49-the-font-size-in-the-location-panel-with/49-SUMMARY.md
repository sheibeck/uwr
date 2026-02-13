---
phase: quick-49
plan: 01
subsystem: ui
tags: [ui, readability, location-panel, font-size]
dependency-graph:
  requires: []
  provides: [location-panel-readability]
  affects: [LocationGrid, styles]
tech-stack:
  added: []
  patterns: [inline-styles, theme-constants]
key-files:
  created: []
  modified:
    - src/ui/styles.ts
    - src/components/LocationGrid.vue
decisions: []
metrics:
  duration: 2min
  tasks: 1
  files: 2
  commits: 1
  completed: 2026-02-13
---

# Quick Task 49: Increase Location Panel Font Sizes

**One-liner:** Bumped all Location panel font sizes by ~0.1rem (0.65→0.75, 0.78→0.88) for improved readability while maintaining visual hierarchy.

---

## Summary

Increased font sizes throughout the Location panel (LocationGrid component and related grid styles) to improve readability. All section labels, tile text, and secondary information now display at larger, more comfortable sizes while preserving the existing visual hierarchy where section headers are smaller than tiles, and secondary info is smaller than primary content.

**Changed sizes:**
- Section headers (ENEMIES, RESOURCES, PLAYERS, NPCS): 0.65rem → 0.75rem
- Grid tiles (enemies, resources, players): 0.78rem → 0.88rem
- Travel destination tiles: 0.78rem → 0.88rem
- Travel "Go" buttons: 0.70rem → 0.78rem
- Enemy group count: 0.70rem → 0.78rem
- Empty players message: 0.75rem → 0.85rem
- NPC descriptions: 0.65rem → 0.75rem

---

## Tasks Completed

### Task 1: Bump Location panel font sizes in styles.ts and LocationGrid.vue

**Status:** ✅ Complete

**Changes made:**

In `src/ui/styles.ts`, increased four style definitions:
1. `gridSectionLabel.fontSize`: 0.65rem → 0.75rem (section headers like "ENEMIES", "RESOURCES")
2. `gridTile.fontSize`: 0.78rem → 0.88rem (enemy/resource/player tiles)
3. `gridTileTravel.fontSize`: 0.78rem → 0.88rem (travel destination tiles)
4. `gridTileGoButton.fontSize`: 0.70rem → 0.78rem (travel "Go" buttons)

In `src/components/LocationGrid.vue`, increased three inline font sizes:
5. Line 32 - enemy group count `x{{ enemy.groupCount }}`: 0.70rem → 0.78rem
6. Line 95 - empty players "No other adventurers here.": 0.75rem → 0.85rem
7. Line 127 - NPC description text: 0.65rem → 0.75rem

All changes follow the plan's +0.1rem increment pattern. Only fontSize values were modified - no changes to colors, spacing, padding, borders, or other style properties.

**Verification:**
- Confirmed old font sizes (0.65rem, 0.70rem, 0.75rem in targeted locations) no longer present
- All seven fontSize updates verified in place
- Visual hierarchy maintained (section labels < tiles < secondary info remains consistent)

**Files modified:**
- `src/ui/styles.ts` - 4 fontSize changes in grid style definitions
- `src/components/LocationGrid.vue` - 3 fontSize changes in inline styles

**Commit:** `3e4f765` - feat(quick-49): increase Location panel font sizes for readability

---

## Deviations from Plan

None - plan executed exactly as written. All seven font size increases applied as specified, with no additional changes required.

---

## Technical Details

### Font Size Changes Rationale

The original font sizes (0.65-0.78rem) were too small for comfortable reading of location information. The ~0.1rem bump brings all text into a more readable range (0.75-0.88rem) while maintaining proportional relationships:

- **Section headers** remain smaller than tile content (0.75rem vs 0.88rem)
- **Primary tile text** is largest and most prominent (0.88rem)
- **Secondary info** (group counts, descriptions) is slightly smaller (0.75-0.78rem) but still readable

This preserves the visual hierarchy where the most important information (enemy names, resource names, player names) stands out, while supporting information remains visually subordinate but legible.

### Implementation Approach

Changes were split between:
1. **Global style definitions** (`styles.ts`) - for reusable grid components
2. **Inline styles** (`LocationGrid.vue`) - for context-specific text like group counts and descriptions

This follows the existing pattern in the codebase where common grid styles are centralized in the theme system, while component-specific variations use inline styles.

---

## Validation

**Build status:** Pre-existing TypeScript errors present (unrelated to this change)
- The project has existing TS type errors in App.vue and composables
- These errors existed before the font size changes and are not caused by this task
- The font size changes themselves are valid CSS and have no syntax errors

**Grep verification:**
- ✅ No instances of old font sizes (0.7rem, 0.65rem) remain in LocationGrid.vue
- ✅ `gridSectionLabel`, `gridTile`, `gridTileTravel`, `gridTileGoButton` all show updated values
- ✅ All seven targeted fontSize properties successfully updated

---

## Self-Check: PASSED

**Files created:** None (modification-only task)

**Files modified:**
- ✅ FOUND: C:\projects\uwr\src\ui\styles.ts
- ✅ FOUND: C:\projects\uwr\src\components\LocationGrid.vue

**Commits:**
- ✅ FOUND: 3e4f765 (feat(quick-49): increase Location panel font sizes for readability)

All artifacts confirmed present.

---

## Impact

**Immediate:**
- Location panel text noticeably more readable
- All sections (ENEMIES, RESOURCES, PLAYERS, NPCS) easier to scan
- Travel destinations and NPC descriptions more comfortable to read

**User experience:**
- Reduced eye strain when reviewing location contents
- Faster information processing due to improved legibility
- Visual hierarchy preserved - no confusion about information priority

**Maintenance:**
- Minimal impact - only fontSize values changed
- No breaking changes to layout or functionality
- Easy to adjust further if needed (all values centralized in styles.ts or inline)
