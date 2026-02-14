---
phase: quick-70
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/usePlayer.ts
  - src/composables/useGameData.ts
  - src/App.vue
autonomous: true

must_haves:
  truths:
    - "User remains logged in after creating a new character"
    - "Newly created character is auto-selected after creation"
    - "Session persists through Player row updates (activeCharacterId changes)"
    - "All existing auth flows (login, logout, disconnect) continue working"
  artifacts:
    - path: "src/composables/usePlayer.ts"
      provides: "Player lookup via client-side identity filtering instead of unreliable view"
    - path: "src/composables/useGameData.ts"
      provides: "Removal of myPlayer view subscription (no longer needed)"
    - path: "src/App.vue"
      provides: "Updated usePlayer call using players + identity instead of myPlayer view"
  key_links:
    - from: "src/composables/usePlayer.ts"
      to: "window.__my_identity"
      via: "Identity-based client-side filtering of public player table"
      pattern: "__my_identity.*toHexString"
---

<objective>
Fix character creation kicking user to login screen by replacing the unreliable `myPlayer` SpacetimeDB view with client-side identity filtering on the public `player` table.

Purpose: The `my_player` view (the ONLY remaining view in the codebase after quick-46 converted all others) suffers from the same unreliable reactivity that affected 12+ other tables. When `set_active_character` updates the Player row after character creation, the view transiently returns `[]`, making `player.value` become `null`, `userId` become `null`, `isLoggedIn` become `false`, which triggers the App.vue logout cascade watcher (line 1655-1674) that clears `selectedCharacterId` and closes all panels -- appearing as a session loss / kick to login screen.

Output: Stable session that persists through Player row mutations.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@src/composables/usePlayer.ts
@src/composables/useGameData.ts
@src/App.vue
@src/main.ts
@spacetimedb/src/views/player.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace myPlayer view with client-side identity filtering</name>
  <files>src/composables/usePlayer.ts, src/composables/useGameData.ts, src/App.vue</files>
  <action>
This is the same fix pattern used in quick-46 for all other per-user tables. The `my_player` view has unreliable reactivity causing transient empty results during Player row updates.

**1. Update `src/composables/usePlayer.ts`:**
- Change the `UsePlayerArgs` type: replace `myPlayer: Ref<PlayerRow[]>` with `players: Ref<PlayerRow[]>`
- Add `import { Identity } from 'spacetimedb'` at the top
- Change `player` computed from:
  ```typescript
  const player = computed(() => (myPlayer.value.length ? myPlayer.value[0] : null));
  ```
  To:
  ```typescript
  const player = computed(() => {
    const myIdentity = window.__my_identity;
    if (!myIdentity) return null;
    const myHex = myIdentity.toHexString();
    return players.value.find((row) => row.id.toHexString() === myHex) ?? null;
  });
  ```
  This filters the public `player` table by the current client's identity (stored in `window.__my_identity` by `main.ts` on connect). This is the same pattern used throughout the codebase for identity comparison (see decision #8 in CLAUDE.md: "Compare identities using toHexString()").

**2. Update `src/App.vue`:**
- In the `usePlayer` call (around line 561), change from:
  ```typescript
  const { player, userId, userEmail, sessionStartedAt } = usePlayer({ myPlayer, users });
  ```
  To:
  ```typescript
  const { player, userId, userEmail, sessionStartedAt } = usePlayer({ players, users });
  ```
- The `myPlayer` destructured from `useGameData()` is no longer needed by `usePlayer`. However, keep the `useGameData()` destructure as-is for now (no harm in having it, and the subscription may be used elsewhere or in views).

**3. Update `src/composables/useGameData.ts`:**
- Remove the `myPlayer` subscription line: `const [myPlayer] = useTable(tables.myPlayer);`
- Remove `myPlayer` from the return object
- Keep `players` subscription (already exists, needed for client-side filtering)

**4. Update `src/App.vue` to remove `myPlayer` from useGameData destructure:**
- Remove `myPlayer` from the destructured `useGameData()` return (line 535)

**Why this works:** The public `player` table subscription is reactive and reliable (no view layer). When `set_active_character` updates the Player row, the `players` ref updates reactively, the `find()` matches the same row by identity, and `userId` never transiently becomes null. This eliminates the cascade that clears `selectedCharacterId` and shows the splash screen.

**Important:** Do NOT modify any server-side files. The `my_player` view in `spacetimedb/src/views/player.ts` can remain (it won't hurt anything, and removing it requires a republish). We are only changing the client to stop relying on it.
  </action>
  <verify>
    1. Run `cd C:\projects\uwr && npm run build` (or the equivalent Vite build) to confirm no TypeScript errors
    2. Grep for any remaining references to `myPlayer` in App.vue and usePlayer.ts to confirm they are removed
    3. Grep for `useTable(tables.myPlayer)` to confirm the view subscription is removed from useGameData.ts
    4. Verify `usePlayer.ts` now takes `players` arg and filters by `window.__my_identity`
  </verify>
  <done>
    - usePlayer.ts accepts `players` (not `myPlayer`) and filters by `window.__my_identity.toHexString()`
    - useGameData.ts no longer subscribes to `tables.myPlayer`
    - App.vue passes `players` to `usePlayer` instead of `myPlayer`
    - Build succeeds with no TypeScript errors
    - The isLoggedIn computed chain (player -> userId -> isLoggedIn) is now backed by the reliable public player table instead of the unreliable my_player view
  </done>
</task>

</tasks>

<verification>
- `npm run build` succeeds (no compile errors)
- No remaining references to `myPlayer` in client composables (except possibly generated bindings which are fine)
- The `player` computed in usePlayer.ts uses identity-based client-side filtering
- Auth flow remains intact: isLoggedIn depends on player.userId which now comes from stable public table
</verification>

<success_criteria>
1. Character creation no longer kicks user to login screen
2. Session persists through all Player row updates (active character changes, lastSeenAt updates)
3. Login, logout, and disconnect flows continue working correctly
4. Build passes with no errors
</success_criteria>

<output>
After completion, create `.planning/quick/70-fix-character-creation-kicking-user-to-l/70-SUMMARY.md`
</output>
