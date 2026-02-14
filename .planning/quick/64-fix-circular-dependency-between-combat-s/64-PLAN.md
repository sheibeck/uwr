---
phase: quick-64
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/class_stats.ts
  - spacetimedb/src/data/combat_scaling.ts
autonomous: true
must_haves:
  truths:
    - "No circular dependency warning between combat_scaling.ts and class_stats.ts during build"
    - "All existing combat scaling and class stats functionality works unchanged"
  artifacts:
    - path: "spacetimedb/src/data/class_stats.ts"
      provides: "Class configuration, stat computation, armor proficiency — no re-export of combat_scaling symbols"
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "Combat scaling constants and helpers — clean import with no unused symbols"
  key_links:
    - from: "spacetimedb/src/data/combat_scaling.ts"
      to: "spacetimedb/src/data/class_stats.ts"
      via: "import of getClassConfig and StatKey"
      pattern: "import.*getClassConfig.*StatKey.*class_stats"
---

<objective>
Fix circular dependency between combat_scaling.ts and class_stats.ts by removing unused re-export and unused import.

Purpose: Eliminate build warning caused by convenience re-export with zero consumers.
Output: Clean unidirectional dependency: combat_scaling.ts -> class_stats.ts (no back-edge).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/62-investigate-circular-dependency-between-/62-INVESTIGATION-REPORT.md
@spacetimedb/src/data/class_stats.ts
@spacetimedb/src/data/combat_scaling.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove unused re-export and unused import to break circular dependency</name>
  <files>spacetimedb/src/data/class_stats.ts, spacetimedb/src/data/combat_scaling.ts</files>
  <action>
Two targeted edits:

1. **spacetimedb/src/data/class_stats.ts** — Delete lines 171-172:
   - Line 171: `// Re-export ABILITY_STAT_SCALING from combat_scaling for convenience`
   - Line 172: `export { ABILITY_STAT_SCALING } from './combat_scaling.js';`
   This removes the back-edge of the circular dependency. Zero consumers import ABILITY_STAT_SCALING from class_stats — all consumers already import directly from combat_scaling.

2. **spacetimedb/src/data/combat_scaling.ts** — Line 1, remove unused `CLASS_CONFIG` from import:
   - Before: `import { CLASS_CONFIG, getClassConfig, type StatKey } from './class_stats.js';`
   - After: `import { getClassConfig, type StatKey } from './class_stats.js';`
   CLASS_CONFIG is imported but never referenced in any function body in combat_scaling.ts. Only getClassConfig (used by calculateHealingPower) and StatKey (used by getAbilityStatScaling) are needed.

Do NOT change anything else in either file.
  </action>
  <verify>
Run from the spacetimedb directory:
- `npx tsc --noEmit` should pass with no errors
- Build output should show no circular dependency warning for class_stats/combat_scaling
- Grep for any remaining imports of ABILITY_STAT_SCALING from class_stats to confirm zero breakage: `grep -r "ABILITY_STAT_SCALING.*from.*class_stats" spacetimedb/src/` should return no matches
  </verify>
  <done>
Circular dependency between combat_scaling.ts and class_stats.ts is eliminated. Build produces no warning for these files. All existing functionality unchanged — getClassConfig and StatKey still imported correctly in combat_scaling.ts.
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation succeeds with no errors
- No circular dependency warning between class_stats and combat_scaling
- No consumers of the removed re-export (already verified in investigation: zero matches)
</verification>

<success_criteria>
- Build warning for circular dependency between combat_scaling.ts and class_stats.ts is gone
- No TypeScript compilation errors introduced
- No runtime behavior changes
</success_criteria>

<output>
After completion, create `.planning/quick/64-fix-circular-dependency-between-combat-s/64-01-SUMMARY.md`
</output>
