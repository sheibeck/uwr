---
phase: quick-268
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
requirements:
  - Q268

must_haves:
  truths:
    - "When an admin calls /setappversion, clients with a different version reload within seconds"
    - "Clients that already have the matching version do not reload"
  artifacts:
    - path: "src/App.vue"
      provides: "Deep watcher on appVersionRows that fires on row updates"
      contains: "deep: true"
  key_links:
    - from: "src/App.vue watch(appVersionRows)"
      to: "sessionStorage._version_reload_attempted"
      via: "watcher callback"
      pattern: "watch\\(appVersionRows"
---

<objective>
Fix the app version watcher so it actually fires when SpacetimeDB updates an existing row in the `app_version` table.

Purpose: Clients with stale builds should auto-reload when an admin runs `/setappversion`.
Output: `src/App.vue` with a corrected watcher.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add deep:true to appVersionRows watcher and clear sessionStorage guard on mismatch</name>
  <files>src/App.vue</files>
  <action>
    The bug: `watch(appVersionRows, callback)` is a shallow watch on a reactive array.
    SpacetimeDB's `useTable` returns a Vue `reactive` array that is mutated in-place when rows
    are updated (not replaced). A shallow watch sees no change when only the contents change —
    so the callback never fires after `/setappversion` updates the existing row.

    Fix 1 — add `{ deep: true }` to the watch call:

    ```ts
    watch(appVersionRows, (rows) => {
      ...
    }, { deep: true });
    ```

    Fix 2 — also clear the sessionStorage guard when a version MATCH is detected, so that if a
    new deployment happens later in the same session, the guard won't block a legitimate reload:

    ```ts
    watch(appVersionRows, (rows) => {
      const serverVersion = (rows as Array<{ version: string }>)[0]?.version;
      const clientVersion = window.__client_version;
      if (!serverVersion || !clientVersion || clientVersion === 'dev') return;
      if (serverVersion === clientVersion) {
        // Clear the guard so future mismatches (new deploys) can still reload
        sessionStorage.removeItem('_version_reload_attempted');
        return;
      }
      if (sessionStorage.getItem('_version_reload_attempted')) {
        console.log('[Version] Mismatch persists but reload already attempted this session, skipping.');
        return;
      }
      sessionStorage.setItem('_version_reload_attempted', '1');
      console.log('[Version] New deployment detected, reloading...');
      window.location.reload();
    }, { deep: true });
    ```

    The existing watcher block starts at the line `watch(appVersionRows, (rows) => {` and ends
    at the closing `});` on line ~710. Replace that entire block with the updated version above.
  </action>
  <verify>
    1. Open src/App.vue and confirm the watch call ends with `}, { deep: true });`
    2. Confirm the `serverVersion === clientVersion` branch now calls `sessionStorage.removeItem('_version_reload_attempted')`
    3. Run `npm run build` (or the project's build command) to confirm no TypeScript errors
  </verify>
  <done>
    The watcher fires on in-place row mutations. When /setappversion is called and the server
    version differs from window.__client_version, the page reloads. When versions match, the
    sessionStorage guard is cleared so subsequent deploys can also trigger a reload.
  </done>
</task>

</tasks>

<verification>
After applying the fix, manually verify end-to-end:
1. Note the current `window.__client_version` in the browser console
2. As admin, run `/setappversion somethingdifferent` in the command bar
3. The page should reload within a few seconds
4. After reload, run `/setappversion` again using the real version — no reload should occur
</verification>

<success_criteria>
- `watch(appVersionRows, ..., { deep: true })` is present in src/App.vue
- Version mismatch triggers `window.location.reload()` even when an existing row is updated (not inserted)
- Version match clears the sessionStorage guard so the next real deploy can also trigger a reload
</success_criteria>

<output>
After completion, create `.planning/quick/268-setappversion-does-not-trigger-reload-on/268-01-SUMMARY.md`
</output>
