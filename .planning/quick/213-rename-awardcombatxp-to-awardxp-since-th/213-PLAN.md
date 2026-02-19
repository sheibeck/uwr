---
phase: quick-213
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/index.ts
autonomous: true
requirements: [QUICK-213]

must_haves:
  truths:
    - "awardCombatXp no longer exists anywhere in the codebase"
    - "awardXp is exported from helpers/combat.ts and behaves identically"
    - "All callers compile without errors"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "awardXp function export (renamed from awardCombatXp)"
    - path: "spacetimedb/src/index.ts"
      provides: "awardXp re-exported in both import and deps object"
  key_links:
    - from: "spacetimedb/src/reducers/commands.ts"
      to: "spacetimedb/src/helpers/combat.ts"
      via: "named import awardXp"
      pattern: "awardXp"
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "deps.awardXp"
      via: "deps object call"
      pattern: "deps\\.awardXp"
---

<objective>
Rename `awardCombatXp` to `awardXp` across the entire codebase.

Purpose: The helper was originally combat-only but is now called from quest turn-in reducers too. The old name is misleading; `awardXp` is accurate and generic.
Output: Identical runtime behavior, cleaner naming.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename awardCombatXp to awardXp in all four files</name>
  <files>
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/reducers/commands.ts
    spacetimedb/src/index.ts
  </files>
  <action>
    Perform a pure identifier rename — no logic changes whatsoever.

    1. `spacetimedb/src/helpers/combat.ts` line ~1890:
       - Change `export function awardCombatXp(` to `export function awardXp(`

    2. `spacetimedb/src/reducers/commands.ts`:
       - Change named import `awardCombatXp,` to `awardXp,`
       - Change both call sites `awardCombatXp(ctx,` to `awardXp(ctx,`
       - Update the inline comment on line ~75 from "use awardCombatXp" to "use awardXp"
       - Update the inline comment on line ~112 similarly

    3. `spacetimedb/src/reducers/combat.ts`:
       - Change `deps.awardCombatXp(` (two occurrences, lines ~2505 and ~2549) to `deps.awardXp(`

    4. `spacetimedb/src/index.ts`:
       - Change the named import `awardCombatXp,` (line ~133) to `awardXp,`
       - Change the deps object entry `awardCombatXp,` (line ~434) to `awardXp,`

    No other changes. Do not alter function signatures, logic, or any other identifiers.
  </action>
  <verify>
    Run from the spacetimedb directory:
      grep -rn "awardCombatXp" spacetimedb/src/
    Expected: zero matches.

    Then confirm the new name exists:
      grep -rn "awardXp" spacetimedb/src/
    Expected: matches in helpers/combat.ts (definition), reducers/combat.ts (2 calls via deps), reducers/commands.ts (import + 2 calls), index.ts (import + deps entry).
  </verify>
  <done>
    `awardCombatXp` does not appear anywhere in spacetimedb/src/. `awardXp` is defined in helpers/combat.ts, re-exported from index.ts, and called correctly in both reducers/combat.ts and reducers/commands.ts.
  </done>
</task>

</tasks>

<verification>
grep -rn "awardCombatXp" C:/projects/uwr/spacetimedb/src/ returns zero results.
</verification>

<success_criteria>
Zero occurrences of `awardCombatXp` remain. `awardXp` is the single canonical name used at definition, export, and all call sites.
</success_criteria>

<output>
After completion, create `.planning/quick/213-rename-awardcombatxp-to-awardxp-since-th/213-SUMMARY.md`
</output>
