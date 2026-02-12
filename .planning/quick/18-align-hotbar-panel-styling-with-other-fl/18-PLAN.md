---
phase: 18-align-hotbar-panel-styling
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/HotbarPanel.vue
autonomous: true
must_haves:
  truths:
    - "Hotbar configuration panel has no redundant title duplicating the floating panel header"
    - "Hotbar panel body uses consistent spacing/layout matching other panels (panelBody style)"
    - "Hotbar slot assignment rows use a polished card layout consistent with other panel content"
  artifacts:
    - path: "src/components/HotbarPanel.vue"
      provides: "Refactored hotbar configuration panel with consistent floating panel styling"
  key_links:
    - from: "src/components/HotbarPanel.vue"
      to: "src/App.vue"
      via: "Component rendered inside floatingPanel wrapper"
      pattern: "HotbarPanel"
---

<objective>
Refactor HotbarPanel.vue internal styling to match the visual pattern used by other floating panels (RenownPanel, StatsPanel, CharacterActionsPanel, etc.), eliminating the inconsistent look.

Purpose: The Hotbar configuration panel currently has a redundant section title, missing panelBody wrapper, and plain form-inline layout that looks different from every other floating panel. This creates a jarring UX when switching between panels.

Output: A visually consistent HotbarPanel.vue that feels like a natural sibling of the other floating panels.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/HotbarPanel.vue
@src/components/PanelShell.vue
@src/components/RenownPanel.vue
@src/components/CharacterActionsPanel.vue
@src/ui/styles.ts
@src/App.vue (lines 163-168 — floating panel wrapper for HotbarPanel)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor HotbarPanel internal styling for panel consistency</name>
  <files>src/components/HotbarPanel.vue</files>
  <action>
Refactor HotbarPanel.vue to align with other floating panels. The App.vue wrapper (lines 163-168) already provides the standard floatingPanel + floatingPanelHeader ("Hotbar") + floatingPanelBody + resize handles, so the component content must NOT duplicate the header.

Specific changes:

1. REMOVE the redundant `<div :style="styles.panelSectionTitle">Hotbar</div>` at line 3. The floating panel header in App.vue already displays "Hotbar".

2. WRAP the root content div in `styles.panelBody` for consistent flex column gap layout (matching RenownPanel pattern: `<div :style="styles.panelBody">`).

3. REPLACE the current raw `styles.list` + `styles.panelFormInline` slot layout with a cleaner card-style layout. For each hotbar slot row, use a structure like:
   - Outer div with inline style: `{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }`
   - Slot number badge: `<span>` with inline style `{ fontWeight: 600, fontSize: '0.75rem', color: 'rgba(230,232,239,0.5)', minWidth: '1.5rem', textAlign: 'center' }` displaying the slot number
   - The `<select>` dropdown keeps `styles.input` but add `flex: 1` via inline style so it fills available width

4. Keep the "Select a character to manage hotbar" message using `styles.subtle`.

5. Keep the combat-locked message using `styles.subtle`.

6. Add a description below the "no character" guard: wrap the description text "Assign abilities to slots 1-10 for quick combat access." in `styles.subtleSmall` instead of `styles.subtle` to de-emphasize it relative to the slot list (matching how RenownPanel uses subtleSmall for secondary info).

7. Keep the existing `<select>` dropdown approach (not switching to buttons). This is the configuration panel, not the combat dock. Select dropdowns are the correct UX for assignment.

Do NOT modify: the script section, props, emits, or onHotbarChange logic. Only the template structure and style bindings change.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` from the project root to verify no type errors. Visually inspect that the HotbarPanel.vue template no longer has a panelSectionTitle "Hotbar" div, has a panelBody wrapper, and uses the card-style slot rows.
  </verify>
  <done>
HotbarPanel renders without a redundant "Hotbar" title, uses panelBody for consistent spacing, and each slot row has a subtle card background with proper alignment — matching the visual weight and spacing of other floating panel contents.
  </done>
</task>

</tasks>

<verification>
- Open the Hotbar configuration panel in the game UI
- Confirm no duplicate "Hotbar" title appears (only the floating panel header shows it)
- Confirm slot rows have subtle card backgrounds with consistent spacing
- Confirm the panel feels visually consistent with Renown, Stats, and other floating panels
- Confirm hotbar assignment still works (selecting abilities from dropdowns)
</verification>

<success_criteria>
- HotbarPanel.vue has no panelSectionTitle "Hotbar" redundancy
- Root content uses styles.panelBody wrapper
- Slot rows use card-style layout with subtle background/border
- Description text uses subtleSmall
- All existing functionality preserved (select dropdowns, combat lock, emits)
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/18-align-hotbar-panel-styling-with-other-fl/18-SUMMARY.md`
</output>
