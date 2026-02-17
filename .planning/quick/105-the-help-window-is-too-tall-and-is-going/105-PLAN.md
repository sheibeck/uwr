---
phase: quick-105
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/HelpOverlay.vue
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Help overlay renders fully above the footer, not underneath it"
    - "Help overlay content is scrollable and never extends below the footer"
    - "Help overlay close button is always visible and clickable"
  artifacts:
    - path: "src/components/HelpOverlay.vue"
      provides: "Fixed z-index and height constraints"
    - path: "src/App.vue"
      provides: "HelpOverlay positioned after footer in DOM"
  key_links:
    - from: "src/components/HelpOverlay.vue"
      to: "src/ui/styles.ts"
      via: "z-index layering"
      pattern: "zIndex.*1[0-9]{4}"
---

<objective>
Fix the HelpOverlay extending underneath the footer by correcting z-index stacking and constraining its height.

Purpose: The help window (added in quick-104) renders behind the footer because the footer has z-index 10000 (from quick-79) while the overlay only has z-index 9000. The overlay also needs height constraints to ensure its content stays within the visible area above the footer.

Output: HelpOverlay that renders cleanly above all UI elements including the footer, with scrollable content that never extends off-screen.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/HelpOverlay.vue
@src/App.vue
@src/ui/styles.ts (footer style at line 1134 — z-index 10000)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix HelpOverlay z-index and height constraints</name>
  <files>src/components/HelpOverlay.vue, src/App.vue</files>
  <action>
Two changes needed:

1. In `src/components/HelpOverlay.vue`, update the `backdropStyle` computed:
   - Change `zIndex` from `9000` to `10001` (must be above the footer's 10000 from styles.ts)

2. In `src/components/HelpOverlay.vue`, update the `dialogStyle` computed:
   - Change `maxHeight` from `'80vh'` to `'calc(100vh - 120px)'` to ensure the dialog leaves room for the footer (footer is roughly ~100px tall with padding). The `calc` approach is more robust than a fixed vh percentage since it accounts for the actual remaining space.
   - Ensure `overflowY: 'auto'` remains so content scrolls within the constrained height.

3. In `src/App.vue`, move the HelpOverlay component from its current position (line 467, BEFORE the footer) to AFTER the closing `</footer>` tag (after line 489). This ensures correct DOM stacking order. The line currently reads:
   ```
   <!-- Help overlay -->
   <HelpOverlay v-if="showHelp" :styles="styles" @close="showHelp = false" />
   ```
   Move this block to after the `</footer>` tag and before the tooltip div.

Why: The footer has `position: relative; zIndex: 10000` (set in quick-79 to fix command autocomplete). Since the overlay was z-index 9000 AND positioned before the footer in DOM order, the footer always rendered on top.
  </action>
  <verify>
  Run `npm run build` (or the project's build command) to confirm no template errors. Visually confirm: open the help overlay in the browser — the entire overlay including the "Close Guide" button should be visible and not obscured by the footer/action bar.
  </verify>
  <done>
  Help overlay renders at z-index 10001, above all other UI including the footer. Dialog height is constrained to leave space for the footer. Content scrolls within the dialog. Close button is always visible and clickable.
  </done>
</task>

</tasks>

<verification>
- Open the app in browser
- Click the Help button in the action bar
- Verify the overlay covers the entire screen including over the footer
- Verify the "Close Guide" button is visible at the bottom of the dialog
- Verify scrolling works if content exceeds dialog height
- Verify clicking outside the dialog or pressing Escape closes it
- Verify the footer command bar is NOT visible through/above the overlay
</verification>

<success_criteria>
- Help overlay z-index is 10001 (above footer's 10000)
- HelpOverlay DOM position is after the footer element
- Dialog maxHeight uses calc to account for footer space
- Close button always visible, overlay fully covers footer
</success_criteria>

<output>
After completion, create `.planning/quick/105-the-help-window-is-too-tall-and-is-going/105-SUMMARY.md`
</output>
