---
phase: quick-87
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "SpacetimeDB can extract the schema from the module entry point"
    - "spacetime publish succeeds without 'EOF while parsing a value' error"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Re-export of spacetimedb schema instance"
      contains: "export { spacetimedb }"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "re-export of spacetimedb schema instance"
      pattern: "export.*spacetimedb.*from.*schema/tables"
---

<objective>
Fix SpacetimeDB schema extraction by re-exporting the `spacetimedb` schema instance from the module entry point (`src/index.ts`).

Purpose: After quick-85 removed duplicate table definitions from index.ts, the `export const spacetimedb = schema(...)` was also removed. The schema now lives in `schema/tables.ts` and is imported by index.ts but NOT re-exported. SpacetimeDB requires the entry point to export the schema instance for module bundling. Without it, `spacetime publish` fails with "EOF while parsing a value".

Output: A working index.ts that re-exports the schema, allowing successful module publish.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/index.ts
@spacetimedb/src/schema/tables.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-export spacetimedb schema from index.ts</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
Add a re-export of the `spacetimedb` schema instance from `index.ts` so SpacetimeDB can find it at the entry point.

The `spacetimedb` variable is already imported on line 3 from `./schema/tables`. It is used throughout index.ts (for registering reducers, views, init, clientConnected, clientDisconnected). The problem is that it is NOT exported from index.ts.

Change the existing import on line 3-19:
```
import {
  spacetimedb,
  Player, Character,
  ...
} from './schema/tables';
```

To a re-export pattern. There are two clean approaches:

**Option A (preferred - minimal change):** Add a single re-export line after the existing imports:
```typescript
export { spacetimedb } from './schema/tables';
```
This can go right after the import block (after line 19). The existing `import { spacetimedb, ... } from './schema/tables'` stays as-is since it's needed for local usage throughout the file.

**Option B:** Change the import to `export { spacetimedb }` at the bottom of the file. Less clean since spacetimedb is used locally.

Use Option A. Add `export { spacetimedb } from './schema/tables';` as a new line right after the existing import from `./schema/tables` (after line 19, before the `import { registerReducers }` on line 20).

Do NOT modify any other code. Do NOT change the existing import statement. Just add the single re-export line.
  </action>
  <verify>
1. Check that `spacetimedb` is now exported from index.ts:
   `grep "export.*spacetimedb" spacetimedb/src/index.ts`
   Should show the re-export line.

2. Verify the module still compiles:
   `cd spacetimedb && npx tsc --noEmit 2>&1 | head -20`
   Should produce no errors (or only pre-existing non-blocking warnings).
  </verify>
  <done>
- `spacetimedb/src/index.ts` contains `export { spacetimedb } from './schema/tables'`
- TypeScript compilation passes without new errors
- SpacetimeDB schema extraction will find the schema at the entry point
  </done>
</task>

</tasks>

<verification>
- `grep -c "export.*spacetimedb" spacetimedb/src/index.ts` returns 1
- The existing import of `spacetimedb` from `./schema/tables` is still present (not removed)
- No other changes to the file beyond the single added line
</verification>

<success_criteria>
- The `spacetimedb` schema instance is re-exported from the module entry point (src/index.ts)
- `spacetime publish` will no longer fail with "EOF while parsing a value" schema extraction error
- No functional changes to any other code
</success_criteria>

<output>
After completion, create `.planning/quick/87-add-missing-schema-export-to-index-ts-sp/87-SUMMARY.md`
</output>
