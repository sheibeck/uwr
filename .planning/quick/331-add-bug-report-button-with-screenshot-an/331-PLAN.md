---
phase: quick-331
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/BugReportModal.vue
  - src/components/ActionBar.vue
  - src/App.vue
  - package.json
autonomous: true
requirements: [BUG-REPORT]

must_haves:
  truths:
    - "User can click a Bug Report button in the action bar"
    - "Clicking captures a screenshot of the game viewport"
    - "User sees a modal with screenshot preview, title, and description fields"
    - "Submitting opens a new GitHub issue tab pre-filled with the report"
  artifacts:
    - path: "src/components/BugReportModal.vue"
      provides: "Bug report modal with screenshot preview, title, description, and submit"
    - path: "src/components/ActionBar.vue"
      provides: "Bug Report button in action bar"
    - path: "src/App.vue"
      provides: "Wiring for showBugReport state and modal rendering"
  key_links:
    - from: "src/components/ActionBar.vue"
      to: "src/App.vue"
      via: "emit('toggle', 'bugReport') -> togglePanel intercept"
      pattern: "bugReport"
    - from: "src/App.vue"
      to: "src/components/BugReportModal.vue"
      via: "v-if showBugReport"
      pattern: "showBugReport"
---

<objective>
Add a Bug Report button to the action bar that captures a screenshot of the game viewport using html2canvas, presents a modal for the user to enter a title and description, and on submission opens a pre-filled GitHub new issue URL in a new browser tab.

Purpose: Allow players to easily report bugs with visual context directly from the game UI.
Output: BugReportModal.vue component, updated ActionBar.vue and App.vue.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/ActionBar.vue (button pattern, emit pattern)
@src/components/CraftingModal.vue (modal overlay pattern — fixed overlay with backdrop)
@src/components/HelpOverlay.vue (similar full-screen overlay toggled via ref like showHelp)
@src/App.vue (toggle wiring — showHelp pattern at line 1172, togglePanel intercept at line 1743, HelpOverlay rendering at line 455)
@src/ui/styles.ts (actionButton, actionBar styles)
@package.json (dependencies — need to add html2canvas)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install html2canvas and create BugReportModal component</name>
  <files>package.json, src/components/BugReportModal.vue</files>
  <action>
1. Install html2canvas:
   ```
   npm install html2canvas
   ```

