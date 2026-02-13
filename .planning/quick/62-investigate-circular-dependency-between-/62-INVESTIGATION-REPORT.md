# Investigation Report: Circular Dependency Between combat_scaling.ts and class_stats.ts

**Date:** 2026-02-13
**Investigation type:** Build warning triage
**Status:** Root cause identified, fix documented

---

## Executive Summary

The circular dependency warning between `combat_scaling.ts` and `class_stats.ts` is caused by a convenience re-export on line 172 of `class_stats.ts` that has **zero consumers**. The issue causes build warnings but no runtime errors. The fix is trivial: remove lines 171-172 from `class_stats.ts` and trim unused import from `combat_scaling.ts`.

---

## Circular Dependency Chain

```
combat_scaling.ts -> class_stats.ts -> combat_scaling.ts
```

### Direction 1: combat_scaling.ts → class_stats.ts

**File:** `spacetimedb/src/data/combat_scaling.ts`
**Line:** 1
**Import:** `import { CLASS_CONFIG, getClassConfig, type StatKey } from './class_stats.js';`

**Usage analysis:**
- `getClassConfig()` — **USED** by `calculateHealingPower()` (line 317) to check if class has wis as primary/secondary stat
- `StatKey` type — **USED** by `getAbilityStatScaling()` (line 280) for type safety
- `CLASS_CONFIG` — **IMPORTED BUT NEVER USED** in any function body (unused import)

### Direction 2: class_stats.ts → combat_scaling.ts

**File:** `spacetimedb/src/data/class_stats.ts`
**Lines:** 171-172

```typescript
// Re-export ABILITY_STAT_SCALING from combat_scaling for convenience
export { ABILITY_STAT_SCALING } from './combat_scaling.js';
```

**Consumer analysis:**
- Search performed: `grep -r "ABILITY_STAT_SCALING.*from.*class_stats" spacetimedb/src/`
- **Result:** NO MATCHES
- All consumers import `ABILITY_STAT_SCALING` directly from `combat_scaling.ts`

---

## Root Cause

**The re-export on line 172 of `class_stats.ts` creates the back-edge of the circular dependency.**

This re-export exists purely as a "convenience" feature but has **zero actual consumers**. It serves no purpose and can be removed with zero impact.

---

## Runtime Impact Assessment

**Severity:** Low (build warning only, no runtime errors)

### Why it doesn't break at runtime:

1. Both modules are **data/constant files** with no side effects at module initialization scope
2. `combat_scaling.ts` only uses `getClassConfig()` at **call time** (inside function bodies), not during module initialization
3. `class_stats.ts` only re-exports a const from `combat_scaling.ts`
4. Node.js/bundlers handle circular dependencies by returning a partially-initialized module during the cycle

### Why it's still a problem:

- Produces build warnings that clutter output
- Makes module dependency graph harder to reason about
- Code smell indicating unnecessary coupling
- May cause issues with stricter bundlers or future tooling changes

---

## Recommended Fix

**Approach:** Minimal fix (remove unused re-export)
**Estimated time:** ~30 seconds
**Risk:** Zero (no consumers, no runtime dependencies)

### Changes required:

1. **File:** `spacetimedb/src/data/class_stats.ts`
   - **Delete line 171:** `// Re-export ABILITY_STAT_SCALING from combat_scaling for convenience`
   - **Delete line 172:** `export { ABILITY_STAT_SCALING } from './combat_scaling.js';`

2. **File:** `spacetimedb/src/data/combat_scaling.ts`
   - **Line 1:** Remove unused `CLASS_CONFIG` from import (keep `getClassConfig` and `StatKey`)
   - **Before:** `import { CLASS_CONFIG, getClassConfig, type StatKey } from './class_stats.js';`
   - **After:** `import { getClassConfig, type StatKey } from './class_stats.js';`

### Verification steps:

1. Apply changes
2. Run build: `npm run build` in `spacetimedb/` directory
3. Confirm circular dependency warning is gone
4. Run tests to verify no runtime issues

---

## Alternative Fix (Not Recommended)

If the re-export is desired in the future (for API convenience), extract `ABILITY_STAT_SCALING` into a third file:

**New file:** `spacetimedb/src/data/ability_scaling_map.ts`
- Contains only `ABILITY_STAT_SCALING` constant
- Both `combat_scaling.ts` and `class_stats.ts` import from it
- No circular dependency created

**Verdict:** Unnecessary complexity given zero consumers of the re-export.

---

## Conclusion

The circular dependency is a build warning caused by a convenience re-export with no actual consumers. The recommended fix is a two-line deletion with zero consumer impact. The issue does not cause runtime errors but should be fixed to clean up the build output and improve code hygiene.
