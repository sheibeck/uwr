---
phase: quick-113
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SplashScreen.vue
autonomous: true
must_haves:
  truths:
    - "Pressing Enter on the splash screen triggers login (same as clicking Login button)"
    - "Enter key does NOT trigger login when connection is inactive (connActive=false)"
  artifacts:
    - path: "src/components/SplashScreen.vue"
      provides: "Enter key login handler"
      contains: "keydown"
  key_links:
    - from: "SplashScreen.vue keydown listener"
      to: "login emit"
      via: "onMounted window.addEventListener('keydown', ...)"
      pattern: "emit.*login"
---

<objective>
Wire up Enter key to trigger login on the splash screen.

Purpose: Allow users to press Enter to log in instead of requiring a mouse click on the Login button, improving keyboard accessibility and UX flow.
Output: Updated SplashScreen.vue with Enter key listener.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/SplashScreen.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Enter key listener to SplashScreen.vue</name>
  <files>src/components/SplashScreen.vue</files>
  <action>
Add a window-level keydown event listener in SplashScreen.vue that emits 'login' when Enter is pressed and connActive is true.

Implementation:
1. Import `onMounted` and `onUnmounted` from 'vue'.
2. Access props via the existing `defineProps` return value (assign to `const props = defineProps<...>()`).
3. Access the emit function via the existing `defineEmits` return value (assign to `const emit = defineEmits<...>()`).
4. In `onMounted`, add a `window.addEventListener('keydown', handler)` that checks:
   - `e.key === 'Enter'`
   - `props.connActive === true`
   If both true, call `emit('login')`.
5. In `onUnmounted`, remove the event listener with `window.removeEventListener('keydown', handler)`.

This approach uses a window-level listener rather than `@keydown.enter` on the root div because the splash screen div is not focusable by default and the user may not have clicked into it. A window listener catches Enter regardless of focus state.
  </action>
  <verify>
Open the app in an unauthenticated state (or check the SplashScreen.vue source). Confirm:
- The keydown event listener is registered on mount and cleaned up on unmount.
- The handler checks both `e.key === 'Enter'` and `props.connActive` before emitting.
- No TypeScript errors: `npx vue-tsc --noEmit` passes (or at minimum the file has no syntax errors).
  </verify>
  <done>
Pressing Enter on the splash screen triggers the login action (same as clicking the Login button). Enter does nothing when connActive is false. Listener is properly cleaned up on component unmount.
  </done>
</task>

</tasks>

<verification>
- SplashScreen.vue contains a keydown event listener for Enter key
- The listener respects the connActive guard (same as button's :disabled)
- The listener is cleaned up on unmount (no memory leaks)
- The login emit path is identical to the button click path
</verification>

<success_criteria>
Enter key press on splash screen triggers login when connection is active. No regressions to existing button-click login flow.
</success_criteria>

<output>
After completion, create `.planning/quick/113-wire-up-enter-key-to-trigger-login-on-sp/113-SUMMARY.md`
</output>
