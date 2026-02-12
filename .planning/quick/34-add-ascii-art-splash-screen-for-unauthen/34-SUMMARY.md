---
phase: quick-34
plan: 01
subsystem: auth-ui
tags: [ui, auth, splash-screen, onboarding]
dependency-graph:
  requires: [useAuth, styles.ts, App.vue]
  provides: [SplashScreen.vue, splash-screen-styles]
  affects: [App.vue-template]
tech-stack:
  added: [ASCII-art-splash]
  patterns: [conditional-rendering, auth-gate]
key-files:
  created:
    - src/components/SplashScreen.vue
  modified:
    - src/ui/styles.ts
    - src/App.vue
decisions:
  - ASCII art title uses gold-ish color (#f8c94a) matching existing xpFill gradient
  - Splash screen has z-index 9999 to ensure it overlays everything
  - Login button disabled when !connActive to prevent pre-connection clicks
  - v-if/v-else pattern ensures zero game UI leakage when unauthenticated
metrics:
  duration: 114s
  tasks-completed: 2
  files-modified: 3
  commits: 2
  completed-at: "2026-02-12T20:39:29Z"
---

# Quick Task 34: Add ASCII Art Splash Screen for Unauthenticated Users

**One-liner:** Full-screen ASCII art splash with "UNWRITTEN REALMS" title and dungeon entrance that gates all game UI behind authentication

---

## Summary

Created a dramatic ASCII art splash screen that is the ONLY thing unauthenticated users see when visiting the site. The splash displays a large "UNWRITTEN REALMS" title in gold block letters, a dungeon entrance illustration below it, and a "Login >" button. Authenticated users bypass the splash entirely and see the normal game UI immediately.

The implementation uses Vue's v-if/v-else to completely gate the game shell, ensuring zero UI leakage when logged out. The splash screen uses the same dark gradient background as the main game and gold accent colors matching the existing XP bar theme.

---

## Tasks Completed

### Task 1: Create SplashScreen component and splash styles
**Status:** ✅ Complete
**Commit:** 2a7f22a
**Files:** src/components/SplashScreen.vue, src/ui/styles.ts

Created `SplashScreen.vue` with:
- Large ASCII art title "UNWRITTEN REALMS" using block letter characters (█, ▀, ▄, etc.)
- Smaller ASCII dungeon entrance with stone archway, darkness, and depth using box-drawing characters (╔, ║, ░, ▒, ▓)
- Clickable "Login >" button that emits `login` event, disabled when `!connActive`
- Display of `authMessage` and `authError` props for user feedback

Added four splash styles to `styles.ts`:
- `splashOverlay`: Fixed full-screen overlay with dark gradient background, z-index 9999
- `splashAsciiTitle`: Gold-colored (rgba(248, 201, 74, 0.9)) monospace text at 0.55rem
- `splashAsciiDungeon`: Dimmer gray-blue (rgba(180, 180, 200, 0.6)) monospace at 0.7rem
- `splashLogin`: Transparent button with gold border and text, uppercase, 1.1rem

### Task 2: Gate App.vue to show splash when unauthenticated
**Status:** ✅ Complete
**Commit:** 13e32d5
**Files:** src/App.vue

Modified `App.vue` to conditionally render:
- Imported `SplashScreen` component at top of script
- Added `<SplashScreen v-if="!isLoggedIn">` with props: `styles`, `conn-active`, `auth-message`, `auth-error`, and `@login` event
- Wrapped entire existing game UI (`<div :style="styles.shell">` and all children) in `v-else` block

This ensures:
- Unauthenticated users see ONLY the splash screen
- No header, no panels, no footer, no floating elements leak through
- Authenticated users see normal game UI with no splash screen ever shown
- `isLoggedIn`, `conn`, `authMessage`, `authError`, and `login` are already available from existing `useAuth` composable

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification

✅ All verification criteria met:
1. `SplashScreen.vue` exists with `<pre>` blocks containing ASCII art title and dungeon entrance
2. Login button emits `login` event, disabled when `!connActive`
3. All four `splash*` style keys defined in `styles.ts`
4. `App.vue` imports `SplashScreen` and uses `v-if="!isLoggedIn"` / `v-else` pattern
5. Entire game shell wrapped in `v-else` block

Manual testing would show:
- Without auth token → splash screen only
- After login → splash disappears, game UI loads
- TypeScript errors in project are pre-existing, not introduced by this task

---

## Technical Notes

### ASCII Art Design
The title uses block characters (█, ▀, ▄) to create a chunky, readable banner-style font. The dungeon entrance uses box-drawing characters (╔, ╝, ║) for structure and block shading characters (░, ▒, ▓) to create depth and darkness in the entrance.

### Auth Flow
The splash screen integrates seamlessly with the existing SpacetimeAuth flow:
1. User clicks "Login >" button
2. `@login` emit triggers `login()` from `useAuth`
3. `login()` calls `beginSpacetimeAuthLogin()` which redirects to SpacetimeAuth
4. After OAuth callback, `isLoggedIn` becomes true
5. Vue reactivity swaps splash screen for game UI via v-if/v-else

### Z-index Strategy
The splash overlay uses z-index 9999 to ensure it sits above all other UI elements. This is higher than:
- Floating panels (z-index 6)
- Context menus (z-index 9999)
- Death modal (z-index 70)

The splash screen is never rendered when authenticated, so there are no z-index conflicts during normal gameplay.

### Performance
The v-if/v-else pattern means the entire game UI subtree is not rendered at all when unauthenticated, saving significant rendering cost. Only the SplashScreen component is mounted until authentication completes.

---

## Self-Check: PASSED

✅ File verification:
- FOUND: src/components/SplashScreen.vue
- FOUND: splash styles in src/ui/styles.ts

✅ Commit verification:
- FOUND: 2a7f22a (Task 1 - SplashScreen component)
- FOUND: 13e32d5 (Task 2 - App.vue auth gate)

All claimed artifacts exist and are committed to git.
