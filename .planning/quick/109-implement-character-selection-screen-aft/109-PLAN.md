---
phase: quick-109
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/components/ActionBar.vue
  - src/composables/useCharacters.ts
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "On login, user sees a full-screen character selection screen instead of the game world"
    - "User can create new characters on the character select screen"
    - "User can select an existing character to enter the game world"
    - "Game world panels, hotbar, location, group are hidden until a character is selected"
    - "Camp button appears in action bar (replacing Characters button) when a character is active"
    - "Clicking Camp deselects the active character and returns to the character select screen"
  artifacts:
    - path: "src/App.vue"
      provides: "Character select screen state gating and Camp handler"
    - path: "src/components/ActionBar.vue"
      provides: "Camp button replacing Characters button"
    - path: "src/composables/useCharacters.ts"
      provides: "deselectCharacter function"
  key_links:
    - from: "src/components/ActionBar.vue"
      to: "src/App.vue"
      via: "camp emit -> deselectCharacter handler"
      pattern: "emit.*camp|deselectCharacter"
    - from: "src/App.vue"
      to: "src/composables/useCharacters.ts"
      via: "selectedCharacterId = '' clears active character"
      pattern: "selectedCharacterId.*=.*''"
---

<objective>
Implement a dedicated character selection screen that gates access to the game world. On login, users see a full-screen character select screen (create/choose character). Only after selecting a character do they enter the game world. A "Camp" button in the action bar replaces the old "Characters" button and returns the user to the character select screen by deselecting their active character.

Purpose: Provide a clear character selection flow instead of dumping users directly into the game world.
Output: Modified App.vue with character select gate, modified ActionBar with Camp button, updated useCharacters with deselect function.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue
@src/components/ActionBar.vue
@src/components/CharacterPanel.vue
@src/composables/useCharacters.ts
@src/composables/useCharacterCreation.ts
@src/composables/usePanelManager.ts
@src/ui/styles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add character select screen state and Camp functionality to App.vue</name>
  <files>src/App.vue, src/composables/useCharacters.ts</files>
  <action>
**In src/composables/useCharacters.ts:**
- Add a `deselectCharacter` function that sets `selectedCharacterId.value = ''`. This is the inverse of selecting a character. No server reducer call needed since the `set_active_character` reducer is already triggered by the `watch` on `selectedCharacterId` — but deselecting should NOT call `set_active_character`. To handle this: modify the existing `watch` on `selectedCharacterId` (around line 133) to skip the reducer call when `next` is empty string (already handled by the `if (!next)` guard).
- Export `deselectCharacter` from the return object.

**In src/App.vue template:**
- Add a NEW state between State 2 (loading) and State 3 (game world): a "character select screen" state. This state shows when `isLoggedIn && !isPendingLogin && !selectedCharacter`. The condition for State 3 (game world) becomes `isLoggedIn && !isPendingLogin && selectedCharacter`.

- The character select screen is a full-screen centered layout (not a floating panel) that renders CharacterPanel directly (same component, same props). It should have:
  - A simple dark background filling the main area (similar to splash screen aesthetic)
  - A centered title "Select Your Character" or similar
  - The CharacterPanel component rendered full-width (not in a floating panel wrapper)
  - The AppHeader still visible above (keep the header in the game shell div)
  - The footer with CommandBar visible but ActionBar only shows Log and Help buttons (no character-dependent buttons since no character is active — this is already handled by `hasActiveCharacter` prop gating in ActionBar.vue)

- Implementation approach:
  1. Restructure the State 3 `v-else` div to have two sub-states:
     - Sub-state A: `!selectedCharacter` — show character select screen (full-screen centered CharacterPanel)
     - Sub-state B: `selectedCharacter` — show game world (existing `<main>` content)
  2. The character select screen should still include the footer (CommandBar + ActionBar) but since `has-active-character` will be false, the ActionBar will naturally only show Log, Characters, and Help buttons.
  3. When a character is selected in CharacterPanel on the select screen, the existing `@select` handler sets `selectedCharacterId`, which triggers the game world to appear.
  4. Do NOT call `closePanelById('character')` when selecting from the character select screen (that only applies to the floating panel version).

- For the character select screen styling, add inline styles or use existing style patterns:
  - Full-height flex container centered both axes
  - Max-width of ~900px for the CharacterPanel content
  - Dark background matching the game's aesthetic (#0d1117 or similar from existing styles)
  - Title with the game's text styling

- The `@select` handler on the character select screen version of CharacterPanel should just set `selectedCharacterId = $event` (no `closePanelById` call).

**Camp button handling in App.vue script:**
- Create a `goToCamp` function:
  ```
  const goToCamp = () => {
    selectedCharacterId.value = '';
    // Close all open panels to reset UI state
    for (const id of openPanels.value) {
      closePanelById(id);
    }
  };
  ```
- Wire this to the ActionBar's new 'camp' event (see Task 2).

**Modify the existing watch at line ~1979:**
- Currently when `!activeId`, it opens the character panel. Change this: when `!activeId`, do nothing special (the character select screen will show naturally since `selectedCharacter` is null).
- Remove the `openPanel('character')` call from the `!activeId` branch.

