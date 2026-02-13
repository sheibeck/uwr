---
phase: quick-54
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CharacterPanel.vue
  - src/ui/styles.ts
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Character panel displays as two columns side by side"
    - "Left column contains the Create Character form (name, race tiles, class tiles, create button)"
    - "Right column contains the Characters list (character cards with select/delete)"
    - "Panel is wide enough to accommodate two columns comfortably"
  artifacts:
    - path: "src/components/CharacterPanel.vue"
      provides: "Two-column layout with creator left, character list right"
    - path: "src/ui/styles.ts"
      provides: "New style entries for 2-column character panel layout"
    - path: "src/App.vue"
      provides: "Wider panel wrapper for character panel"
  key_links:
    - from: "src/components/CharacterPanel.vue"
      to: "src/ui/styles.ts"
      via: "styles prop"
      pattern: "styles\\.charPanel"
---

<objective>
Refactor the Characters panel from a single-column vertical layout (creator on top, character list below) into a 2-column side-by-side layout with the character creator on the left and the character list on the right.

Purpose: Improve usability by showing both the creator and existing characters at the same time without scrolling.
Output: Updated CharacterPanel.vue with 2-column layout, new styles, wider panel container.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/CharacterPanel.vue
@src/ui/styles.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 2-column layout styles and widen character panel</name>
  <files>src/ui/styles.ts, src/App.vue</files>
  <action>
In `src/ui/styles.ts`:

1. Add a new `charPanelColumns` style object for the 2-column container:
   ```
   charPanelColumns: {
     display: 'grid',
     gridTemplateColumns: '1fr 1fr',
     gap: '1rem',
     height: '100%',
   }
   ```

2. Add `charPanelColumn` style for each column:
   ```
   charPanelColumn: {
     display: 'flex',
     flexDirection: 'column',
     gap: '0.45rem',
     minHeight: 0,
     overflow: 'auto',
   }
   ```

In `src/App.vue`:

3. On the character panel's outer `div` (around line 140-145), add `...styles.floatingPanelWide` to the style binding so the character panel uses the wide variant (720px instead of 320px). Change:
   ```
   :style="{
     ...styles.floatingPanel,
     ...(panelStyle('character').value || {}),
   }"
   ```
   to:
   ```
   :style="{
     ...styles.floatingPanel,
     ...styles.floatingPanelWide,
     ...(panelStyle('character').value || {}),
   }"
   ```
   This ensures the panel is wide enough for two columns. The floatingPanelWide style already exists at `min(720px, 92vw)`.
  </action>
  <verify>Run `npx vue-tsc --noEmit` or check that the app compiles without errors. Visually confirm the character panel is now wider.</verify>
  <done>New charPanelColumns and charPanelColumn styles exist in styles.ts. Character panel in App.vue uses floatingPanelWide for width.</done>
</task>

<task type="auto">
  <name>Task 2: Restructure CharacterPanel.vue into 2-column layout</name>
  <files>src/components/CharacterPanel.vue</files>
  <action>
Restructure the template in CharacterPanel.vue to use a 2-column grid layout:

1. Replace the single outer `<div>` with a `<div :style="styles.charPanelColumns">` that contains two column divs.

2. **Left column** (`<div :style="styles.charPanelColumn">`): Contains everything currently under "Create Character":
   - The "Create Character" section title
   - The form with name input, race tiles, race info panel, class tiles, class info panel, and Create button
   - Keep all existing event handlers, bindings, and logic unchanged

3. **Right column** (`<div :style="styles.charPanelColumn">`): Contains everything currently under "Characters":
   - The "Characters" section title
   - The "No characters yet" message (when empty)
   - The character cards list with select/delete functionality
   - Keep all existing event handlers, bindings, and logic unchanged

No changes to the `<script setup>` section -- all props, emits, computed properties, and functions remain exactly the same. This is purely a template restructuring: move the existing two sections into side-by-side column wrappers.
  </action>
  <verify>Run the app with `npm run dev` in the client directory. Open the Characters panel and confirm: left column shows the character creator form, right column shows the character list. Both columns scroll independently if content overflows. Selecting a character, creating a character, and deleting a character all still work.</verify>
  <done>CharacterPanel displays as a 2-column layout: creator form on the left, character list on the right. All existing functionality (create, select, delete, race/class selection) works unchanged.</done>
</task>

</tasks>

<verification>
- Character panel opens as a wide panel (~720px)
- Left column: name input, race tile grid, race info, class tile grid, class info, Create button
- Right column: "Characters" header, character cards with select and delete
- Clicking a character card still selects and closes panel
- Creating a character still works (form validates, reducer fires, character appears in list)
- Deleting a character still shows confirmation dialog and removes from list
- Both columns scroll independently when content overflows
</verification>

<success_criteria>
Character panel renders as a 2-column side-by-side layout with creator on left and character list on right, all existing functionality preserved.
</success_criteria>

<output>
After completion, create `.planning/quick/54-make-characters-panel-2-columns-creator-/54-SUMMARY.md`
</output>
