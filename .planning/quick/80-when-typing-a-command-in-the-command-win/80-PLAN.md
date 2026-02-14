---
phase: quick-80
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CommandBar.vue
autonomous: true
must_haves:
  truths:
    - "Typing a partial slash command and pressing Enter with a highlighted autocomplete item selects that command instead of submitting incomplete text"
    - "After selecting a command via Enter, the input shows the full command with a trailing space ready for arguments"
    - "Commands that take no arguments (like /look, /leave) execute immediately when Enter is pressed with them highlighted and the user has only typed a partial match"
  artifacts:
    - path: "src/components/CommandBar.vue"
      provides: "Fixed Enter key behavior in command autocomplete"
  key_links:
    - from: "CommandBar.vue onKeydown Enter handler"
      to: "selectCommand / form submit"
      via: "preventDefault + selectCommand for partial matches, allow submit for exact matches"
---

<objective>
Fix the command autocomplete Enter key behavior so that pressing Enter while a suggestion is highlighted selects/executes that command instead of logging the incomplete partial text as a chat message.

Purpose: Currently typing `/lo` with `/look` highlighted and pressing Enter submits `/lo` as a raw chat message instead of selecting `/look`. This breaks the fundamental autocomplete UX.
Output: Fixed CommandBar.vue with correct Enter key handling
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/CommandBar.vue
@src/composables/useCommands.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Enter key handler in CommandBar autocomplete</name>
  <files>src/components/CommandBar.vue</files>
  <action>
Rewrite the `onKeydown` Enter key handling block (lines 131-146) in CommandBar.vue to implement correct autocomplete behavior:

**Current broken logic (lines 131-146):**
When Enter is pressed with a highlighted item:
- If the typed text is a partial match (e.g., `/lo` with `/look` highlighted), it hits `return;` at line 135 without calling `event.preventDefault()`, so the form submits the incomplete text as a chat message.

**New logic for the Enter key block:**

1. `event.preventDefault()` — always prevent form submission when we have a highlighted autocomplete item and the suggestions dropdown is visible.

2. Check if the typed text (`trimmed`) already equals the highlighted command exactly AND the command takes no arguments (i.e., commands like `/look`, `/leave`, `/endcombat`, `/synccontent` — these are commands where `trimmed === highlighted.value` means the user has typed the full command):
   - If exact match: clear highlighted, emit the form submit (call `emit('submit')`), and return. This lets the user type `/look` fully, see it highlighted, and press Enter to execute.

3. Check if the typed text has arguments beyond the command (e.g., `/say hello`):
   - If it has args after the command portion: clear highlighted, emit the form submit. The user typed a full command with arguments, let it execute.

4. Otherwise (partial match like `/lo` with `/look` highlighted, or just `/` with something highlighted):
   - Call `selectCommand(highlighted.value)` to fill the command into the input with a trailing space.
   - This replaces the text and lets the user add arguments if needed.

**Simplified implementation:**
```typescript
if (event.key === 'Enter' && highlighted.value) {
  event.preventDefault();
  const trimmed = props.commandText.trim();
  const hasArgs = trimmed.includes(' ') && trimmed.length > highlighted.value.length;

  if (trimmed === highlighted.value || hasArgs) {
    // Full command typed (with or without args) — execute it
    highlighted.value = null;
    emit('submit');
  } else {
    // Partial match — fill in the highlighted command
    selectCommand(highlighted.value);
  }
  return;
}
```

This covers all cases:
- `/lo` + Enter with `/look` highlighted -> fills in `/look ` (partial match)
- `/` + Enter with `/look` highlighted -> fills in `/look ` (partial match)
- `/look` + Enter with `/look` highlighted -> executes `/look` (exact match)
- `/say hello` + Enter with `/say` highlighted -> executes `/say hello` (has args)

Do NOT change any other part of the file. The ArrowUp/ArrowDown and Escape handlers remain unchanged. The `selectCommand`, `onBlur`, `onCommandInput`, and template remain unchanged.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit 2>&1 | head -20` to check for TypeScript errors in the changed file (pre-existing errors in other files are expected and can be ignored).
2. Grep the file for `event.preventDefault` within the Enter key block to confirm it exists.
3. Grep the file for `selectCommand(highlighted.value)` to confirm partial-match path calls selectCommand.
4. Grep the file for `emit('submit')` within the Enter key block to confirm exact-match path triggers form submission.
  </verify>
  <done>
- Typing `/lo` with `/look` highlighted and pressing Enter fills the input with `/look ` (trailing space) instead of submitting `/lo` as chat
- Typing `/look` exactly with `/look` highlighted and pressing Enter executes the /look command
- Typing `/say hello` with `/say` highlighted and pressing Enter executes the /say command with the message
- Typing `/` with any item highlighted and pressing Enter fills in that command
  </done>
</task>

</tasks>

<verification>
- Open the app, type `/lo` in the command bar
- Arrow-key to highlight `/look` in the dropdown
- Press Enter — input should show `/look ` with cursor at end, NOT send a chat message
- Type `/look` fully, see it highlighted, press Enter — command should execute (describe location)
- Type `/say hello world`, see `/say` highlighted, press Enter — should send the say message
</verification>

<success_criteria>
Enter key with highlighted autocomplete item always does the right thing: partial matches fill in the command, exact/complete matches execute it. No incomplete text is ever submitted as a chat message.
</success_criteria>

<output>
After completion, create `.planning/quick/80-when-typing-a-command-in-the-command-win/80-SUMMARY.md`
</output>
