---
phase: quick-34
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SplashScreen.vue
  - src/App.vue
  - src/ui/styles.ts
autonomous: true

must_haves:
  truths:
    - "Unauthenticated users see ONLY the splash screen — no game panels, no header, no footer"
    - "Splash screen displays large ASCII art reading 'Unwritten Realms'"
    - "Splash screen displays a small ASCII dungeon entrance below the title"
    - "Splash screen displays a clickable 'Login >' prompt that triggers SpacetimeAuth login"
    - "Authenticated users see the normal game UI with no splash screen"
  artifacts:
    - path: "src/components/SplashScreen.vue"
      provides: "Full-screen splash component with ASCII art and login trigger"
    - path: "src/App.vue"
      provides: "Conditional rendering — splash when !isLoggedIn, game UI when isLoggedIn"
    - path: "src/ui/styles.ts"
      provides: "Splash screen style definitions matching dark RPG theme"
  key_links:
    - from: "src/App.vue"
      to: "src/components/SplashScreen.vue"
      via: "v-if/v-else on isLoggedIn"
      pattern: "v-if.*isLoggedIn"
    - from: "src/components/SplashScreen.vue"
      to: "useAuth login()"
      via: "@login emit wired to App.vue login handler"
      pattern: "@login"
---

<objective>
Add an ASCII art splash screen that is the ONLY thing unauthenticated users see when visiting the site. The splash shows a large "Unwritten Realms" ASCII title, a small ASCII dungeon entrance, and a "Login >" prompt. Authenticated users bypass it entirely and see the normal game UI.

Purpose: Give the game a dramatic, thematic first impression and hide all game UI from non-players.
Output: SplashScreen.vue component, updated App.vue with auth gate, splash styles in styles.ts
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/ui/styles.ts
@src/composables/useAuth.ts
@src/components/AppHeader.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SplashScreen component and splash styles</name>
  <files>src/components/SplashScreen.vue, src/ui/styles.ts</files>
  <action>
Create `src/components/SplashScreen.vue` — a full-screen splash overlay component.

The component receives props: `styles` (Record), `connActive` (boolean), `authMessage` (string), `authError` (string).
It emits: `login`.

Template structure:
- A centered full-screen container (uses `styles.splashOverlay`)
- Inside, a vertical stack with:
  1. A `<pre>` block containing large ASCII art of the words "UNWRITTEN REALMS" using a blocky/banner font style. Use a multi-line template literal. The art should be roughly 60-80 chars wide, using characters like `_`, `|`, `/`, `\`, etc. Make it dramatic and readable. Example style — large block letters, not tiny.
  2. Below the title, a smaller `<pre>` block with a simple ASCII dungeon entrance — something like a stone archway with darkness inside, roughly 20-30 chars wide, 8-12 lines tall. Include details like brick/stone texture (`[===]`), pillars (`||`), darkness (`.` or empty space), and a hint of steps.
  3. Below the dungeon, a clickable "Login >" text styled as `styles.splashLogin`. This is a `<button>` element that emits `login` on click. Disabled when `!connActive`.
  4. Below the button, show `authMessage` and `authError` if present (same pattern as AppHeader).

Add styles to `src/ui/styles.ts`:

```
splashOverlay: {
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
splashAsciiTitle: {
  fontSize: '0.55rem',
  lineHeight: 1.15,
  letterSpacing: '0.08em',
  color: 'rgba(248, 201, 74, 0.9)',
  textAlign: 'center',
  marginBottom: '1.5rem',
  fontFamily: 'monospace',
  userSelect: 'none',
},
splashAsciiDungeon: {
  fontSize: '0.7rem',
  lineHeight: 1.2,
  color: 'rgba(180, 180, 200, 0.6)',
  textAlign: 'center',
  marginBottom: '2.5rem',
  fontFamily: 'monospace',
  userSelect: 'none',
},
splashLogin: {
  background: 'none',
  border: '1px solid rgba(248, 201, 74, 0.4)',
  color: 'rgba(248, 201, 74, 0.9)',
  fontSize: '1.1rem',
  letterSpacing: '0.12em',
  padding: '0.6rem 2rem',
  borderRadius: '8px',
  cursor: 'pointer',
  fontFamily: '"PT Serif", "Georgia", serif',
  textTransform: 'uppercase',
  transition: 'border-color 0.2s, color 0.2s',
},
```

The ASCII title art should use gold-ish coloring (via splashAsciiTitle). The dungeon entrance should be dimmer (via splashAsciiDungeon). The login button uses the gold accent from the existing xpFill gradient color (#f8c94a).
  </action>
  <verify>File `src/components/SplashScreen.vue` exists and contains `<pre>` blocks with ASCII art, a login button emitting `login`, and proper prop/emit declarations. Styles file contains all `splash*` style keys.</verify>
  <done>SplashScreen.vue renders ASCII "Unwritten Realms" title, dungeon entrance, and login button. All splash styles defined in styles.ts.</done>
</task>

<task type="auto">
  <name>Task 2: Gate App.vue to show splash when unauthenticated</name>
  <files>src/App.vue</files>
  <action>
Modify `src/App.vue` to conditionally render:

1. Import `SplashScreen` at the top of the script:
   `import SplashScreen from './components/SplashScreen.vue';`

2. In the template, wrap the ENTIRE existing content (the outer `<div :style="styles.shell">`) in a conditional:
   - When `!isLoggedIn`: render ONLY `<SplashScreen>` with props: `:styles="styles"`, `:conn-active="conn.isActive"`, `:auth-message="authMessage"`, `:auth-error="authError"`, and `@login="login"`.
   - When `isLoggedIn`: render the existing `<div :style="styles.shell">` with all current content unchanged.

The template should look like:
```html
<template>
  <SplashScreen
    v-if="!isLoggedIn"
    :styles="styles"
    :conn-active="conn.isActive"
    :auth-message="authMessage"
    :auth-error="authError"
    @login="login"
  />
  <div v-else :style="styles.shell">
    <!-- all existing content unchanged -->
  </div>
</template>
```

This ensures unauthenticated users see ONLY the splash screen. No header, no panels, no footer, no floating elements. The `isLoggedIn`, `conn`, `authMessage`, `authError`, and `login` are already available in App.vue from the existing `useAuth` composable.

Do NOT modify any of the existing game UI content — only wrap it in `v-else` and add the `SplashScreen` with `v-if`.
  </action>
  <verify>Run `npx vue-tsc --noEmit` to confirm no TypeScript errors. Visually inspect App.vue template starts with `<SplashScreen v-if="!isLoggedIn"` followed by `<div v-else :style="styles.shell">`.</verify>
  <done>Unauthenticated visitors see only the splash screen. Authenticated users see the full game UI. No game panels, header, or footer leak through when logged out.</done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no errors
2. Visit the site without being logged in — only the splash screen is visible (ASCII art title, dungeon, login button)
3. No game panels, header, footer, or floating elements visible when unauthenticated
4. Click "Login >" — triggers SpacetimeAuth redirect
5. After login, splash disappears and full game UI loads
</verification>

<success_criteria>
- Unauthenticated users see ONLY: ASCII "Unwritten Realms" title + dungeon entrance + "Login >" button
- Zero game UI elements visible when not logged in
- Login button triggers the existing SpacetimeAuth flow
- Authenticated users see normal game with no splash
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/34-add-ascii-art-splash-screen-for-unauthen/34-SUMMARY.md`
</output>
