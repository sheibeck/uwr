---
phase: quick-48
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CharacterPanel.vue
  - src/ui/styles.ts
autonomous: true
must_haves:
  truths:
    - "Existing characters are displayed as visual card tiles instead of radio buttons"
    - "Clicking a character card selects that character and closes the panel"
    - "Selected character is visually highlighted with a distinct border/glow"
    - "Each character card shows name, level, race, and class at a glance"
    - "Create Character form uses a cleaner card-based layout with race/class shown as selectable card tiles instead of dropdowns"
    - "Delete button is accessible but not prominent (context or small icon, not a big red button next to each name)"
  artifacts:
    - path: "src/components/CharacterPanel.vue"
      provides: "Overhauled character creation and selection UI"
    - path: "src/ui/styles.ts"
      provides: "New style definitions for character cards and creation form"
  key_links:
    - from: "src/components/CharacterPanel.vue"
      to: "src/App.vue"
      via: "Same props/emits interface preserved"
      pattern: "emit.*select|emit.*create|emit.*delete"
---

<objective>
Overhaul the Character Panel UI to replace the unintuitive radio-button character list and plain dropdown form with a polished card-based interface.

Purpose: The current character selection uses plain radio buttons which feel out of place in the game's dark fantasy UI. The creation form uses basic HTML dropdowns that don't showcase race/class information well. This overhaul brings the panel in line with the game's visual quality.

Output: Redesigned CharacterPanel.vue with card-based character selection and improved creation form, plus supporting styles.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/CharacterPanel.vue
@src/ui/styles.ts
@src/App.vue (lines 139-174 for CharacterPanel usage and props)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redesign CharacterPanel with card-based UI</name>
  <files>src/components/CharacterPanel.vue, src/ui/styles.ts</files>
  <action>
Overhaul CharacterPanel.vue while preserving the EXACT same props and emits interface (no changes to App.vue needed).

**Character Selection (bottom section "Your Characters"):**
- Replace radio button list with clickable character CARDS arranged vertically
- Each card shows: character name (prominent), "Lv X" badge, race and class on a second line
- The currently selected character card has a gold highlight border (rgba(255, 210, 90, 0.7)) and subtle glow, similar to how rosterTagActive works
- Non-selected cards use the standard card style (similar to memberCard but with slightly more padding)
- Clicking anywhere on the card emits 'select' with the character id (same as before)
- Delete: small "x" icon button in the top-right corner of each card, styled subtly (transparent bg, rgba danger color on hover). Still triggers confirmDelete with window.confirm.
- If no characters exist, show the existing "No characters yet." subtle text

**Character Creation (top section "Create Character"):**
- Keep the name input field as-is (it works fine)
- Replace the Race `<select>` dropdown with a set of clickable race TILES arranged in a flex-wrap row. Each tile shows the race name. Selected race tile gets gold highlight (same style as character card selection). Clicking a tile sets the raceId. Keep the race description/bonus info panel that appears below when a race is selected.
- Replace the Class `<select>` dropdown with clickable class TILES in a flex-wrap row (filtered by race as before). Each tile shows class name. Selected class tile gets gold highlight. Keep the class info panel that appears below when a class is selected.
- The "Create" button stays as a primaryButton at the bottom

**Style additions in styles.ts:**
Add these new style objects:
- `charCard`: card container for each character in the list. Use memberCard-like styling: border 1px solid rgba(255,255,255,0.12), borderRadius 10px, padding 0.65rem 0.8rem, background rgba(8,10,15,0.6), cursor pointer, display flex, justifyContent space-between, alignItems center, gap 0.5rem, position relative
- `charCardSelected`: gold border override: border 1px solid rgba(255, 210, 90, 0.7), boxShadow 0 0 12px rgba(255, 210, 90, 0.15), background rgba(40, 35, 15, 0.4)
- `charCardInfo`: display flex, flexDirection column, gap 0.15rem
- `charCardName`: fontSize 0.95rem, fontWeight 600, color #f1f2f6
- `charCardMeta`: fontSize 0.78rem, color rgba(230,232,239,0.6)
- `charCardLevel`: display inline-flex, padding 0.1rem 0.4rem, borderRadius 999px, border 1px solid rgba(255,255,255,0.15), fontSize 0.7rem, color rgba(230,232,239,0.75), letterSpacing 0.05em
- `charCardDelete`: position absolute, top 6px, right 6px, background transparent, border none, color rgba(255,110,110,0.5), cursor pointer, fontSize 0.85rem, padding 0.15rem 0.3rem, borderRadius 4px (hover effect handled inline or via CSS)
- `raceTile` and `classTile`: reuse the existing gridTile style pattern — background rgba(76, 125, 240, 0.1), border 1px solid rgba(76, 125, 240, 0.25), padding 0.35rem 0.6rem, borderRadius 8px, fontSize 0.8rem, cursor pointer, userSelect none
- `raceTileSelected` / `classTileSelected`: same as gridTileSelected — background rgba(255, 210, 90, 0.15), border 1px solid rgba(255, 210, 90, 0.6), color #f7d97f

**Important:** Do NOT change the component's props or emits interface. The component still receives the same data and emits the same events. All logic (onRaceChange class-clearing, displayedClassOptions filtering, CLASS_OPTIONS array, etc.) stays the same — only the template rendering changes.

For race tiles: iterate over `unlockedRaces` and render a tile per race. When clicked, call the same logic as onRaceChange but adapted for click (set newCharacter.raceId to the race id, clear class if needed).

For class tiles: iterate over `displayedClassOptions` and render a tile per class. When clicked, set newCharacter.className to the class name.

Replace the two `<select>` elements and the `<input type="radio">` list — but keep all the computed properties and event handling logic intact.
  </action>
  <verify>
Run `cd C:\projects\uwr && npx vue-tsc --noEmit` to confirm no TypeScript errors. Visually verify in browser that:
1. Character cards display with name, level, race, class
2. Selected character has gold border
3. Race/class tiles are clickable and show selection state
4. Create flow still works end-to-end
5. Delete button works on each card
  </verify>
  <done>
Character panel shows card-based character selection (no radio buttons), tile-based race/class selection (no dropdowns), gold highlights on selected items, and maintains all existing functionality including race-class filtering, character deletion, and creation.
  </done>
</task>

</tasks>

<verification>
- Open the game in browser, open Character panel from action bar
- Verify existing characters show as styled cards with name/level/race/class
- Click a character card and confirm it selects and closes panel
- Open panel again, verify the selected character has gold highlight
- Create a new character: pick race tile, verify class tiles filter correctly, pick class tile, enter name, click Create
- Delete a character via the small x button, confirm dialog appears
</verification>

<success_criteria>
- No radio buttons or HTML select dropdowns remain in CharacterPanel
- Characters displayed as visual cards with clear information hierarchy
- Race and class selection uses clickable tiles with gold highlight feedback
- All existing functionality preserved (create, select, delete, race-class filtering)
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/48-can-we-do-a-ui-overhaul-of-the-character/48-SUMMARY.md`
</output>
