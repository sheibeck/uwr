---
phase: 223-fix-players-being-dumped-to-login-screen
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/composables/useAuth.ts
autonomous: true
requirements: [BUG-223]

must_haves:
  truths:
    - "Players are not dumped to the login screen mid-session due to OIDC token expiry"
    - "Version mismatch reloads fire at most once per page load, not on every subscription re-delivery"
    - "Legitimate version mismatch still triggers a reload (guard does not break normal behavior)"
  artifacts:
    - path: "src/App.vue"
      provides: "Version watcher without eager guard removal"
      contains: "sessionStorage.setItem('_version_reload_attempted'"
    - path: "src/composables/useAuth.ts"
      provides: "isLoggedIn computed using stable hasToken ref"
      contains: "const hasToken = ref"
  key_links:
    - from: "src/composables/useAuth.ts"
      to: "isLoggedIn computed"
      via: "hasToken ref initialized once at module load"
      pattern: "hasToken = ref\\(Boolean\\(getStoredIdToken\\(\\)\\)\\)"
---

<objective>
Fix two confirmed bugs causing players to be unexpectedly dumped to the login screen.

Purpose: Players reported being sent to the login screen 4 times in a short period. Root cause analysis identified two bugs: (1) the version reload guard is cleared on every subscription re-delivery when versions match, allowing repeated reload cycles, and (2) `isLoggedIn` calls `getStoredIdToken()` inside a Vue computed that re-runs on every reactive update, discovering OIDC token expiry and kicking players out mid-session.

Output: Two surgical edits — one line removed from the version watcher, one line changed in useAuth.ts.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/.planning/PROJECT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove eager version reload guard clearing in App.vue</name>
  <files>src/App.vue</files>
  <action>
    In the `watch(appVersionRows, ...)` callback at line 680, remove the `sessionStorage.removeItem('_version_reload_attempted')` call and its surrounding comment (lines 685-687).

    The block currently reads:
    ```javascript
    if (serverVersion === clientVersion) {
      // Versions match — clear stale reload guard so future updates can still trigger
      sessionStorage.removeItem('_version_reload_attempted');
      return;
    }
    ```

    Change it to:
    ```javascript
    if (serverVersion === clientVersion) return;
    ```

    Do not touch any other part of the watcher. The guard (`sessionStorage.setItem` / `sessionStorage.getItem` checks on mismatch) must remain intact.

    Rationale: The guard only needs to survive within the current page load. When a reload fires, the new page load starts fresh with no guard in sessionStorage — that is the correct natural expiry. Clearing the guard on every version-match re-delivery (which happens on each SpacetimeDB subscription reconnect) allows a subsequent mismatch delivery to bypass the guard and trigger another reload.
  </action>
  <verify>
    Grep the file to confirm `sessionStorage.removeItem` no longer appears in the version watcher:
    `grep -n "removeItem" src/App.vue`
    Expected: no output (or output only in unrelated sections, if any).

    Also confirm the guard set still exists:
    `grep -n "_version_reload_attempted" src/App.vue`
    Expected: two lines — `getItem` check and `setItem` call.
  </verify>
  <done>The `sessionStorage.removeItem('_version_reload_attempted')` line is gone. The `getItem` guard and `setItem` call remain. The version-match branch is a single `return`.</done>
</task>

<task type="auto">
  <name>Task 2: Stabilize isLoggedIn in useAuth.ts with a hasToken ref</name>
  <files>src/composables/useAuth.ts</files>
  <action>
    In `src/composables/useAuth.ts`, replace the live `getStoredIdToken()` call inside the `isLoggedIn` computed with a stable `hasToken` ref initialized once at composable setup time.

    Current lines 21-23:
    ```typescript
    const tokenCleared = ref(false);
    const isPendingLogin = ref(Boolean(getStoredIdToken()) && player.value?.userId == null);
    const isLoggedIn = computed(() => !tokenCleared.value && Boolean(getStoredIdToken()) && player.value?.userId != null);
    ```

    Change to:
    ```typescript
    const tokenCleared = ref(false);
    const hasToken = ref(Boolean(getStoredIdToken()));
    const isPendingLogin = ref(hasToken.value && player.value?.userId == null);
    const isLoggedIn = computed(() => !tokenCleared.value && hasToken.value && player.value?.userId != null);
    ```

    No other changes needed. `tokenCleared` already handles the logout path. Token refresh happens via full OIDC redirect (page reload), so `hasToken` is correctly re-initialized on the new page load.

    Do not change the logout function, the watch block, or any other logic.
  </action>
  <verify>
    Grep to confirm the new ref exists and the computed no longer calls getStoredIdToken:
    `grep -n "hasToken\|getStoredIdToken\|isLoggedIn" src/composables/useAuth.ts`

    Expected output:
    - A line with `const hasToken = ref(Boolean(getStoredIdToken()))` (one call, at init time)
    - A line with `const isPendingLogin = ref(hasToken.value && ...`
    - A line with `isLoggedIn = computed(() => !tokenCleared.value && hasToken.value && ...`
    - NO line with `getStoredIdToken()` inside the computed definition
  </verify>
  <done>`hasToken` is declared as a ref initialized once. `isPendingLogin` uses `hasToken.value`. `isLoggedIn` computed references `hasToken.value` instead of calling `getStoredIdToken()` directly.</done>
</task>

</tasks>

<verification>
After both edits:
1. `grep -n "removeItem" src/App.vue` — confirms guard-clearing line is gone
2. `grep -n "_version_reload_attempted" src/App.vue` — confirms guard set/check remain (2 lines)
3. `grep -n "hasToken\|getStoredIdToken" src/composables/useAuth.ts` — confirms hasToken ref present, getStoredIdToken only called at init
4. Run `npm run build` (or `npm run type-check`) to confirm no TypeScript errors introduced
</verification>

<success_criteria>
- Version watcher no longer clears the reload guard on version-match deliveries
- `isLoggedIn` computed does not call `getStoredIdToken()` on every reactive update
- No TypeScript errors
- Players with valid SpacetimeDB sessions are not kicked to login screen due to OIDC token expiry
</success_criteria>

<output>
After completion, create `.planning/quick/223-fix-players-being-dumped-to-login-screen/223-SUMMARY.md` using the summary template.
</output>
