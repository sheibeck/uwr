---
phase: quick-279
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
  - src/App.vue
autonomous: true
requirements: [QUICK-279]

must_haves:
  truths:
    - "Onboarding hint renders on top of all floating panels"
    - "Onboarding hint is compact — does not dominate vertical space"
    - "Hint text reads exactly: Open the Character panel, equip your gear from the Inventory tab, then add an ability to your hotbar from the Abilities tab."
  artifacts:
    - path: "src/ui/styles.ts"
      provides: "onboardingHint style with position fixed, high zIndex, compact padding"
    - path: "src/App.vue"
      provides: "Updated hint text string"
  key_links:
    - from: "src/App.vue onboardingHint computed"
      to: "styles.onboardingHint"
      via: ":style binding on hint div"
      pattern: "styles\\.onboardingHint"
---

<objective>
Fix three issues with the new character onboarding hint overlay: z-index so it renders above floating panels, reduced vertical height, and updated hint text.

Purpose: The hint was added in quick-278 but renders inside the main flex flow with no z-index, so floating panels (zIndex: 6) can cover it. It also takes up too much space and has stale text.
Output: A compact, always-on-top hint banner with the correct instructional text.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@src/ui/styles.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix onboardingHint style — position fixed, high z-index, compact layout</name>
  <files>src/ui/styles.ts</files>
  <action>
    In `src/ui/styles.ts`, replace the existing `onboardingHint` style object (lines ~1240-1248) with a fixed-position banner:

    ```ts
    onboardingHint: {
      position: 'fixed' as const,
      top: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.4rem 0.9rem',
      borderRadius: '8px',
      background: 'rgba(246, 196, 83, 0.12)',
      border: '1px solid rgba(246, 196, 83, 0.4)',
      color: '#f6c453',
      fontSize: '0.85rem',
      whiteSpace: 'nowrap' as const,
      pointerEvents: 'auto' as const,
    },
    ```

    Key decisions:
    - `position: fixed` + `top: 80px` (below the header) + `left: 50% / transform` centres it horizontally without affecting layout flow.
    - `zIndex: 500` — above floatingPanel (6), commandSuggestions (100), below deathOverlay (9999) and contextMenu (9999).
    - `display: flex; alignItems: center; gap` — puts text and dismiss button side-by-side on one line, eliminating multi-line height.
    - `whiteSpace: nowrap` — keeps it a single compact strip.
    - Remove `marginBottom` (was 0.6rem) — no longer in flow.

    Also update `onboardingDismiss` to remove `marginTop` since the parent is now a flex row:

    ```ts
    onboardingDismiss: {
      background: 'transparent',
      border: '1px solid rgba(246, 196, 83, 0.6)',
      color: '#f6c453',
      borderRadius: '999px',
      padding: '0.2rem 0.55rem',
      fontSize: '0.72rem',
      cursor: 'pointer',
      flexShrink: 0,
    },
    ```
  </action>
  <verify>TypeScript compiles without errors: `npm run build` or check that vite dev server has no type errors on styles.ts.</verify>
  <done>styles.onboardingHint has position fixed, zIndex 500, flex row layout. styles.onboardingDismiss has no marginTop.</done>
</task>

<task type="auto">
  <name>Task 2: Update hint text and remove dead onboarding logic</name>
  <files>src/App.vue</files>
  <action>
    In `src/App.vue`, update the `onboardingHint` computed (around line 901) to return the exact required string:

    ```ts
    const onboardingHint = computed(() => {
      if (onboardingStep.value === 'inventory') {
        return 'Open the Character panel, equip your gear from the Inventory tab, then add an ability to your hotbar from the Abilities tab.';
      }
      return '';
    });
    ```

    The `'abilities'` branch of `onboardingStep` is never set anywhere and the computed never referenced it, so no other changes are needed for the text update.

    Also the hint div markup at lines 57-63 currently stacks the text and button vertically (two separate child divs). Update it to match the new flex-row style — the text and button should be siblings directly inside the hint container:

    ```html
    <!-- Onboarding hint -->
    <div v-if="onboardingHint" :style="styles.onboardingHint">
      <span>{{ onboardingHint }}</span>
      <button type="button" :style="styles.onboardingDismiss" @click="dismissOnboarding">
        Dismiss
      </button>
    </div>
    ```

    Change `<div>` wrapping the text to `<span>` so it does not force a block, and shorten the button label to "Dismiss" to keep the banner compact. Do not change any other part of the template.
  </action>
  <verify>
    1. Create a new character in the running app.
    2. Confirm the golden hint banner appears at the top-centre of the screen (fixed position, not inside the log/panel area).
    3. Open a floating panel (e.g. Character panel) — confirm it renders BELOW the hint banner, not over it.
    4. Confirm the hint text reads exactly: "Open the Character panel, equip your gear from the Inventory tab, then add an ability to your hotbar from the Abilities tab."
    5. Click "Dismiss" — banner disappears.
  </verify>
  <done>Hint is fixed-position above all panels, single-line compact layout, correct text, dismiss works.</done>
</task>

</tasks>

<verification>
After both tasks:
- Hint banner is visible above floating panels when a new character is created.
- Banner is a slim single-line strip, not a tall block.
- Text matches exactly: "Open the Character panel, equip your gear from the Inventory tab, then add an ability to your hotbar from the Abilities tab."
- Dismiss button clears the banner.
- No TypeScript compile errors introduced.
</verification>

<success_criteria>
New character onboarding hint renders fixed at top-centre, above all floating panels (zIndex 500), in a compact single-line strip with the correct instructional text.
</success_criteria>

<output>
After completion, create `.planning/quick/279-fix-new-character-hint-z-index-reduce-he/279-SUMMARY.md`
</output>
