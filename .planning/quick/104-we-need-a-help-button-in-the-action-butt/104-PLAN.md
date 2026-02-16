---
phase: quick-104
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/HelpOverlay.vue
  - src/components/ActionBar.vue
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Help button is visible in the action bar at all times (no active character required)"
    - "Clicking Help opens a full-screen overlay explaining game basics"
    - "Overlay can be dismissed by clicking a Close/Dismiss button or pressing Escape"
    - "Overlay explains right-click context menus, travel stamina costs, bind stone icon, crafting station icon, and basic game concepts"
  artifacts:
    - path: "src/components/HelpOverlay.vue"
      provides: "Dismissible help overlay component"
    - path: "src/components/ActionBar.vue"
      provides: "Help button in action bar"
    - path: "src/App.vue"
      provides: "Help overlay integration and state management"
  key_links:
    - from: "src/components/ActionBar.vue"
      to: "src/App.vue"
      via: "emit('toggle', 'help') event"
    - from: "src/App.vue"
      to: "src/components/HelpOverlay.vue"
      via: "v-if showHelp conditional rendering"
---

<objective>
Add a Help button to the action bar that opens a full-screen overlay explaining game basics, UI conventions, and icon meanings.

Purpose: New players (and returning players) need a quick reference for game mechanics like right-click context menus, travel stamina costs, what the bind stone and crafting station icons mean, and general gameplay concepts.

Output: HelpOverlay.vue component, updated ActionBar.vue with Help button, updated App.vue with overlay state.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/ActionBar.vue
@src/App.vue
@src/ui/styles.ts
@src/components/TravelPanel.vue (overlay pattern reference)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create HelpOverlay component and wire into ActionBar + App</name>
  <files>src/components/HelpOverlay.vue, src/components/ActionBar.vue, src/App.vue</files>
  <action>
Create `src/components/HelpOverlay.vue` as a full-screen overlay component (similar to the death overlay and cross-region confirmation dialog patterns in the codebase). The overlay should:

1. Use `position: fixed; inset: 0; z-index: 9000` backdrop with `rgba(0,0,0,0.7)` background, flexbox centering.
2. Inner dialog: use `#141821` background, `1px solid rgba(255,255,255,0.15)` border, `borderRadius: 14px`, padding `2rem`, maxWidth `600px`, width `90vw`, maxHeight `80vh`, overflowY `auto`. Match the existing dark RPG aesthetic (PT Serif font, muted gold accents).
3. Title at top: "GUIDE TO THE REALMS" styled uppercase, letter-spacing, gold accent color (`rgba(248, 201, 74, 0.9)`), centered.
4. Content organized into sections with section headers styled like `gridSectionLabel` (uppercase, letter-spacing 0.1em, 0.75rem, muted color). Sections:

   **GETTING STARTED**
   - Explain: Create a character by choosing a race and class. Select your character to enter the world.

   **INTERACTING WITH THE WORLD**
   - Right-click on enemies, resources, NPCs, players, and corpses to open a context menu with available actions.
   - Left-click to select/target entities.

   **TRAVEL**
   - Moving between locations costs stamina (shown as "X sta" on travel buttons).
   - Cross-region travel costs more stamina and triggers a 5-minute cooldown.
   - Destinations are color-coded by difficulty relative to your level.

   **LOCATION ICONS**
   - Show a small inline replica of the bind stone icon (the CSS radial-gradient blue circle from `styles.bindStoneIcon`) next to text: "Bind Stone - Click to set your respawn point. You return here on death."
   - Show a small inline replica of the crafting icon (the CSS rotated gold diamond from `styles.craftingIcon`) next to text: "Crafting Station - This location has crafting facilities. Open the Crafting panel to craft items."

   **COMBAT**
   - Engage enemies by right-clicking and selecting "Pull" or "Attack".
   - Use your hotbar abilities during combat. Abilities have cooldowns and cast times.
   - Group with other players for tougher fights.

   **USEFUL TIPS**
   - All panels can be moved by dragging their header and resized from edges/corners.
   - Type commands in the command bar at the bottom (start with / for slash commands).
   - Open the Log panel to see combat events, chat, and system messages.

5. Close button at the bottom center: styled like `ghostButton` but slightly larger, text "Close Guide". Also close on Escape key press.

6. Props: `styles` (Record<string, Record<string, string | number>>).
7. Emits: `close`.
8. Use `onMounted`/`onUnmounted` to add/remove a keydown listener for Escape.

**ActionBar.vue changes:**
- Add a Help button OUTSIDE the `v-if="hasActiveCharacter"` template block, so it is always visible (like the Log and Characters buttons). Place it after the Characters button and before the `<template v-if="hasActiveCharacter">` block.
- The button should emit `('toggle', 'help')` and use `actionStyle('help')`.
- Add `'help'` to the PanelKey type union.

**App.vue changes:**
- Add a `showHelp` ref (boolean, default false).
- Import HelpOverlay component.
- Add `<HelpOverlay v-if="showHelp" :styles="styles" @close="showHelp = false" />` near the death overlay area (after main, before footer).
- In the `@toggle` handler for ActionBar, intercept 'help' to toggle `showHelp` instead of going through the panel manager. Add a simple check: if the panel name is 'help', toggle showHelp and return early. This keeps help as a simple overlay, not a draggable panel.
- Alternatively, handle this by watching for the toggle event: in the ActionBar @toggle handler function, check `if (panel === 'help') { showHelp.value = !showHelp.value; return; }` before calling the normal `togglePanel(panel)`.

Do NOT use the panel manager system for this overlay. It is a simple boolean toggle, not a positioned/resizable panel.
  </action>
  <verify>
    Run `npx vue-tsc --noEmit` from the project root to verify no TypeScript errors. Visually confirm in browser that Help button appears in action bar and clicking it opens the overlay with all sections. Pressing Escape or clicking Close Guide dismisses it.
  </verify>
  <done>
    Help button visible in action bar (always, not gated by active character). Clicking opens a full-screen help overlay with sections covering: getting started, right-click context menus, travel costs, bind stone icon explanation, crafting station icon explanation, combat basics, and UI tips. Overlay dismissed by Close button or Escape key.
  </done>
</task>

</tasks>

<verification>
- Help button appears in action bar even without an active character selected
- Clicking Help opens full-screen overlay with dark RPG-themed styling
- All documented sections are present and readable
- Bind stone and crafting station icons are visually replicated inline with explanations
- Overlay closes on button click and Escape key press
- No TypeScript compilation errors
- Overlay z-index (9000) renders above floating panels but below tooltips/context menus
</verification>

<success_criteria>
- New `HelpOverlay.vue` component exists with all help content sections
- ActionBar has Help button that is always visible
- App.vue integrates overlay with boolean toggle (not panel manager)
- Overlay is dismissible via Close button and Escape key
- Styling matches existing dark RPG aesthetic
</success_criteria>

<output>
After completion, create `.planning/quick/104-we-need-a-help-button-in-the-action-butt/104-SUMMARY.md`
</output>
