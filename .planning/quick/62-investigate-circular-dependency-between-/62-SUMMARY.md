---
phase: quick-62
plan: 01
type: investigation
completed: 2026-02-13
duration: 53s
subsystem: spacetimedb-module-data
tags: [investigation, circular-dependency, build-warnings, code-hygiene]
dependency-graph:
  requires: []
  provides: [circular-dependency-root-cause, fix-recommendation]
  affects: [combat_scaling.ts, class_stats.ts]
tech-stack:
  added: []
  patterns: [import-analysis, consumer-analysis]
key-files:
  analyzed: [spacetimedb/src/data/combat_scaling.ts, spacetimedb/src/data/class_stats.ts]
  created: [.planning/quick/62-investigate-circular-dependency-between-/62-INVESTIGATION-REPORT.md]
  modified: []
decisions:
  - Confirmed re-export on class_stats.ts:172 has zero consumers
  - Runtime impact assessed as warning-only (no runtime errors)
  - Recommended fix: remove re-export lines (minimal risk)
metrics:
  tasks: 1
  commits: 1
  files_analyzed: 2
  files_created: 1
  grep_searches: 3
---

# Quick Task 62: Investigate Circular Dependency Between combat_scaling.ts and class_stats.ts

**One-liner:** Identified unused re-export on class_stats.ts:172 as root cause of circular dependency build warning (zero consumers, trivial fix)

---

## Objective

Investigate the circular dependency between `combat_scaling.ts` and `class_stats.ts`, determine root cause, assess runtime impact, and document recommended fix.

---

## Context

Build emits circular dependency warning:
```
combat_scaling.ts -> class_stats.ts -> combat_scaling.ts
```

Need to understand whether this causes runtime issues and how to resolve it.

---

## Tasks Completed

### Task 1: Trace circular dependency chain and document root cause

**Status:** ✅ Complete
**Commit:** bc02bf2

**Investigation findings:**

#### Circular dependency chain traced:

1. **Direction 1:** `combat_scaling.ts` → `class_stats.ts`
   - Line 1 imports: `{ CLASS_CONFIG, getClassConfig, type StatKey }`
   - `getClassConfig()` — USED by `calculateHealingPower()` (line 317)
   - `StatKey` type — USED by `getAbilityStatScaling()` (line 280)
   - `CLASS_CONFIG` — IMPORTED BUT NEVER USED (unused import)

2. **Direction 2:** `class_stats.ts` → `combat_scaling.ts`
   - Lines 171-172: Re-export `ABILITY_STAT_SCALING` from `combat_scaling.ts`
   - Comment: "Re-export ABILITY_STAT_SCALING from combat_scaling for convenience"

#### Consumer analysis:

Performed grep search across entire `spacetimedb/src/` directory:
```bash
grep -r "ABILITY_STAT_SCALING.*from.*class_stats" spacetimedb/src/
```

**Result:** NO MATCHES — zero consumers of the re-export

All consumers import `ABILITY_STAT_SCALING` directly from `combat_scaling.ts`.

#### Root cause determination:

**The re-export on line 172 of `class_stats.ts` creates the back-edge of the circular dependency.**

This is a "convenience" re-export with **zero actual consumers**. Removing this single line eliminates the circular dependency entirely.

#### Runtime impact assessment:

**Severity:** Low (build warning only, no runtime errors)

The circular dependency does NOT cause runtime errors because:
- Both modules are data/constant files with no side effects at module scope
- `combat_scaling.ts` only uses `getClassConfig()` at CALL TIME (inside functions), not at module initialization
- `class_stats.ts` only re-exports a const from `combat_scaling.ts`
- Node.js/bundlers handle this by returning a partially-initialized module

However, it's still a code smell that produces build warnings and makes the dependency graph harder to reason about.

#### Recommended fix:

**Minimal fix (30 seconds, zero risk):**

