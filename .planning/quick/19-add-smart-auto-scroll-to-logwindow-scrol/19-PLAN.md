---
phase: quick-19
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/LogWindow.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "New log entries auto-scroll to bottom when user is already at the bottom"
    - "User can scroll up to read history without being pulled back down"
    - "Auto-scroll resumes when user scrolls back to the bottom"
    - "A 'Jump to bottom' button appears when user is scrolled up and disappears at bottom"
  artifacts:
    - path: "src/components/LogWindow.vue"
      provides: "Smart auto-scroll logic with user-scroll detection and jump-to-bottom button"
    - path: "src/ui/styles.ts"
      provides: "Styles for the jump-to-bottom button"
  key_links:
    - from: "scroll event listener"
      to: "isAtBottom ref"
      via: "scroll handler checks scrollTop + clientHeight >= scrollHeight - threshold"
    - from: "combinedEvents watcher"
      to: "scrollToBottom"
      via: "only calls scrollToBottom when isAtBottom is true"
---

<objective>
Add smart auto-scroll behavior to LogWindow so new log entries auto-scroll to bottom only when the user is already at the bottom, pause when the user scrolls up to review history, and resume when they scroll back down. Include a "Jump to bottom" button when scrolled up.

Purpose: Currently LogWindow force-scrolls to bottom on every new event, making it impossible to review history during active gameplay. This fix preserves auto-scroll while respecting user intent.
Output: Updated LogWindow.vue with smart scroll logic and a jump-to-bottom button.
</objective>

<context>
@.planning/STATE.md
@src/components/LogWindow.vue
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement smart auto-scroll and jump-to-bottom button in LogWindow</name>
  <files>src/components/LogWindow.vue, src/ui/styles.ts</files>
  <action>
In `src/components/LogWindow.vue`:

1. Add a reactive `isAtBottom` ref, initialized to `true` (user starts at bottom).

2. Add a `checkIfAtBottom` function that reads `logListEl.value` and sets `isAtBottom` to `true` when `scrollTop + clientHeight >= scrollHeight - 30` (30px threshold to account for rounding). Set to `false` otherwise.

3. Attach a `@scroll` event listener on the `logList` div (the `ref="logListEl"` element) that calls `checkIfAtBottom`.

4. Modify the existing `watch` on `combinedEvents` so `scrollToBottom()` is only called when `isAtBottom.value` is `true`. Keep `{ deep: true, immediate: true }`.

5. Add a `jumpToBottom` function that sets `isAtBottom.value = true` and calls `scrollToBottom()`.

6. Add a "Jump to bottom" button inside the `<section>` element, positioned absolutely at the bottom-center of the log container. It should:
   - Only render when `!isAtBottom && combinedEvents.length > 0` (use `v-if`)
   - Use a downward arrow character (unicode down arrow) and text "New messages"
   - Call `jumpToBottom()` on click
   - Use `:style="styles.logJumpBtn"` for styling

In `src/ui/styles.ts`:

7. Add `logJumpBtn` style object to the styles. Position it as:
   ```
   logJumpBtn: {
     position: 'absolute',
     bottom: '0.75rem',
     left: '50%',
     transform: 'translateX(-50%)',
     background: 'rgba(30, 35, 50, 0.92)',
     border: '1px solid rgba(255,255,255,0.15)',
     borderRadius: '16px',
     padding: '0.3rem 1rem',
     color: 'rgba(230,232,239,0.85)',
     fontSize: '0.78rem',
     cursor: 'pointer',
     zIndex: 10,
     fontFamily: '"Source Code Pro", "Consolas", monospace',
     transition: 'opacity 0.2s',
   }
   ```

8. Update the `log` style to add `position: 'relative'` so the absolute-positioned button is anchored correctly. The `log` style already has `overflow: 'hidden'` which will clip the button within bounds.
  </action>
  <verify>
    1. Run `npx vue-tsc --noEmit` to confirm no type errors
    2. Manual check: Open the game, generate log entries, confirm auto-scroll works at bottom
    3. Manual check: Scroll up in the log, confirm new entries do NOT force scroll back down
    4. Manual check: Confirm "New messages" button appears when scrolled up
    5. Manual check: Click button, confirm it jumps to bottom and button disappears
    6. Manual check: After jumping to bottom, confirm auto-scroll resumes for new entries
  </verify>
  <done>
    LogWindow auto-scrolls to bottom only when user is at bottom. Scrolling up pauses auto-scroll. A "New messages" button appears when scrolled up. Clicking the button or manually scrolling to bottom re-enables auto-scroll.
  </done>
</task>

</tasks>

<verification>
- LogWindow auto-scrolls on new events when user is at the bottom
- LogWindow does NOT auto-scroll when user has scrolled up to read history
- "New messages" button appears when scrolled up, hidden when at bottom
- Clicking "New messages" scrolls to bottom and re-enables auto-scroll
- Manually scrolling back to bottom re-enables auto-scroll (no button click needed)
- No TypeScript errors
</verification>

<success_criteria>
Smart auto-scroll works correctly: auto-scrolls at bottom, pauses when scrolled up, resumes when returning to bottom. Jump-to-bottom button visible when scrolled up and functional.
</success_criteria>

<output>
After completion, create `.planning/quick/19-add-smart-auto-scroll-to-logwindow-scrol/19-SUMMARY.md`
</output>
