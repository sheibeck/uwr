---
phase: quick-279
plan: "01"
subsystem: ui
tags: [onboarding, z-index, styles, ux]
dependency_graph:
  requires: [quick-278]
  provides: [onboarding-hint-fixed-position]
  affects: [src/ui/styles.ts, src/App.vue]
tech_stack:
  added: []
  patterns: [fixed-position overlay, flex row banner]
key_files:
  modified:
    - src/ui/styles.ts
    - src/App.vue
decisions:
  - "zIndex 500 chosen to sit above floatingPanel (6) and commandSuggestions (100) but below deathOverlay (9999)"
  - "whiteSpace nowrap keeps banner single-line without constraining parent layout"
  - "Replaced inner div with span to avoid forcing block context inside flex row"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-279 Plan 01: Fix New Character Hint Z-Index and Layout Summary

Compact fixed-position onboarding banner with zIndex 500, flex row layout, and corrected instructional text replacing the in-flow block that floated panels could obscure.

## What Was Done

### Task 1 — Fix onboardingHint style (src/ui/styles.ts)
Replaced the old `onboardingHint` block (which had no positioning, sat in the normal flex flow, and used vertical stacking) with a fixed-position banner:

- `position: fixed`, `top: 80px`, `left: 50% / transform: translateX(-50%)` — centres horizontally below the header without affecting layout flow
- `zIndex: 500` — above `floatingPanel` (6) and `commandSuggestions` (100), below `deathOverlay` (9999)
- `display: flex; alignItems: center; gap: 0.75rem` — text and dismiss button side-by-side on one compact strip
- `whiteSpace: nowrap` — prevents wrapping to multiple lines
- Removed `marginBottom` (no longer in flow)
- Updated `onboardingDismiss`: removed `marginTop`, added `flexShrink: 0`

**Commit:** d838a66

### Task 2 — Update hint text and markup (src/App.vue)
- Updated `onboardingHint` computed to return the exact required string: "Open the Character panel, equip your gear from the Inventory tab, then add an ability to your hotbar from the Abilities tab."
- Replaced inner `<div>` wrapping the text with `<span>` (avoids forcing block formatting context inside the flex row)
- Shortened button label from "Dismiss tour" to "Dismiss"

**Commit:** 30bbe32

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript errors observed are all pre-existing (readonly type mismatches in unrelated parts of App.vue, lines 44-209+). None are in onboarding-related code (lines 58-63, 901-906).
- Both modified files contain the correct content per plan spec.
- No new errors introduced.

## Self-Check: PASSED

Files exist:
- FOUND: src/ui/styles.ts (onboardingHint with position fixed, zIndex 500, flex layout)
- FOUND: src/App.vue (span wrapper, correct text, "Dismiss" button label)

Commits exist:
- FOUND: d838a66 — styles.ts onboardingHint fix
- FOUND: 30bbe32 — App.vue hint text and markup fix
