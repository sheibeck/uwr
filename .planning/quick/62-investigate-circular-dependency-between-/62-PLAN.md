---
phase: quick-62
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - "Root cause of circular dependency is identified"
    - "Impact assessment is documented"
    - "Recommended fix is described with specific file/line references"
  artifacts: []
  key_links: []
---

<objective>
Investigate the circular dependency between combat_scaling.ts and class_stats.ts, determine root cause, assess impact, and document recommended fix.

Purpose: The build emits a circular dependency warning. We need to understand whether this causes runtime issues and how to resolve it.
Output: Investigation report (this plan's findings below, no code changes).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/data/class_stats.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Trace the circular dependency chain and document root cause</name>
  <files></files>
  <action>
Investigate the circular dependency:

```
combat_scaling.ts -> class_stats.ts -> combat_scaling.ts
```

**Step 1: Identify both directions of the import cycle.**

- `combat_scaling.ts` line 1 imports `{ CLASS_CONFIG, getClassConfig, type StatKey }` from `./class_stats.js`
  - Used by: `calculateHealingPower()` (line 316) calls `getClassConfig()` to check if class has wis as primary/secondary
  - Used by: `getAbilityStatScaling()` (line 279) uses `StatKey` type
  - `CLASS_CONFIG` is imported but NOT directly referenced in any function body -- it appears unused in combat_scaling.ts

- `class_stats.ts` line 172 re-exports `{ ABILITY_STAT_SCALING }` from `./combat_scaling.js`
  - This is a convenience re-export with the comment "Re-export ABILITY_STAT_SCALING from combat_scaling for convenience"

**Step 2: Determine if anyone consumes the re-export from class_stats.**

Search all .ts files for imports of ABILITY_STAT_SCALING from class_stats:
- `grep -r "ABILITY_STAT_SCALING.*from.*class_stats" spacetimedb/src/` -- NO MATCHES
- All consumers import ABILITY_STAT_SCALING directly from combat_scaling.ts (index.ts line 40 uses `getAbilityStatScaling` function, not the raw mapping)

**Step 3: Root cause determination.**

ROOT CAUSE: The re-export on line 172 of `class_stats.ts` creates the back-edge of the cycle. It exists purely as a "convenience" re-export that has ZERO consumers. Removing this single line eliminates the circular dependency entirely.

Additionally, `CLASS_CONFIG` is imported into `combat_scaling.ts` but never directly used in any function -- only `getClassConfig` and `StatKey` are actually used. This is a minor unused-import issue.

**Step 4: Assess runtime impact.**

The circular dependency is between two data/constant files with no side effects at module scope. Node.js/bundlers handle this by returning a partially-initialized module. Because:
- `combat_scaling.ts` only uses `getClassConfig` at CALL TIME (inside functions), not at module initialization
- `class_stats.ts` only re-exports a const from `combat_scaling.ts`

The cycle does NOT cause runtime errors -- both modules are fully initialized before any function calls occur. However, it is still a code smell and produces build warnings.

**Step 5: Document recommended fix.**

RECOMMENDED FIX (minimal, ~5 seconds):
1. Remove line 172 from `spacetimedb/src/data/class_stats.ts` (the re-export line)
2. Remove the comment on line 171 as well
3. Remove unused `CLASS_CONFIG` import from `combat_scaling.ts` line 1 (keep `getClassConfig` and `StatKey`)

This is a one-line deletion that breaks the cycle with zero consumer impact.

ALTERNATIVE FIX (if re-export is desired in future):
Extract ABILITY_STAT_SCALING into a third file (e.g., `ability_scaling_map.ts`) that both files can import from. This is unnecessary given zero consumers of the re-export.
  </action>
  <verify>
This is an investigation-only task. Verification is the completeness of the analysis:
- Circular dependency chain fully traced (both directions identified)
- All consumers of the re-export checked (confirmed zero)
- Runtime impact assessed (no runtime errors, build warning only)
- Fix recommendation documented with specific file paths and line numbers
  </verify>
  <done>
Investigation complete with: root cause identified (convenience re-export on class_stats.ts:172 with zero consumers), runtime impact assessed (warning only, no runtime failure), and fix documented (remove lines 171-172 from class_stats.ts, remove unused CLASS_CONFIG import from combat_scaling.ts:1).
  </done>
</task>

</tasks>

<verification>
- The circular dependency chain is fully documented
- Root cause is a single re-export line with zero consumers
- Runtime impact is assessed as "build warning only, no runtime errors"
- Recommended fix is specific and minimal (remove 2 lines in class_stats.ts, trim 1 import in combat_scaling.ts)
</verification>

<success_criteria>
Investigation report identifies root cause, confirms no runtime impact, and provides an actionable fix with exact file paths and line numbers.
</success_criteria>

<output>
After completion, create `.planning/quick/62-investigate-circular-dependency-between-/62-SUMMARY.md`
</output>