2. Create `src/components/BugReportModal.vue` following the CraftingModal overlay pattern:

   - **Template:** Fixed overlay backdrop (same pattern as CraftingModal line 3: `position: fixed, inset: 0, background: rgba(0,0,0,0.7), zIndex: 9500`). Click backdrop to close. Inner dialog box styled like CraftingModal (background: #141821, border, borderRadius, padding, max dimensions).

   - **Props:**
     - `screenshotDataUrl: string | null` — base64 PNG data URL of the captured screenshot

   - **Emits:**
     - `close` — close the modal

   - **State (refs):**
     - `title: ref('')` — bug report title
     - `description: ref('')` — bug report description
     - `isSubmitting: ref(false)` — prevent double-submit

   - **Layout (top to bottom in the dialog):**
     1. Header row: "Bug Report" title (left), close button "x" (right) — same style as CraftingModal header
     2. Screenshot preview: Show the `screenshotDataUrl` as an `<img>` inside a bordered container (max-height: 200px, object-fit: contain, width: 100%, background: #0b0c10). Label "Screenshot" above it.
     3. Title input: `<input type="text" v-model="title" placeholder="Brief summary of the bug">` styled with dark background (#1a202c), border, white text, full width. Label "Title" above it.
     4. Description textarea: `<textarea v-model="description" placeholder="Steps to reproduce, what you expected vs what happened..." rows="4">` styled same as input. Label "Description" above it.
     5. Action row (flex, justify-end, gap): Cancel button (transparent, closes modal) and "Submit to GitHub" button (blue like CraftingModal craft button when enabled). Submit is disabled if title is empty.

   - **Submit handler (`handleSubmit`):**
     - Set `isSubmitting = true`
     - Build the GitHub issue body string:
       ```
       **Bug Report**

       ${description.value}

       ---
       **Screenshot:** _(screenshot was captured but cannot be attached via URL — please paste from clipboard if needed)_

       _Submitted from in-game bug reporter_
       ```
     - Build the GitHub new issue URL:
       ```
       https://github.com/sheibeck/uwr/issues/new?title=${encodeURIComponent(title.value)}&body=${encodeURIComponent(body)}
       ```
     - If `screenshotDataUrl` is available, copy the screenshot image to clipboard using:
       ```typescript
       const blob = await (await fetch(screenshotDataUrl)).blob();
       await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
       ```
       Wrap in try/catch — clipboard write may fail in some browsers, that's OK.
     - Open the URL in a new tab: `window.open(url, '_blank')`
     - Emit `close`

   - **Styling:** Use inline styles consistent with CraftingModal. Dark theme colors. Input/textarea: background #1a202c, border 1px solid rgba(255,255,255,0.15), borderRadius 4px, color #d0d3dc, padding 6px 8px, fontSize 13px, width 100%. Labels: fontSize 0.75rem, color #666, textTransform uppercase, letterSpacing 0.05em, marginBottom 4px.
  </action>
  <verify>
  - `npm ls html2canvas` shows it installed
  - No TypeScript errors: `npx vue-tsc --noEmit` (or at minimum the file has no syntax errors)
  </verify>
  <done>BugReportModal.vue exists with screenshot preview, title/description inputs, and GitHub issue URL submission. html2canvas is in package.json dependencies.</done>
</task>

<task type="auto">
  <name>Task 2: Add Bug Report button to ActionBar and wire up in App.vue</name>
  <files>src/components/ActionBar.vue, src/App.vue</files>
  <action>
1. **ActionBar.vue changes:**
   - Add a "Bug Report" button AFTER the Help button (line 8) and BEFORE the `v-if="hasActiveCharacter"` template block. This makes it always visible like Help, not gated behind having a character.
   - The button emits: `@click="emit('toggle', 'bugReport')"`
   - Style it with `actionStyle('bugReport')` — it will use the standard action button style.
   - Add `'bugReport'` to the `PanelKey` type union.

2. **App.vue changes:**
   - Add a `showBugReport` ref (like `showHelp` at line 1172):
     ```typescript
     const showBugReport = ref(false);
     ```
   - Add a `screenshotDataUrl` ref:
     ```typescript
     const screenshotDataUrl = ref<string | null>(null);
     ```
   - Import html2canvas at the top of the script:
     ```typescript
     import html2canvas from 'html2canvas';
     ```
   - Import BugReportModal in the components section (follow the pattern of other component imports).
   - In the `togglePanel` function (around line 1743), add an intercept for 'bugReport' BEFORE the existing 'help' check:
     ```typescript
     if (panelId === 'bugReport') {
       // Capture screenshot before showing modal
       const appEl = document.getElementById('app');
       if (appEl) {
         try {
           const canvas = await html2canvas(appEl, { useCORS: true, logging: false });
           screenshotDataUrl.value = canvas.toDataURL('image/png');
         } catch {
           screenshotDataUrl.value = null;
         }
       }
       showBugReport.value = !showBugReport.value;
       return;
     }
     ```
     NOTE: The `togglePanel` function must become `async` for this `await`. Change the declaration from `const togglePanel = (panelId: string) => {` to `const togglePanel = async (panelId: string) => {`. This is safe because the emitter doesn't await the return value.
   - Add the BugReportModal to the template, right after the HelpOverlay (around line 455):
     ```html
     <BugReportModal
       v-if="showBugReport"
       :screenshot-data-url="screenshotDataUrl"
       @close="showBugReport = false"
     />
     ```
   - When the modal closes, also clear the screenshot: In the close handler, set `screenshotDataUrl.value = null` as well. Simplest: `@close="showBugReport = false; screenshotDataUrl = null"`.
  </action>
  <verify>
  - `npm run build` completes without errors
  - Visually: The action bar shows a "Bug Report" button. Clicking it should capture a screenshot and show the modal. Filling in title and clicking submit should open a new GitHub tab with pre-filled issue.
  </verify>
  <done>Bug Report button appears in action bar (always visible). Clicking it captures a screenshot via html2canvas and opens the BugReportModal. Submitting opens a pre-filled GitHub issue URL in a new tab with the screenshot copied to clipboard for easy pasting.</done>
</task>

</tasks>

<verification>
- `npm run build` completes without errors
- Bug Report button visible in action bar at all times (even without active character)
- Clicking Bug Report captures screenshot and shows modal overlay
- Modal displays screenshot preview, title input, description textarea
- Submit button disabled when title is empty
- Submitting opens `https://github.com/sheibeck/uwr/issues/new?title=...&body=...` in new tab
- Screenshot is copied to clipboard (if browser supports it) for easy pasting into the GitHub issue
- Cancel / backdrop click closes the modal
</verification>

<success_criteria>
Players can report bugs from within the game UI. The flow is: click Bug Report -> see screenshot + form -> enter title/description -> submit opens GitHub issue in new tab with pre-filled content and screenshot on clipboard.
</success_criteria>

<output>
After completion, create `.planning/quick/331-add-bug-report-button-with-screenshot-an/331-SUMMARY.md`
</output>
