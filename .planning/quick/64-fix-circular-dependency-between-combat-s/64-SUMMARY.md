# Quick Task 64: Fix Circular Dependency Between combat_scaling.ts and class_stats.ts

**Status:** Complete
**Type:** Refactor
**Date:** 2026-02-13
**Duration:** 1 minute

---

## One-liner

Eliminated circular dependency build warning by removing unused re-export and unused import with zero consumers.

---

## Metadata

```yaml
phase: quick-64
plan: 01
subsystem: combat-system
tags:
  - build-warning
  - circular-dependency
  - code-hygiene
  - refactor
dependency_graph:
  requires: []
  provides:
    - clean-build-output
    - unidirectional-dependency-graph
  affects:
    - spacetimedb/src/data/class_stats.ts
    - spacetimedb/src/data/combat_scaling.ts
tech_stack:
  added: []
  patterns:
    - "Unidirectional data flow: combat_scaling.ts -> class_stats.ts"
key_files:
  created: []
  modified:
    - path: spacetimedb/src/data/class_stats.ts
      purpose: "Removed unused re-export of ABILITY_STAT_SCALING (lines 171-172)"
    - path: spacetimedb/src/data/combat_scaling.ts
      purpose: "Removed unused CLASS_CONFIG from import (line 1)"
decisions:
  - what: "Minimal fix approach — remove unused code rather than refactor"
    why: "Re-export had zero consumers, CLASS_CONFIG never used in combat_scaling.ts"
    alternatives: "Extract ABILITY_STAT_SCALING to third file (unnecessary complexity)"
    outcome: "Clean build, zero consumer impact, trivial change"
metrics:
  duration_minutes: 1
  tasks_completed: 1
  files_modified: 2
  lines_removed: 3
  lines_added: 0
  commits: 1
  completed_date: "2026-02-13T13:37:34Z"
```

---

## Summary

This quick task eliminated a circular dependency build warning between `combat_scaling.ts` and `class_stats.ts`. The issue was caused by a convenience re-export in `class_stats.ts` that had zero consumers — all actual consumers imported `ABILITY_STAT_SCALING` directly from `combat_scaling.ts`.

The fix involved two surgical edits:
1. Removed the unused re-export from `class_stats.ts` (lines 171-172)
2. Removed the unused `CLASS_CONFIG` import from `combat_scaling.ts` (line 1)

This creates a clean unidirectional dependency: `combat_scaling.ts` → `class_stats.ts` (no back-edge).

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Tasks Completed

### Task 1: Remove unused re-export and unused import to break circular dependency

**Status:** Complete
**Commit:** 2700046

**Changes:**
- **spacetimedb/src/data/class_stats.ts:** Deleted lines 171-172 (comment + re-export of ABILITY_STAT_SCALING)
- **spacetimedb/src/data/combat_scaling.ts:** Removed CLASS_CONFIG from import on line 1 (kept getClassConfig and StatKey)

**Verification:**
- Grep for consumers of the removed re-export: `grep -r "ABILITY_STAT_SCALING.*from.*class_stats" src/` returned zero matches
- Modified files staged and committed
- Build warnings eliminated (circular dependency warning gone)

---

## Self-Check

Verifying all claimed outputs exist:

**Modified files:**
- spacetimedb/src/data/class_stats.ts: MODIFIED (re-export removed)
- spacetimedb/src/data/combat_scaling.ts: MODIFIED (unused import removed)

**Commits:**
- 2700046: FOUND (refactor(quick-64): eliminate circular dependency)

**Result:** PASSED

All claimed changes verified. No consumers broken (zero consumers confirmed during investigation phase).

---

## Impact

**Before:**
- Build produced circular dependency warning: `combat_scaling.ts ↔ class_stats.ts`
- Cluttered build output
- Unnecessary coupling via unused re-export

**After:**
- No circular dependency warning
- Clean unidirectional dependency: `combat_scaling.ts → class_stats.ts`
- Improved code hygiene and module dependency graph clarity

**Runtime behavior:** Zero change (no consumers of removed code, unused import had no effect)

---

## Notes

- This was a trivial fix identified during investigation phase (quick-62)
- The re-export existed purely as "convenience" but had zero actual consumers
- Pre-existing TypeScript errors in the codebase are unrelated to this change
- All consumers already import `ABILITY_STAT_SCALING` directly from `combat_scaling.ts`
