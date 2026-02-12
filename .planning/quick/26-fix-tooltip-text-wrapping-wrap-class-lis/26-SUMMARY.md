---
phase: quick-26
plan: 01
subsystem: ui
tags: [tooltip, css, text-wrapping]
dependencies:
  requires: []
  provides: [tooltip-word-wrap]
  affects: [tooltip-rendering]
tech-stack:
  added: []
  patterns: [css-overflow-wrap]
key-files:
  created: []
  modified:
    - src/ui/styles.ts
decisions: []
metrics:
  duration_minutes: 0.5
  completed: 2026-02-12T19:42:17Z
---

# Quick Task 26: Fix Tooltip Text Wrapping

**One-liner:** Added `overflowWrap: 'break-word'` to tooltip style to ensure long content wraps within 240px maxWidth boundary instead of overflowing

## Objective

Fix tooltip text wrapping so that long content (especially the "Classes: ..." line listing allowed classes) wraps within the tooltip's maxWidth boundary instead of overflowing horizontally.

## Context

The tooltip had `maxWidth: 240px` configured but lacked any word-wrap CSS property. This caused long class restriction lists (e.g., "Classes: Warrior, Mage, Priest, Ranger") to stretch outside the tooltip bounds, creating visual overflow issues.

## What Was Done

### Task 1: Add word-wrap to tooltip style ✅

**Changes:**
- Added `overflowWrap: 'break-word'` property to the `tooltip` style object in `src/ui/styles.ts`
- Property placed alongside existing `maxWidth: '240px'` to enforce text wrapping
- Used modern `overflowWrap` standard (equivalent to legacy `wordWrap` alias)

**Files Modified:**
- `src/ui/styles.ts` (line 1253): Added overflowWrap property

**Commit:** `9c649a2`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

To verify this fix:
1. Open the game and hover over a bag slot item that has class restrictions (e.g., a weapon with multiple allowed classes)
2. The "Classes: ..." line should now wrap within the tooltip boundary instead of extending past the right edge
3. Other tooltip content (title, description, stats, armor type) should render correctly without any layout issues

## Impact

- **User Experience:** Tooltips now display all content within their visual boundaries, eliminating text overflow
- **Maintainability:** Single CSS property fix applies to all tooltip content uniformly
- **Compatibility:** `overflowWrap: 'break-word'` is supported in all modern browsers

## Technical Notes

- `overflowWrap: 'break-word'` allows long words to break and wrap to the next line when they would otherwise overflow the container
- The existing `maxWidth: '240px'` now functions as intended with proper text wrapping behavior
- This fix applies to all tooltip usage throughout the application (items, abilities, etc.)

## Self-Check: PASSED

**Files exist:**
- FOUND: src/ui/styles.ts (modified with overflowWrap property)

**Commits exist:**
- FOUND: 9c649a2 (fix(quick-26): add word-wrap to tooltip style)

**Changes verified:**
- Tooltip style object now includes overflowWrap property at line 1253
- Property correctly placed between maxWidth and boxShadow for logical grouping
