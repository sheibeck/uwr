---
phase: quick-203
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/static.yml
  - src/composables/useCommands.ts
  - src/components/CommandBar.vue
autonomous: true
requirements: [QUICK-203]

must_haves:
  truths:
    - "GitHub Actions workflow deploys without calling the SpacetimeDB set_app_version curl endpoint"
    - "Admin user can run /setappversion in the game client to push the current version to SpacetimeDB"
    - "Non-admin users cannot invoke /setappversion"
  artifacts:
    - path: ".github/workflows/static.yml"
      provides: "Deployment workflow without version notification curl step"
    - path: "src/composables/useCommands.ts"
      provides: "/setappversion command handler"
    - path: "src/components/CommandBar.vue"
      provides: "/setappversion in autocomplete list"
  key_links:
    - from: "src/composables/useCommands.ts"
      to: "window.__db_conn.reducers.setAppVersion"
      via: "direct window call"
      pattern: "setAppVersion"
    - from: "src/composables/useCommands.ts"
      to: "ADMIN_IDENTITY_HEX"
      via: "import from src/data/worldEventDefs.ts"
      pattern: "ADMIN_IDENTITY_HEX"
---

<objective>
Remove the automated "Notify SpacetimeDB of new version" step from the GitHub Actions workflow and replace it with an in-game admin-only /setappversion command.

Purpose: The curl call requires a SPACETIMEDB_ADMIN_TOKEN secret and is fragile; the admin command provides the same result with explicit control.
Output: Cleaned workflow file, new /setappversion command in useCommands.ts and CommandBar.vue autocomplete.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.github/workflows/static.yml
@src/composables/useCommands.ts
@src/components/CommandBar.vue
@src/data/worldEventDefs.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove version notification steps from GitHub Actions workflow</name>
  <files>.github/workflows/static.yml</files>
  <action>
    Remove three items from .github/workflows/static.yml:

    1. Remove the entire "Generate build version" step:
    ```yaml
    - name: Generate build version
      run: echo "BUILD_VERSION=$(date +%s%3N)" >> $GITHUB_ENV
    ```

    2. Remove the `env:` block from the "Build (vite)" step (the `BUILD_VERSION: ${{ env.BUILD_VERSION }}` line and the `env:` key itself). The build step comment and `run:` line remain intact.

    3. Remove the entire "Notify SpacetimeDB of new version" step:
    ```yaml
    - name: Notify SpacetimeDB of new version
      run: |
        curl -sf -X POST \
          "https://${{ secrets.VITE_SPACETIMEDB_HOST }}/v1/database/${{ secrets.VITE_SPACETIMEDB_DB_NAME }}/call/set_app_version" \
          -H "Authorization: Bearer ${{ secrets.SPACETIMEDB_ADMIN_TOKEN }}" \
          -H "Content-Type: application/json" \
          -d "{\"version\": \"$BUILD_VERSION\"}"
    ```

    Leave all other steps untouched (Checkout, Setup Pages, Setup Node, Inject env.local, Install dependencies, Build, Verify dist output, Upload artifact, Deploy to GitHub Pages).
  </action>
  <verify>Read the updated .github/workflows/static.yml and confirm: no "Generate build version" step, no `env:` block under "Build (vite)", no "Notify SpacetimeDB" step, no references to BUILD_VERSION or SPACETIMEDB_ADMIN_TOKEN.</verify>
  <done>Workflow file contains exactly the steps: Checkout, Setup Pages, Setup Node, Inject env.local, Install dependencies, Build (vite) with no env block, Verify dist output, Upload artifact, Deploy to GitHub Pages — and nothing else.</done>
</task>

<task type="auto">
  <name>Task 2: Add /setappversion admin command to useCommands and CommandBar</name>
  <files>src/composables/useCommands.ts, src/components/CommandBar.vue</files>
  <action>
    **src/composables/useCommands.ts:**

    1. Add import at top of file (alongside existing imports):
    ```typescript
    import { ADMIN_IDENTITY_HEX } from '../data/worldEventDefs';
    ```

    2. Add a `setAppVersionReducer` using `useReducer`:
    ```typescript
    const setAppVersionReducer = useReducer(reducers.setAppVersion);
    ```
    Place it alongside the other reducer declarations (after `resolveWorldEventReducer`).

    3. Add the `/setappversion` handler inside `submitCommand`, after the `/who` block and before the final `else` branch:
    ```typescript
    } else if (lower === '/setappversion') {
      const isAdmin = window.__my_identity?.toHexString() === ADMIN_IDENTITY_HEX;
      if (!isAdmin) {
        addLocalEvent?.('command', 'Permission denied.');
        commandText.value = '';
        return;
      }
      const version = window.__client_version ?? 'dev';
      setAppVersionReducer({ version });
      addLocalEvent?.('command', `App version set to "${version}".`);
    ```

    **src/components/CommandBar.vue:**

    Add to the `commands` array (after `/endevent`):
    ```typescript
    { value: '/setappversion', hint: 'Set app version in SpacetimeDB (admin only)' },
    ```
  </action>
  <verify>
    1. Run `npm run build` (or `npx tsc --noEmit`) — no TypeScript errors.
    2. In the running game client, type `/seta` in the command bar — `/setappversion` appears in autocomplete.
    3. As a non-admin identity: typing `/setappversion` logs "Permission denied." to the log panel.
    4. As admin: typing `/setappversion` calls `setAppVersionReducer` with the current `window.__client_version` and logs confirmation.
  </verify>
  <done>
    - `/setappversion` autocomplete entry visible in CommandBar.
    - Non-admin gets "Permission denied." in log panel.
    - Admin successfully calls setAppVersion reducer and sees confirmation message.
    - TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. `.github/workflows/static.yml` has no references to `BUILD_VERSION`, `SPACETIMEDB_ADMIN_TOKEN`, or the curl call.
2. `src/composables/useCommands.ts` imports `ADMIN_IDENTITY_HEX` from `worldEventDefs.ts` and handles `/setappversion` with admin guard.
3. `src/components/CommandBar.vue` includes `/setappversion` in the commands autocomplete array.
4. `npm run build` completes without errors.
</verification>

<success_criteria>
- Workflow deploys without the curl notification step — no SPACETIMEDB_ADMIN_TOKEN dependency.
- Admin can type `/setappversion` in-game to push the current client version to SpacetimeDB via the existing `set_app_version` reducer.
- Non-admins are blocked with "Permission denied."
- No TypeScript compilation errors introduced.
</success_criteria>

<output>
After completion, create `.planning/quick/203-remove-yaml-version-call-to-spacetimedb-/203-SUMMARY.md`
</output>