1. **File:** `spacetimedb/src/data/class_stats.ts`
   - Delete line 171: `// Re-export ABILITY_STAT_SCALING from combat_scaling for convenience`
   - Delete line 172: `export { ABILITY_STAT_SCALING } from './combat_scaling.js';`

2. **File:** `spacetimedb/src/data/combat_scaling.ts`
   - Line 1: Remove unused `CLASS_CONFIG` from import
   - Before: `import { CLASS_CONFIG, getClassConfig, type StatKey } from './class_stats.js';`
   - After: `import { getClassConfig, type StatKey } from './class_stats.js';`

**Verification:**
- Run build to confirm circular dependency warning is gone
- Run tests to verify no runtime issues

**Alternative fix (not recommended):**
Extract `ABILITY_STAT_SCALING` into third file (`ability_scaling_map.ts`) that both files import from. Unnecessary complexity given zero consumers.

---

## Deviations from Plan

None - plan executed exactly as written. All investigation steps completed successfully.

---

## Key Decisions

1. **Confirmed zero consumers of re-export** — comprehensive grep search found no imports of `ABILITY_STAT_SCALING` from `class_stats.ts`
2. **Runtime impact classified as warning-only** — no runtime errors occur, circular dependency handled gracefully by bundlers
3. **Minimal fix recommended** — remove 2 lines from `class_stats.ts`, trim 1 import from `combat_scaling.ts`
4. **Alternative fix deemed unnecessary** — no need to extract into third file given zero consumers

---

## Testing and Verification

### Investigation completeness verification:

- ✅ Both directions of circular import identified with line numbers
- ✅ All consumers of re-export checked (grep search across entire codebase)
- ✅ Runtime impact assessed (no runtime errors, build warning only)
- ✅ Fix recommendation documented with specific file paths and line numbers
- ✅ Alternative approaches considered and evaluated

### Files analyzed:
- `spacetimedb/src/data/combat_scaling.ts` (341 lines)
- `spacetimedb/src/data/class_stats.ts` (173 lines)

### Grep searches performed:
1. `ABILITY_STAT_SCALING.*from.*class_stats` — no matches
2. `from ['"]\.\/class_stats` — 1 match (combat_scaling.ts import)
3. `CLASS_CONFIG` in combat_scaling.ts — 1 match (unused import)

---

## Artifacts

### Created files:
- `.planning/quick/62-investigate-circular-dependency-between-/62-INVESTIGATION-REPORT.md` — full investigation report with executive summary, dependency chain analysis, root cause, impact assessment, and fix recommendation

---

## Impact

**Module:** `spacetimedb/src/data/`
**Severity:** Low (code hygiene issue)
**Runtime risk:** None (warning-only)
**Fix effort:** Trivial (2-line deletion + 1 import trim)

### Benefits of applying fix:
- ✅ Eliminates build warning clutter
- ✅ Simplifies module dependency graph
- ✅ Improves code hygiene
- ✅ Removes unused code path
- ✅ Zero risk (no consumers affected)

---

## Self-Check: PASSED

### Investigation completeness:
✅ Both directions of circular dependency identified
✅ Consumer analysis completed (grep search)
✅ Root cause documented with line numbers
✅ Runtime impact assessed
✅ Fix recommendation documented
✅ Alternative approaches evaluated

### Files verified:
✅ FOUND: .planning/quick/62-investigate-circular-dependency-between-/62-INVESTIGATION-REPORT.md

### Commits verified:
✅ FOUND: bc02bf2 (investigation report)

---

## Next Steps

**Recommended action:** Apply the fix (remove lines 171-172 from class_stats.ts, trim CLASS_CONFIG import from combat_scaling.ts)

**Priority:** Low (warning-only issue, no runtime impact)

**Estimated effort:** 30 seconds

**Verification after fix:**
1. Run `npm run build` in `spacetimedb/` directory
2. Confirm circular dependency warning is gone
3. Run tests to verify no runtime issues

---

## Notes

This was a pure investigation task with no code changes. The circular dependency is caused by a convenience re-export that serves no purpose (zero consumers). The fix is trivial and carries zero risk.
