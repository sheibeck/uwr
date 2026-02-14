---
phase: quick-88
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Module compiles without undefined reference errors"
    - "spacetime publish succeeds (schema extraction works)"
    - "All combat, seeding, and lifecycle code resolves its dependencies"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Combat helper functions with correct imports"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "Enemy seeding without duplicate spawn functions"
    - path: "spacetimedb/src/index.ts"
      provides: "Entry point with correct Player insert and reducerDeps typing"
  key_links:
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "import AggroEntry, EnemyTemplate, EnemyRoleTemplate, Character"
      pattern: "import.*AggroEntry.*from.*schema/tables"
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/data/combat_constants.ts"
      via: "import COMBAT_LOOP_INTERVAL_MICROS, AUTO_ATTACK_INTERVAL"
      pattern: "import.*COMBAT_LOOP_INTERVAL_MICROS.*from.*combat_constants"
    - from: "spacetimedb/src/seeding/ensure_enemies.ts"
      to: "spacetimedb/src/helpers/location.ts"
      via: "import getGatherableResourceTemplates, findEnemyTemplateByName"
      pattern: "import.*getGatherableResourceTemplates.*from.*helpers/location"
---

<objective>
Fix all missing imports and undefined references introduced by the quick-83 refactoring that split index.ts into modular files. The module currently crashes during initialization because several files reference types, constants, and functions that were never imported after the code was moved.

Purpose: Restore the module to a compilable/publishable state.
Output: All TypeScript errors from missing names resolved; module publishes successfully.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/index.ts
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/data/combat_constants.ts
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/helpers/items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix missing imports in helpers/combat.ts</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
  The file re-exports `COMBAT_LOOP_INTERVAL_MICROS` and `AUTO_ATTACK_INTERVAL` from `../data/combat_constants` (line 44-51) but uses them locally without importing them as values. It also uses `typeof AggroEntry.rowType`, `typeof EnemyTemplate.rowType`, `typeof EnemyRoleTemplate.rowType`, and `typeof Character.rowType` for type annotations without importing those table definitions.

  1. Change the re-export block at lines 44-51 to ALSO import the values for local use. Replace the bare `export { ... } from '...'` with an import statement plus re-export:
     ```
     import {
       COMBAT_LOOP_INTERVAL_MICROS,
       AUTO_ATTACK_INTERVAL,
       GROUP_SIZE_DANGER_BASE,
       GROUP_SIZE_BIAS_RANGE,
       GROUP_SIZE_BIAS_MAX,
     } from '../data/combat_constants';
     export {
       COMBAT_LOOP_INTERVAL_MICROS,
       AUTO_ATTACK_INTERVAL,
       GROUP_SIZE_DANGER_BASE,
       GROUP_SIZE_BIAS_RANGE,
       GROUP_SIZE_BIAS_MAX,
     };
     ```

  2. Add import for table types from schema/tables.ts:
     ```
     import { AggroEntry, EnemyTemplate, EnemyRoleTemplate, Character } from '../schema/tables';
     ```
     These are used at:
     - Line 1691: `typeof AggroEntry.rowType`
     - Line 1862: `typeof EnemyTemplate.rowType`
     - Line 1863: `typeof EnemyRoleTemplate.rowType`
     - Line 1864: `typeof Character.rowType`

  3. Fix the type error at line 1085 where `missing` is `number | 0n`:
     The code is `const missing = target.maxHp > target.hp ? target.maxHp - target.hp : 0n;`
     Since `target` comes from a parameter typed as `any`, TS can't infer bigint subtraction.
     Fix: Cast or ensure bigint: `const missing = target.maxHp > target.hp ? BigInt(target.maxHp) - BigInt(target.hp) : 0n;`
     Or simpler: leave as-is since target.maxHp and target.hp ARE bigint at runtime (from Character table). The issue is TS inference on `any`. If it causes a compile error, wrap in `BigInt()`.

  Do NOT touch any other logic -- only fix the imports and the type error.
  </action>
  <verify>Run `cd spacetimedb && npx tsc --noEmit 2>&1 | grep "helpers/combat.ts"` -- should return zero errors for this file (or only pre-existing type inference warnings from `any` usage).</verify>
  <done>helpers/combat.ts has no "Cannot find name" errors for AUTO_ATTACK_INTERVAL, COMBAT_LOOP_INTERVAL_MICROS, AggroEntry, EnemyTemplate, EnemyRoleTemplate, or Character.</done>
