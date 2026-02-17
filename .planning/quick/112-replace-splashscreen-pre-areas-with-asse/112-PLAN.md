---
phase: quick-112
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SplashScreen.vue
  - src/ui/styles.ts
  - public/assets/logo.png
autonomous: true
must_haves:
  truths:
    - "Splash screen displays the logo.png image instead of ASCII art pre blocks"
    - "Login button still works and appears below the logo image"
    - "Auth messages still display correctly below the login button"
  artifacts:
    - path: "public/assets/logo.png"
      provides: "Logo image served as static asset"
    - path: "src/components/SplashScreen.vue"
      provides: "Updated splash screen with img tag replacing pre blocks"
    - path: "src/ui/styles.ts"
      provides: "Updated styles: splashLogo replaces splashAsciiTitle and splashAsciiDungeon"
  key_links:
    - from: "src/components/SplashScreen.vue"
      to: "public/assets/logo.png"
      via: "img src attribute using /assets/logo.png"
      pattern: "src.*assets/logo\\.png"
---

<objective>
Replace the ASCII art `<pre>` blocks on the splash screen with the pixel art logo.png image.

Purpose: The splash screen currently uses two `<pre>` elements for ASCII art title text and a dungeon entrance. A proper pixel art logo.png already exists at `spacetimedb/src/assets/logo.png` which contains the game title and dungeon art in a much more polished format.

Output: SplashScreen.vue uses an `<img>` tag for the logo, both `<pre>` blocks removed, styles updated.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/SplashScreen.vue
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copy logo to public assets and update SplashScreen component</name>
  <files>public/assets/logo.png, src/components/SplashScreen.vue, src/ui/styles.ts</files>
  <action>
1. Create `public/assets/` directory and copy `spacetimedb/src/assets/logo.png` into it. Vite serves files in `public/` at the root path, so `/assets/logo.png` will be the URL.

2. In `src/components/SplashScreen.vue`:
   - Remove BOTH `<pre>` blocks entirely (lines 3-14 for the title ASCII art, lines 16-31 for the dungeon ASCII art).
   - Replace them with a single `<img>` tag:
     ```html
     <img src="/assets/logo.png" alt="Unwritten Realms" :style="styles.splashLogo" />
     ```
   - Place it as the first child inside the `splashOverlay` div, before the login button.

3. In `src/ui/styles.ts`:
   - Remove the `splashAsciiTitle` style object (lines ~1503-1512).
   - Remove the `splashAsciiDungeon` style object (lines ~1513-1521).
   - Add a new `splashLogo` style object in their place:
     ```typescript
     splashLogo: {
       maxWidth: 'min(400px, 80vw)',
       height: 'auto',
       marginBottom: '2rem',
       userSelect: 'none',
       imageRendering: 'pixelated',
     },
     ```
   - The `imageRendering: 'pixelated'` preserves the pixel art aesthetic at various sizes. `maxWidth` with `min()` ensures it looks good on both desktop and mobile.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to confirm no TypeScript errors. Visually confirm the SplashScreen.vue template has an img tag and no pre tags. Confirm `public/assets/logo.png` exists.
  </verify>
  <done>
Splash screen renders logo.png image instead of ASCII art. Both pre blocks are gone. Login button and auth messages remain functional below the image. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `public/assets/logo.png` exists and matches `spacetimedb/src/assets/logo.png`
- `src/components/SplashScreen.vue` contains `<img` tag, no `<pre` tags
- `src/ui/styles.ts` contains `splashLogo` style, no `splashAsciiTitle` or `splashAsciiDungeon` styles
- TypeScript compiles without errors
</verification>

<success_criteria>
- The splash screen displays the pixel art logo image centered above the login button
- No ASCII art pre blocks remain in the component
- The image scales responsively (max 400px width, 80vw on small screens)
- Pixel art rendering is crisp (imageRendering: pixelated)
</success_criteria>

<output>
After completion, create `.planning/quick/112-replace-splashscreen-pre-areas-with-asse/112-SUMMARY.md`
</output>
