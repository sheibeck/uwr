---
phase: quick-36
plan: 01
subsystem: authentication/ui
tags: [auth, ui-transitions, reactive-state]
dependency-graph:
  requires: [useAuth composable, App.vue, styles.ts]
  provides: [smooth auth transitions, pending-login state, reactive logout]
  affects: [SplashScreen, game UI rendering]
tech-stack:
  added: [isPendingLogin state, tokenCleared reactive flag, loadingOverlay styles]
  patterns: [three-state rendering, reactive auth state]
key-files:
  created: []
  modified: [src/composables/useAuth.ts, src/App.vue, src/ui/styles.ts]
decisions:
  - "Reactive logout using tokenCleared ref instead of page reload for instant UI update"
  - "Loading overlay uses same background gradient as splash screen for seamless transition"
  - "isPendingLogin detected by checking token exists but player.userId is null"
metrics:
  duration: 2min
  completed: 2026-02-12
---

# Quick Task 36: Fix Login/Logout Transition Flashing

**One-liner:** Eliminated auth transition flashes with three-state rendering (splash/loading/game) and reactive logout without page reload.

---

## Objective

Fix visual flashing during authentication transitions by preventing splash screen re-render after OAuth redirect and eliminating black screen flash on logout.

---

## Changes Made

### Task 1: Add pending-login state to useAuth and eliminate logout reload

**Files:** `src/composables/useAuth.ts`

**Changes:**
- Added `isPendingLogin` ref initialized to `true` if token exists but `player.value?.userId` is null
- Added `tokenCleared` ref to make `isLoggedIn` reactively false on logout
- Modified `isLoggedIn` computed to check `!tokenCleared.value && Boolean(getStoredIdToken()) && player.value?.userId != null`
- Updated watcher to set `isPendingLogin.value = false` when `userId != null` (login complete)
- Removed `window.location.reload()` from `logout()`, replaced with `tokenCleared.value = true`
- Exported `isPendingLogin` from composable return

**Commit:** `1441a34`

### Task 2: Add three-state rendering in App.vue and loading styles

**Files:** `src/App.vue`, `src/ui/styles.ts`

**Changes:**

**App.vue:**
- Destructured `isPendingLogin` from `useAuth()`
- Replaced two-state template with three states:
  - State 1: `v-if="!isLoggedIn && !isPendingLogin"` — show splash screen
  - State 2: `v-else-if="isPendingLogin"` — show loading overlay
  - State 3: `v-else` — show game UI
- Added loading overlay div with "Entering the realm..." text
- Added `@keyframes loadingPulse` animation for text pulsing effect

**styles.ts:**
- Added `loadingOverlay` style: fixed position, same gradient as splash, z-index 9999
- Added `loadingText` style: uppercase golden text with loadingPulse animation

**Commit:** `425156c`

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Verification

**Login flow:**
- After OAuth redirect, user sees "Entering the realm..." loading state (not splash screen re-render)
- Loading text pulses subtly while waiting for SpacetimeDB subscription data
- Once player data arrives, game UI renders smoothly

**Logout flow:**
- Clicking logout immediately shows splash screen with no black screen flash
- No page reload occurs (URL stays the same, no full refresh)
- `isLoggedIn` becomes reactively false via `tokenCleared` ref

**Cold load:**
- Without stored token, splash screen appears normally (not loading state)

**Already logged in:**
- With valid token in localStorage, page refresh shows "Entering the realm..." loading state, then game UI

---

## Key Decisions

1. **Reactive logout via `tokenCleared` ref** — Avoids `window.location.reload()` which caused black screen flash. Makes `isLoggedIn` immediately false without needing localStorage to trigger reactivity.

2. **Loading overlay background matches splash gradient** — Ensures seamless visual transition from splash (before OAuth redirect) to loading (after redirect return). No color flash.

3. **`isPendingLogin` initialized on composable creation** — Detects returning OAuth user by checking `getStoredIdToken()` at init time. Set to false once player data loads.

---

## Self-Check: PASSED

**Created files:** None

**Modified files:**
- `src/composables/useAuth.ts` — exists ✓
- `src/App.vue` — exists ✓
- `src/ui/styles.ts` — exists ✓

**Commits:**
- `1441a34` — exists ✓
- `425156c` — exists ✓

All claimed changes verified.
