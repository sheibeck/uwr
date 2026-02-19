---
phase: quick-198
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/index.ts
  - src/main.ts
  - src/composables/useGameData.ts
  - vite.config.ts
autonomous: true
requirements: [QUICK-198]

must_haves:
  truths:
    - "When a new build is deployed and set_app_version is called, connected clients reload automatically"
    - "No setInterval polling loop runs in the client"
    - "vite.config.ts no longer writes dist/version.json"
    - "BUILD_VERSION / __BUILD_VERSION__ are still inlined at build time"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "AppVersion table definition (public, single-row)"
      contains: "app_version"
    - path: "spacetimedb/src/index.ts"
      provides: "set_app_version reducer (admin-only)"
      contains: "set_app_version"
    - path: "src/composables/useGameData.ts"
      provides: "appVersionRows reactive ref via useTable"
    - path: "src/main.ts"
      provides: "watch on appVersionRows that reloads when version differs from CLIENT_VERSION"
  key_links:
    - from: "src/main.ts"
      to: "useGameData"
      via: "appVersionRows watch"
      pattern: "watch.*appVersionRows"
    - from: "spacetimedb/src/index.ts"
      to: "ctx.db.appVersion"
      via: "set_app_version reducer upsert"
      pattern: "set_app_version"
---

<objective>
Replace the 60-second setInterval polling loop in main.ts with a SpacetimeDB subscription-based version check.

Purpose: Polling /version.json every 60 seconds is wasteful and slow. SpacetimeDB subscriptions push changes immediately — clients reload within milliseconds of a deployment instead of up to 60 seconds later.