</task>

<task type="auto">
  <name>Task 2: Remove duplicate spawn functions from ensure_enemies.ts and add missing imports</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts</files>
  <action>
  The file contains duplicate copies of `spawnEnemy`, `spawnEnemyWithTemplate`, and `ensureAvailableSpawn` (lines 215-420) that also exist in `helpers/location.ts`. The `index.ts` imports these functions from `helpers/location.ts`, NOT from this file. These duplicates lack imports and cause compile errors.

  Additionally, the functions that DO belong here (`ensureLootTables`, `ensureEnemyTemplatesAndRoles`) reference symbols without importing them.

  1. DELETE the following duplicate exported functions (lines ~215-420):
     - `spawnEnemy` (lines 215-325)
     - `spawnEnemyWithTemplate` (lines 327-394)
     - `ensureAvailableSpawn` (lines 396-420)
     These are canonical in `helpers/location.ts` and imported from there by `index.ts`.

  2. ADD missing imports at the top of the file:
     ```
     import { getGatherableResourceTemplates, findEnemyTemplateByName } from '../helpers/location';
     import { findItemTemplateByName } from '../helpers/items';
     import { EnemyTemplate } from '../schema/tables';
     ```
     - `getGatherableResourceTemplates` is called in `ensureLootTables` line 67
     - `findItemTemplateByName` is called in `ensureLootTables` line 72
     - `findEnemyTemplateByName` is called in `ensureEnemyTemplatesAndRoles` line 424
     - `EnemyTemplate` is used as `typeof EnemyTemplate.rowType` in `ensureEnemyTemplatesAndRoles` line 439

  3. Keep existing `import { SenderError } from 'spacetimedb/server';`

  The file should export exactly: `ensureLootTables`, `ensureVendorInventory`, `ensureLocationEnemyTemplates`, `ensureEnemyTemplatesAndRoles` -- nothing else.
  </action>
  <verify>Run `cd spacetimedb && npx tsc --noEmit 2>&1 | grep "ensure_enemies.ts"` -- should return zero errors for this file.</verify>
  <done>ensure_enemies.ts has no undefined reference errors; duplicate spawn functions removed; all 4 exported seeding functions have their dependencies imported.</done>
</task>

<task type="auto">
  <name>Task 3: Fix index.ts Player insert and reducerDeps typing</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
  Two compile errors in index.ts:

  1. Line 284 (Player insert in clientConnected): Missing `sessionStartedAt` field.
     The Player table schema includes `sessionStartedAt: t.timestamp().optional()`.
     Add `sessionStartedAt: undefined,` to the insert object (alongside the other undefined optional fields).

  2. Line 439 (`reducerDeps.startCombatForSpawn = ...`): The `reducerDeps` object literal has a fixed type so TS won't allow adding a new property.
     Fix by adding `startCombatForSpawn` to the initial `reducerDeps` declaration with value `null as any`:
     ```
     const reducerDeps = {
       // ... existing properties ...
       startCombatForSpawn: null as any,
     };
     ```
     Then the assignment on line 439 will work.

  Do NOT change any other code in index.ts.
  </action>
  <verify>Run `cd spacetimedb && npx tsc --noEmit 2>&1 | grep "src/index.ts"` -- should return zero errors for index.ts.</verify>
  <done>index.ts compiles without "sessionStartedAt" missing error and without "startCombatForSpawn does not exist" error.</done>
</task>

</tasks>

<verification>
After all 3 tasks complete:
1. Run `cd spacetimedb && npx tsc --noEmit 2>&1 | grep -c "error TS"` -- count of remaining errors should be significantly reduced (pre-existing type inference warnings from `any` and RowBuilder type resolution may remain but those are non-blocking for publishing)
2. Run `spacetime publish uwr --project-path spacetimedb` -- module should publish successfully (schema extraction no longer blocked by undefined references)
</verification>

<success_criteria>
- All "Cannot find name" errors for the listed symbols (AUTO_ATTACK_INTERVAL, COMBAT_LOOP_INTERVAL_MICROS, AggroEntry, EnemyTemplate, EnemyRoleTemplate, Character, getGatherableResourceTemplates, findItemTemplateByName, EnemySpawn, isNightTime, etc.) are resolved
- Duplicate spawn functions removed from ensure_enemies.ts
- Module initializes without crashing from undefined references
- spacetime publish succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/88-fix-missing-imports-after-quick-83-refac/88-SUMMARY.md`
</output>
