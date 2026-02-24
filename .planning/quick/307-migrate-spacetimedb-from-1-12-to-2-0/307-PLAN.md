---
phase: quick-307
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/package.json
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/index.ts
  - package.json
  - src/main.ts
autonomous: true
requirements: [MIGRATE-01]
must_haves:
  truths:
    - "Server module publishes successfully on SpacetimeDB 2.0"
    - "Client connects and receives data via subscriptions"
    - "All table names in SQL remain the same as v1 (no data schema breakage)"
  artifacts:
    - path: "spacetimedb/package.json"
      provides: "spacetimedb 2.0.1 server dependency"
      contains: "2.0.1"
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "v2 schema export with object syntax"
      contains: "export default"
    - path: "package.json"
      provides: "spacetimedb 2.0.1 client dependency"
      contains: "2.0.1"
    - path: "src/main.ts"
      provides: "v2 client connection with withDatabaseName"
      contains: "withDatabaseName"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "export default re-export"
      pattern: "export \\{ default \\} from|export default"
    - from: "src/main.ts"
      to: "src/module_bindings/index.ts"
      via: "DbConnection import"
      pattern: "withDatabaseName"
---

<objective>
Migrate SpacetimeDB from 1.12 to 2.0 across server and client.

Purpose: SpacetimeDB 2.0 has breaking API changes to table definitions, schema exports, and client connection. This migration updates both server module and client to the new APIs.

Output: Working server module and client on SpacetimeDB 2.0.1 with regenerated bindings.
</objective>

<context>
@.planning/quick/307-migrate-spacetimedb-from-1-12-to-2-0/CONTEXT.md
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/index.ts
@src/main.ts
@spacetimedb/package.json
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server-side migration (schema, tables, package.json)</name>
  <files>spacetimedb/package.json, spacetimedb/src/schema/tables.ts, spacetimedb/src/index.ts</files>
  <action>
1. **Update spacetimedb/package.json**: Change `"spacetimedb": "^1.12.0"` to `"spacetimedb": "^2.0.1"`.

2. **Update spacetimedb/src/schema/tables.ts** — schema export change:
   - The `schema()` call at the bottom of the file (line ~1765) currently uses positional args: `export const spacetimedb = schema(Player, User, FriendRequest, ...)`.
   - Change to OBJECT syntax with `export default`:
     ```typescript
     const spacetimedb = schema({
       Player, User, FriendRequest, Friend, WorldState, Region, Location,
       // ... all tables in same order ...
       BankSlot,
     });
     export default spacetimedb;
     ```
   - ALSO keep the named export for backward compatibility with the existing codebase:
     ```typescript
     export { spacetimedb };
     ```
   - The `my_bank_slots` view at the end of tables.ts uses `spacetimedb.view(...)` — this still works since `spacetimedb` is still a local const.

3. **IMPORTANT — Table `name` properties**: KEEP all existing `name: 'snake_case'` properties on every table. In v2, you CAN still pass `name` to override the auto-derived name. This is critical to preserve SQL table name compatibility with existing data. Do NOT remove any `name` properties.

4. **Update spacetimedb/src/index.ts** — schema re-export:
   - Currently line 27: `export { spacetimedb } from './schema/tables';`
   - Change to: `export { default, default as spacetimedb } from './schema/tables';`
   - This provides both the `export default` that SpacetimeDB 2.0 requires AND the named `spacetimedb` export that all reducer/view files reference via `deps.spacetimedb`.

5. **Install new server dependency**: Run `cd spacetimedb && npm install` (or `pnpm install`) to update the lockfile.
  </action>
  <verify>
Run `cd C:/projects/uwr/spacetimedb && npm install` completes without errors. TypeScript compilation check: `npx tsc --noEmit` in the spacetimedb directory should pass (or at least not have NEW errors from the migration).
  </verify>
  <done>Server package.json has spacetimedb 2.0.1, schema uses object syntax with export default, all table name properties preserved, index.ts re-exports default.</done>
</task>

<task type="auto">
  <name>Task 2: Client-side migration and binding regeneration</name>
  <files>package.json, src/main.ts</files>
  <action>
1. **Update root package.json**: Change `"spacetimedb": "^1.12.0"` to `"spacetimedb": "^2.0.1"` in dependencies.

2. **Update src/main.ts**:
   - Line 37: Change `.withModuleName(DB_NAME)` to `.withDatabaseName(DB_NAME)`.
   - No other client changes needed:
     - No `conn.reducers.onXxx()` callbacks exist in the codebase
     - No `CallReducerFlags`, `withLightMode`, or `UnknownTransaction` usage
     - No `setReducerFlags()` calls
     - Subscription handling is via `SpacetimeDBProvider` which auto-subscribes

3. **Install new client dependency**: Run `pnpm install` in the project root to update the lockfile.

4. **Regenerate client bindings**: Run `pnpm spacetime:generate` (which runs `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`). This regenerates all module_bindings to match the v2 schema. Do NOT hand-edit generated bindings.

5. **If spacetime CLI is not available or errors**: The user will need to install SpacetimeDB CLI v2.0. Flag this as a blocker if the generate command fails. The user can also publish first (`spacetime publish uwr --project-path spacetimedb`) which validates the module, then generate.

6. **Test publish locally**: Run `spacetime publish uwr --clear-database -y --project-path C:/projects/uwr/spacetimedb` to verify the module compiles and publishes. Note: `--clear-database` is needed because schema changes in a major version upgrade likely require a fresh database. Only publish to local per project rules (NEVER maincloud automatically).

7. **If publish or generate fails**: Read the error output carefully. Common v2 issues:
   - If "export default" not found: ensure `export default spacetimedb` is in tables.ts AND re-exported from index.ts
   - If table name conflicts: the `name` property in table options should prevent this
   - If `schema()` signature error: ensure it receives an object `{}` not positional args
  </action>
  <verify>
`pnpm install` succeeds. `spacetime publish uwr --clear-database -y --project-path C:/projects/uwr/spacetimedb` succeeds. `pnpm spacetime:generate` succeeds and regenerates src/module_bindings/. Client builds with `pnpm build` or at least `npx vue-tsc --noEmit` shows no new errors.
  </verify>
  <done>Client package.json has spacetimedb 2.0.1, main.ts uses withDatabaseName, bindings regenerated, module publishes locally on SpacetimeDB 2.0.</done>
</task>

</tasks>

<verification>
- `spacetimedb/package.json` has `"spacetimedb": "^2.0.1"`
- `package.json` (root) has `"spacetimedb": "^2.0.1"`
- `spacetimedb/src/schema/tables.ts` has `export default spacetimedb` and `schema({...})` object syntax
- `spacetimedb/src/index.ts` re-exports default
- `src/main.ts` uses `.withDatabaseName()` not `.withModuleName()`
- Module publishes to local SpacetimeDB without errors
- Client bindings regenerated in `src/module_bindings/`
- No `withLightMode`, `CallReducerFlags`, `UnknownTransaction`, or `withModuleName` references remain
</verification>

<success_criteria>
Server module publishes on SpacetimeDB 2.0 locally. Client connects and loads data. No v1-only APIs remain in the codebase.
</success_criteria>

<output>
After completion, create `.planning/quick/307-migrate-spacetimedb-from-1-12-to-2-0/307-SUMMARY.md`
</output>