Output: AppVersion table on server, set_app_version admin reducer, reactive watch on client that triggers reload when the subscribed version row changes and differs from the inlined CLIENT_VERSION.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/index.ts
@spacetimedb/src/data/admin.ts
@src/main.ts
@src/composables/useGameData.ts
@vite.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add AppVersion table and set_app_version reducer to server</name>
  <files>spacetimedb/src/schema/tables.ts, spacetimedb/src/index.ts</files>
  <action>
    In `spacetimedb/src/schema/tables.ts`:

    1. Add this table definition immediately before the `export const spacetimedb = schema(` line (line ~1666):

    ```typescript
    export const AppVersion = table(
      { name: 'app_version', public: true },
      {
        id: t.u64().primaryKey().autoInc(),
        version: t.string(),
        updatedAt: t.timestamp(),
      }
    );
    ```

    2. Add `AppVersion` to the `schema(...)` call — append it after `EventDespawnTick,` on the last line before the closing `);`.

    In `spacetimedb/src/index.ts`:

    3. Import `AppVersion` alongside the other table imports from `./schema/tables`.

    4. Register the reducer using the existing `spacetimedb` reference (it's already imported). Add this after the other simple admin reducers. `requireAdmin` is already imported at the top of index.ts:

    ```typescript
    spacetimedb.reducer('set_app_version', { version: t.string() }, (ctx, { version }) => {
      requireAdmin(ctx);
      const existing = [...ctx.db.appVersion.iter()][0];
      if (existing) {
        ctx.db.appVersion.id.update({ ...existing, version, updatedAt: ctx.timestamp });
      } else {
        ctx.db.appVersion.insert({ id: 0n, version, updatedAt: ctx.timestamp });
      }
    });
    ```

    Note: `iter()` is acceptable here because this is a reducer (not a view) and the table will always have at most 1 row.

    Do NOT publish or regenerate bindings in this task — the plan notes that `spacetime publish` and `spacetime generate` must be run manually after both tasks are complete.
  </action>
  <verify>
    Run: `cd spacetimedb && npx tsc --noEmit` (or check for TypeScript errors in the IDE).
    Confirm no compile errors in tables.ts or index.ts.
    Confirm `AppVersion` appears in the schema(...) call.
    Confirm `set_app_version` reducer body references `ctx.db.appVersion`.
  </verify>
  <done>
    `spacetimedb/src/schema/tables.ts` has `AppVersion` table defined and listed in `schema(...)`.
    `spacetimedb/src/index.ts` imports `AppVersion` and registers `set_app_version` reducer with admin guard and upsert logic.
    No TypeScript compile errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire subscription-based version check on client, remove polling</name>
  <files>src/composables/useGameData.ts, src/main.ts, vite.config.ts</files>
  <action>
    IMPORTANT: `spacetime generate` must have been run to regenerate bindings (including `AppVersionRow` and `tables.appVersion`) before this task can compile. If bindings are not yet regenerated, add a TODO comment in useGameData.ts and main.ts and note this in the summary.

    In `src/composables/useGameData.ts`:

    1. Add at the end of the `useTable` calls (before the `return {` block):
    ```typescript
    const [appVersionRows] = useTable(tables.appVersion);
    ```

    2. Add `appVersionRows` to the returned object.

    In `src/main.ts`:

    3. Remove the entire `checkForUpdates` function (lines ~54-68).

    4. Remove the `setInterval(checkForUpdates, 60_000)` block (lines ~71-73).

    5. Keep `declare const __BUILD_VERSION__: string;` and `const CLIENT_VERSION = ...` — these are still needed for the version comparison.

    6. After the `createApp(...)` call that mounts the app (or in the `onConnect` callback), add a version watcher. Since `useGameData` is a Vue composable (requires component context), the watch must be set up inside the app. The cleanest approach: add an `onConnect` side-effect that polls `tables.appVersion` reactively via a module-level subscription callback.

    Actually — the correct SpacetimeDB pattern is to use `useTable` inside a Vue component/composable. The version check should live in `App.vue` using `appVersionRows` from `useGameData`, NOT in `main.ts` (which is outside Vue component context).

    So:
    - In `src/main.ts`: remove `checkForUpdates`, remove `setInterval`, keep `CLIENT_VERSION` declaration. Expose `CLIENT_VERSION` on `window` for App.vue to use:
      ```typescript
      declare global {
        interface Window {
          __db_conn?: DbConnection;
          __my_identity?: Identity;
          __client_version?: string;
        }
      }
      // After CLIENT_VERSION declaration:
      window.__client_version = CLIENT_VERSION;
      ```

    - In `src/App.vue`: find where `useGameData()` is called. After destructuring `appVersionRows` from it, add:
      ```typescript
      watch(appVersionRows, (rows) => {
        const serverVersion = rows[0]?.version;
        const clientVersion = window.__client_version;
        if (serverVersion && clientVersion && clientVersion !== 'dev' && serverVersion !== clientVersion) {
          console.log('[Version] New deployment detected, reloading...');
          window.location.reload();
        }
      });
      ```

    In `vite.config.ts`:

    7. Remove the `versionPlugin` function entirely (lines 8-16).
    8. Remove `versionPlugin()` from the `plugins` array — change `plugins: [vue(), versionPlugin()]` to `plugins: [vue()]`.
    9. Remove the `writeFileSync` and `resolve` imports from the top of the file.
    10. Keep `const BUILD_VERSION = Date.now().toString()` and the `define: { __BUILD_VERSION__: JSON.stringify(BUILD_VERSION) }` block — these are still needed to inline the client version at build time.

    After all changes, note in summary: "Run `spacetime publish uwr --project-path spacetimedb` then `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` to complete the upgrade. Then call `conn.reducers.setAppVersion({ version: BUILD_VERSION })` from the admin panel or CLI on each deployment."
  </action>
  <verify>
    1. `vite.config.ts` — `writeFileSync`, `resolve`, and `versionPlugin` are gone; `BUILD_VERSION` and `define.__BUILD_VERSION__` remain.
    2. `src/main.ts` — no `checkForUpdates` function, no `setInterval`, `CLIENT_VERSION` still declared, `window.__client_version` assigned.
    3. `src/composables/useGameData.ts` — `appVersionRows` added to useTable calls and return object.
    4. `src/App.vue` — `appVersionRows` destructured from useGameData, `watch(appVersionRows, ...)` present.
    5. Run `npm run build` — should succeed (TypeScript should compile; AppVersionRow reference in useGameData.ts will error only if bindings not regenerated yet — in that case, add `// @ts-expect-error bindings pending regeneration` comment).
  </verify>
  <done>
    No polling loop in main.ts.
    vite.config.ts does not write dist/version.json.
    App.vue watches appVersionRows and reloads when server version differs from CLIENT_VERSION.
    BUILD_VERSION is still inlined at build time via __BUILD_VERSION__ define.
    Build compiles without errors (or with clear TODO comment noting bindings regeneration needed).
  </done>
</task>

</tasks>

<verification>
After publishing and regenerating bindings:
1. `spacetime publish uwr --project-path spacetimedb` succeeds.
2. `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb` produces `app_version_table.ts` (or similar) in module_bindings.
3. `npm run build` compiles cleanly.
4. Calling `conn.reducers.setAppVersion({ version: 'test-123' })` from browser console (admin identity) updates the AppVersion row, and any other connected clients with a different CLIENT_VERSION reload.
5. `dist/version.json` is NOT present in build output.
</verification>

<success_criteria>
- setInterval polling loop fully removed from main.ts
- versionPlugin removed from vite.config.ts, dist/version.json no longer emitted
- AppVersion table exists in SpacetimeDB schema
- set_app_version reducer is admin-gated and upserts the single version row
- Client watches appVersionRows and reloads on version mismatch
- BUILD_VERSION still inlined as __BUILD_VERSION__ at build time
</success_criteria>

<output>
After completion, create `.planning/quick/198-replace-polling-version-check-with-space/198-SUMMARY.md`
</output>
