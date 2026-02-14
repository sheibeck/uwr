---
phase: quick-79
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Command autocomplete dropdown renders above ALL floating panels regardless of how many times bringToFront has been called"
  artifacts:
    - path: "src/ui/styles.ts"
      provides: "Fixed stacking context for command suggestions"
      contains: "zIndex"
  key_links:
    - from: "src/ui/styles.ts (footer)"
      to: "src/ui/styles.ts (commandSuggestions)"
      via: "CSS stacking context"
      pattern: "position.*relative.*zIndex"
---

<objective>
Fix command autocomplete dropdown still appearing behind floating windows despite quick-77's z-index increase to 100.

Purpose: The dropdown is unusable when it renders behind panels.

Output: Command suggestions always render above all floating panels.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/ui/styles.ts
@src/components/CommandBar.vue
@src/composables/usePanelManager.ts
</context>

<root_cause>
The previous fix (quick-77) raised `commandSuggestions.zIndex` from 20 to 100, but this does NOT solve the problem because of how CSS stacking contexts work:

1. **Floating panels** live inside `<main>` (which has `position: 'relative'`). Each panel gets a z-index from `usePanelManager` that starts at 10 and increments with every `bringToFront()` call — there is NO upper bound. After clicking ~90 panels, z-indexes exceed 100.

2. **The footer** element (containing CommandBar) is a sibling of `<main>`. The footer has NO `position` or `z-index` set, so it does not establish a stacking context.

3. **The commandSuggestions div** has `position: 'absolute'` and `zIndex: 100` relative to `commandWrapper` (which has `position: 'relative'`). But because the footer lacks its own stacking context, the dropdown's z-index competes directly with the panel z-indexes — and loses when panels exceed 100.

**Fix:** Establish a proper stacking context on the `footer` style by adding `position: 'relative'` and a z-index higher than any panel will ever reach. Since panels start at 10 and increment by 1 per click, `z-index: 10000` on the footer will guarantee the entire footer (and its children) stacks above all floating panels. The `commandSuggestions` z-index of 100 then ensures the dropdown renders above other footer children.
</root_cause>

<tasks>

<task type="auto">
  <name>Task 1: Add stacking context to footer style</name>
  <files>src/ui/styles.ts</files>
  <action>
In `src/ui/styles.ts`, modify the `footer` style object (around line 1134) to add `position: 'relative'` and `zIndex: 10000`. This establishes a stacking context for the entire footer that sits above all floating panels (whose z-indexes start at 10 and increment by 1 per bringToFront call).

Before:
```typescript
footer: {
    padding: '1rem 2rem 1.5rem',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(8,10,15,0.9)',
},
```

After:
```typescript
footer: {
    padding: '1rem 2rem 1.5rem',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(8,10,15,0.9)',
    position: 'relative',
    zIndex: 10000,
},
```

Do NOT change the `commandSuggestions.zIndex` value (keep it at 100) — it is already sufficient within the footer's stacking context to render above other footer children.
  </action>
  <verify>
Run `npm run build` (or the project's build command) from the project root to confirm no build errors. Visually: open multiple floating panels, click each several times to increment their z-indexes, then type `/` in the command bar — the autocomplete dropdown must appear above all panels.
  </verify>
  <done>
The command autocomplete dropdown always renders above floating panels regardless of how many times panels have been brought to front. The fix is structural (stacking context) not just a z-index number race.
  </done>
</task>

</tasks>

<verification>
1. Build succeeds with no errors
2. Type `/` in command bar with multiple floating panels open and overlapping the footer area — dropdown must be fully visible above all panels
3. Click panels 10+ times to raise their z-indexes, then re-test — dropdown still on top
4. Death overlay (z-index: 70) and other fixed overlays (z-index: 9999) are unaffected since footer z-index 10000 only applies within the normal flow stacking, and those overlays use `position: fixed`
</verification>

<success_criteria>
Command autocomplete dropdown renders above all floating panels in all scenarios. No visual regressions to panel stacking, overlays, or tooltips.
</success_criteria>

<output>
After completion, create `.planning/quick/79-fix-command-autocomplete-dropdown-still-/79-SUMMARY.md`
</output>
