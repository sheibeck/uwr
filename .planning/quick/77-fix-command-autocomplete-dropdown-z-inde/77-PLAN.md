---
phase: quick-77
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Command autocomplete dropdown renders above all floating panels"
    - "Context menus and tooltips still render above the autocomplete dropdown"
  artifacts:
    - path: "src/ui/styles.ts"
      provides: "commandSuggestions z-index fix"
      contains: "zIndex: 100"
  key_links:
    - from: "src/ui/styles.ts (commandSuggestions)"
      to: "src/composables/usePanelManager.ts (topZ)"
      via: "z-index stacking order"
      pattern: "zIndex"
---

<objective>
Fix command autocomplete dropdown z-index so it always renders above floating panels.

Purpose: The commandSuggestions dropdown currently has zIndex: 20, but floating panels managed by usePanelManager start at zIndex: 10 and increment unboundedly with each bringToFront call. After a few panel interactions, panels easily exceed z-index 20 and cover the autocomplete dropdown. Setting commandSuggestions to zIndex: 100 places it safely above any reasonable panel z-index while staying below tooltips (1000) and context menus (9999).

Output: Updated styles.ts with corrected z-index value.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/ui/styles.ts
@src/components/CommandBar.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Increase commandSuggestions z-index above floating panels</name>
  <files>src/ui/styles.ts</files>
  <action>
In src/ui/styles.ts, change the `commandSuggestions` style object's `zIndex` from `20` to `100`.

Current z-index hierarchy for reference:
- contextMenu: 9999
- tooltip: 1000
- deathOverlay: 70
- commandSuggestions: 20 (BUG - too low, panels grow past this)
- floatingPanel base: 6, but topZ starts at 10 and increments with each click/drag

New value of 100 sits above floating panels (which would need 90+ interactions to reach 100) while remaining well below tooltips (1000) and context menus (9999).

Only change the single zIndex value on line 1173 of styles.ts. Do not modify any other styles.
  </action>
  <verify>
Open the app, type `/` in the command bar, and verify the autocomplete dropdown appears above all floating panels. Confirm context menus (right-click on items) still render above the dropdown.

Alternatively, grep for the change: `grep -n "zIndex.*100" src/ui/styles.ts` should show the commandSuggestions entry.
  </verify>
  <done>commandSuggestions zIndex is 100; dropdown renders above all floating panels; tooltips and context menus still render above it</done>
</task>

</tasks>

<verification>
- commandSuggestions.zIndex is 100 in styles.ts
- No other z-index values were changed
- Z-index hierarchy preserved: contextMenu (9999) > tooltip (1000) > commandSuggestions (100) > deathOverlay (70) > floating panels (10+)
</verification>

<success_criteria>
The command autocomplete dropdown always appears above floating panels when typing `/` commands.
</success_criteria>

<output>
After completion, create `.planning/quick/77-fix-command-autocomplete-dropdown-z-inde/77-SUMMARY.md`
</output>
