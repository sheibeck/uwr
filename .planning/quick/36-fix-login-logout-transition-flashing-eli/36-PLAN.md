---
phase: quick-36
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useAuth.ts
  - src/App.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "After OAuth redirect returns, the splash screen does NOT re-appear before the game UI loads"
    - "On logout, no black screen flash occurs between game UI and splash screen"
    - "A brief loading state is shown while waiting for SpacetimeDB subscription data after login"
  artifacts:
    - path: "src/composables/useAuth.ts"
      provides: "Auth state with pending-login detection to avoid splash re-render"
    - path: "src/App.vue"
      provides: "Three-state rendering: splash, loading, game — no raw v-if flicker"
    - path: "src/ui/styles.ts"
      provides: "Loading indicator styles"
  key_links:
    - from: "src/composables/useAuth.ts"
      to: "src/App.vue"
      via: "isLoggedIn + isPendingLogin refs"
      pattern: "isPendingLogin|isLoggedIn"
---

<objective>
Fix visual flashing during authentication transitions. Eliminate the black screen on logout and the splash screen re-render on login.

Purpose: The current auth flow has two flash bugs:
1. **Login flash:** After OAuth redirect, the token is stored but `player.value` is still null (SpacetimeDB subscription data hasn't arrived), so `isLoggedIn` is false and the splash screen briefly re-renders before the game UI appears.
2. **Logout flash:** `window.location.reload()` causes a full page reload with a black `#app` div visible before Vue re-mounts the splash screen.

Output: Smooth transitions between splash, loading, and game states with no flicker.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useAuth.ts
@src/App.vue
@src/ui/styles.ts
@src/main.ts
@src/auth/spacetimeAuth.ts
@src/components/SplashScreen.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pending-login state to useAuth and eliminate logout reload</name>
  <files>src/composables/useAuth.ts</files>
  <action>
Modify useAuth to fix both transition bugs:

**1. Add `isPendingLogin` ref:**
- On initialization, check if `getStoredIdToken()` returns a truthy value. If so, the user has just completed OAuth but subscription data hasn't arrived yet. Set `isPendingLogin = ref(true)` in this case.
- When the watcher detects `player.value?.userId != null` (login complete), set `isPendingLogin.value = false`.
- If `getStoredIdToken()` is falsy on init, `isPendingLogin` stays `false` (genuine unauthenticated user).

**2. Fix logout to avoid page reload:**
- Remove `window.location.reload()` from the `logout` function.
- Instead, after calling `logoutReducer()` and `clearAuthSession()`, just reset local state. The reactive system will flip `isLoggedIn` to false (since `getStoredIdToken()` returns null after clear), which will show the splash screen.
- The problem is `isLoggedIn` uses `getStoredIdToken()` which is not reactive (it reads localStorage directly). To fix this, add a `tokenCleared` ref initialized to `false`. In `logout`, set `tokenCleared.value = true` after `clearAuthSession()`. Update the `isLoggedIn` computed to also check `!tokenCleared.value`:
  ```
  const isLoggedIn = computed(() => !tokenCleared.value && Boolean(getStoredIdToken()) && player.value?.userId != null);
  ```
- This makes `isLoggedIn` immediately reactive on logout without a page reload.

**3. Return `isPendingLogin` from the composable** alongside existing returns.

The key insight: `isPendingLogin` is true when we have a stored token but haven't received player data yet. App.vue will use this to show a loading state instead of flashing the splash screen.
  </action>
  <verify>TypeScript compiles without errors: `npx vue-tsc --noEmit` or verify no red squiggles. Verify `isPendingLogin` is exported from the composable return.</verify>
  <done>useAuth returns `isPendingLogin` ref. Logout no longer calls `window.location.reload()`. `isLoggedIn` is reactively false immediately after logout without needing a reload.</done>
</task>

<task type="auto">
  <name>Task 2: Add three-state rendering in App.vue and loading styles</name>
  <files>src/App.vue, src/ui/styles.ts</files>
  <action>
**In src/App.vue:**

1. Destructure `isPendingLogin` from `useAuth()`:
   ```
   const { isLoggedIn, isPendingLogin, login, logout, authMessage, authError } = useAuth({ ... });
   ```

2. Replace the current two-state template (`v-if="!isLoggedIn"` / `v-else`) with three states:
   ```html
   <!-- State 1: Unauthenticated — show splash -->
   <SplashScreen
     v-if="!isLoggedIn && !isPendingLogin"
     :styles="styles"
     :conn-active="conn.isActive"
     :auth-message="authMessage"
     :auth-error="authError"
     @login="login"
   />

   <!-- State 2: Authenticated but waiting for data — show loading -->
   <div v-else-if="isPendingLogin" :style="styles.loadingOverlay">
     <div :style="styles.loadingText">Entering the realm...</div>
   </div>

   <!-- State 3: Fully loaded — show game -->
   <div v-else :style="styles.shell">
     ... (existing game UI, unchanged)
   </div>
   ```

   The loading overlay uses the same background gradient as the splash so there is no visual discontinuity. The user sees "Entering the realm..." text while SpacetimeDB data loads.

3. No other changes to the game UI section (the `v-else` block stays exactly as-is, just change `v-else` condition remains `v-else` since it is the fallback after the first two conditions).

**In src/ui/styles.ts:**

Add two new style entries before the closing `} as const`:

```typescript
loadingOverlay: {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  background: 'linear-gradient(135deg, #0b0c10 0%, #141821 40%, #0d1117 100%)',
  color: '#e6e8ef',
  fontFamily: '"PT Serif", "Georgia", serif',
  zIndex: 9999,
},
loadingText: {
  fontSize: '1.1rem',
  letterSpacing: '0.12em',
  color: 'rgba(248, 201, 74, 0.7)',
  textTransform: 'uppercase',
  animation: 'loadingPulse 2s ease-in-out infinite',
},
```

Also add a `@keyframes loadingPulse` CSS block in the `<style>` section of App.vue (alongside the existing `combatPulse` keyframes):
```css
@keyframes loadingPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
```

This gives a subtle pulsing effect to the loading text. The background matches the splash screen gradient exactly, so the transition from splash (before OAuth redirect) to loading (after redirect return) is seamless with no flash.
  </action>
  <verify>
1. `npx vue-tsc --noEmit` passes (or `npm run build` succeeds).
2. Visual check: In App.vue template, confirm three distinct conditions: `v-if="!isLoggedIn && !isPendingLogin"`, `v-else-if="isPendingLogin"`, `v-else`.
3. Styles file has `loadingOverlay` and `loadingText` entries.
  </verify>
  <done>
- After OAuth redirect return, user sees "Entering the realm..." loading text (same background as splash) instead of briefly re-seeing the splash screen.
- On logout, the splash screen appears immediately with no black screen flash (no page reload).
- The loading text pulses subtly while waiting for SpacetimeDB data.
  </done>
</task>

</tasks>

<verification>
1. **Login flow test:** Clear localStorage, load the app. See splash screen. Click Login. After OAuth redirect returns, verify you see "Entering the realm..." loading state, NOT the splash screen again. Once data loads, game UI appears.
2. **Logout flow test:** While logged in, click Logout. Verify the splash screen appears immediately with NO black screen flash and NO page reload (URL stays the same, no full refresh).
3. **Cold load test:** Clear localStorage, load the app fresh. Verify splash screen appears normally (not the loading state).
4. **Already logged in test:** With valid token in localStorage, refresh page. Verify you see "Entering the realm..." while data loads, then game UI — no splash flash.
</verification>

<success_criteria>
- Zero black screen flashes during login or logout transitions
- Splash screen never re-renders after successful OAuth redirect
- Loading state with matching background shown during subscription data load
- Logout works without page reload
- Cold load (no token) still shows splash screen correctly
</success_criteria>

<output>
After completion, create `.planning/quick/36-fix-login-logout-transition-flashing-eli/36-SUMMARY.md`
</output>