**Remove the floating Character Panel from the game world:**
- Delete the entire `<!-- Character Panel -->` floating panel block (lines ~138-173). The CharacterPanel is now only rendered on the character select screen. The "Characters" button no longer exists in the action bar (replaced by Camp).

**Onboarding flow adjustment:**
- After character creation, the `creationToken` watch triggers onboarding. Since character creation now happens on the character select screen and the user immediately enters the game world (because `selectedCharacterId` gets set by the `pendingSelectName` watch in `useCharacterCreation`), onboarding should still work normally.
  </action>
  <verify>
- `npm run build` succeeds (or `npx vite build`)
- On login with no active character, the character select screen appears (not the game world)
- Selecting a character transitions to the game world
- The floating character panel no longer appears in the game world
  </verify>
  <done>
- Character select screen gates access to game world
- Users see character creation/selection before entering
- Game world only appears after character selection
- goToCamp function exists and clears selectedCharacterId
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace Characters button with Camp button in ActionBar</name>
  <files>src/components/ActionBar.vue</files>
  <action>
**In ActionBar.vue:**

1. Remove the "Characters" button entirely (the one that emits `('toggle', 'character')`).

2. Add a "Camp" button in its place. This button:
   - Only shows when `hasActiveCharacter` is true (same section as other character-dependent buttons, inside the `<template v-if="hasActiveCharacter">` block)
   - Emits a new event: `('camp')` — NOT a toggle event
   - Uses the same `actionStyle('camp')` pattern but since 'camp' is never in openPanels it won't show as active (which is correct — it's an action, not a panel toggle)
   - Is disabled when `combatLocked` is true (can't camp during combat, similar to how Characters was locked during combat)
   - Label text: "Camp"

3. Add 'camp' to the emit type definition:
   ```
   (e: 'camp'): void;
   ```

4. Update the `isLocked` function to handle 'camp':
   ```
   if (panel === 'camp' && props.combatLocked) return true;
   ```

5. In the `actionStyle` function, 'camp' will never be in `openPanels` so it won't show as active — this is desired behavior.

**In App.vue (wiring):**
- Add `@camp="goToCamp"` to the ActionBar component (alongside existing `@toggle` and `@open` handlers).
  </action>
  <verify>
- The ActionBar shows "Camp" button when a character is active
- "Characters" button no longer exists
- Camp button is disabled during combat
- Clicking Camp returns to character select screen
  </verify>
  <done>
- Characters button replaced by Camp button in action bar
- Camp emits camp event, App.vue handles it via goToCamp
- Camp is disabled during combat
- Clicking Camp deselects character and returns to character select
  </done>
</task>

<task type="auto">
  <name>Task 3: Style the character select screen</name>
  <files>src/ui/styles.ts</files>
  <action>
Add character select screen styles to the styles object in styles.ts. These are inline style objects following the existing pattern in the file.

Add the following style entries:

1. `charSelectScreen` — the full-screen container:
   - display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start'
   - flex: 1, width: '100%', padding: '2rem 1rem'
   - background: same as the game shell background (match `styles.shell` or `styles.main` background)
   - overflow: 'auto'

2. `charSelectTitle` — the title "Select Your Character":
   - fontSize: '1.4rem', fontWeight: 700, color: '#e6e8ef'
   - letterSpacing: '0.08em', textTransform: 'uppercase' as const
   - marginBottom: '1.5rem', textAlign: 'center' as const

3. `charSelectContent` — wrapper for the CharacterPanel:
   - width: '100%', maxWidth: '900px'
   - background: 'rgba(20, 24, 33, 0.8)' (subtle card background)
   - borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)'
   - padding: '1.5rem'

These styles should match the existing dark theme aesthetic of the game (look at `styles.shell`, `styles.floatingPanel`, `styles.panelSectionTitle` for color/font reference).
  </action>
  <verify>
- styles.ts contains charSelectScreen, charSelectTitle, charSelectContent entries
- No TypeScript errors
  </verify>
  <done>
- Character select screen has proper dark-themed styling consistent with game aesthetic
- Screen is centered with max-width constraint for the CharacterPanel content
  </done>
</task>

</tasks>

<verification>
1. Build succeeds: `npx vite build` completes without errors
2. Login flow: On login, character select screen appears (not game world)
3. Character creation: Can create a character from the select screen
4. Character selection: Clicking a character enters the game world with all panels
5. Camp button: Visible in action bar when character is active
6. Camp action: Clicking Camp returns to character select screen
7. Combat lock: Camp button disabled during combat
8. No Characters button: The old "Characters" button is gone from action bar
</verification>

<success_criteria>
- On login, users see a dedicated character selection screen
- Character creation and selection work from this screen
- Game world is only visible after selecting a character
- Camp button in action bar deselects character and returns to select screen
- Camp is blocked during combat
- No regression in existing character switching, onboarding, or panel functionality
</success_criteria>

<output>
After completion, create `.planning/quick/109-implement-character-selection-screen-aft/109-SUMMARY.md`
</output>
