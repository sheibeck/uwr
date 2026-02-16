---
phase: quick-97
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/LocationGrid.vue
  - src/components/CharacterActionsPanel.vue
  - src/App.vue
  - src/ui/styles.ts
  - src/composables/useHotbar.ts
autonomous: true
must_haves:
  truths:
    - "Left-clicking a character in PLAYERS section visually selects them with a highlight"
    - "Right-clicking a character opens a context menu with actions (Trade, Invite, Friend, Message, Corpse Summon)"
    - "Corpse Summon option in character context menu calls initiate_corpse_summon with the target character ID"
    - "Hotbar Corpse Summon uses selected character target (not corpse target) and calls initiate_corpse_summon"
    - "Hotbar Resurrect still uses selected corpse target and calls initiate_resurrect"
  artifacts:
    - path: "src/components/LocationGrid.vue"
      provides: "Character selection highlight, character context menu with Corpse Summon"
    - path: "src/ui/styles.ts"
      provides: "gridTileCharacterSelected style for blue highlight on selected characters"
    - path: "src/composables/useHotbar.ts"
      provides: "Separated resurrect (corpse target) and corpse summon (character target) hotbar logic"
  key_links:
    - from: "src/components/LocationGrid.vue"
      to: "src/App.vue"
      via: "emit select-character and character context menu actions"
      pattern: "emit.*select-character|emit.*initiate-corpse-summon"
    - from: "src/composables/useHotbar.ts"
      to: "src/App.vue"
      via: "onCorpseSummonRequested callback for character-targeted summon"
      pattern: "onCorpseSummonRequested"
---

<objective>
Implement character targeting (left-click select, right-click context menu) and fix Corpse Summon targeting to use character selection instead of corpse selection.

Purpose: Characters in the PLAYERS section currently have no visual selection and both click types open the same CharacterActionsPanel. The Corpse Summon ability incorrectly requires a corpse target when the backend expects a character target. This task adds proper left-click selection with highlight, right-click context menus with inline actions (including Corpse Summon for necromancers/summoners), and fixes hotbar corpse summon targeting.

Output: Character targeting with visual selection, right-click context menu, and working Corpse Summon via both context menu and hotbar.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/LocationGrid.vue
@src/components/CharacterActionsPanel.vue
@src/components/ContextMenu.vue
@src/App.vue
@src/ui/styles.ts
@src/composables/useHotbar.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add character selection highlight and right-click context menu to LocationGrid</name>
  <files>
    src/components/LocationGrid.vue
    src/ui/styles.ts
    src/App.vue
    src/composables/useHotbar.ts
  </files>
  <action>
**styles.ts:** Add a `gridTileCharacterSelected` style similar to `gridTileNpcSelected` but using a blue/cyan theme to distinguish from NPC green and enemy gold:
```
gridTileCharacterSelected: {
  background: 'rgba(76, 180, 240, 0.2)',
  border: '1px solid rgba(76, 180, 240, 0.6)',
  color: '#7cc8f0',
}
```

**LocationGrid.vue:**
1. Add new prop `selectedCharacterId: bigint | null` (the targeted player character ID, not the user's own selected character).
2. Add new emits:
   - `(e: 'select-character', characterId: bigint | null): void` — for left-click selection toggle
3. Change the PLAYERS section behavior:
   - **Left-click** (`@click`): Toggle character selection. If already selected, deselect (emit null). If different, emit the new ID. This is similar to `toggleSelectNpc`.
   - **Right-click** (`@contextmenu.prevent`): Open a context menu for the character using the existing ContextMenu component pattern already used for enemies, resources, NPCs, and corpses.
4. Apply `gridTileCharacterSelected` style when the character's ID matches `selectedCharacterId` prop, merging it with the base `gridTile` style (same pattern as NPC selected).
5. Build the character context menu items:
   - "Trade" — emits `character-action` (opens CharacterActionsPanel which has Trade button) OR directly emits a new `trade-character` event. Since CharacterActionsPanel already handles trade, keep "Actions" as an option that opens the panel.
   - Instead of creating a complex new set of emits, convert the context menu to include the most common actions inline:
     - "Trade" — calls `emit('character-action', characterId)` then immediately would need trade. Simpler: just include the key actions as context menu items that emit existing events.
   - Final context menu items for a character:
     - "Actions" (always) — emits `character-action` to open CharacterActionsPanel
     - "Corpse Summon" (if caster is necromancer/summoner level 6+) — emits `initiate-corpse-summon` with the target character ID
   - Use `props.selectedCharacter` to check if caster is necromancer/summoner level 6+ for the Corpse Summon option.

**App.vue:**
1. Add `selectedCharacterTarget` ref (bigint | null) for the targeted player character in the location.
2. Add `selectCharacterTarget` handler that sets `selectedCharacterTarget.value`.
3. Pass `selectedCharacterId` prop (renamed to `selected-character-target-id` to avoid confusion with `selected-character` which is the user's own character) to LocationGrid.
4. Wire `@select-character="selectCharacterTarget"` on LocationGrid.
5. Pass `selectedCharacterTarget` to `useHotbar` as a new argument for corpse summon character targeting.

**useHotbar.ts:**
1. Add new optional arg `selectedCharacterTarget?: Ref<bigint | null>`.
2. Add new optional callback `onCorpseSummonRequested?: (targetCharacterId: bigint) => void`.
3. Split the resurrect/corpse summon hotbar logic:
   - For `cleric_resurrect`: Keep existing behavior — requires `selectedCorpseTarget`, calls `onResurrectRequested`.
   - For `necromancer_corpse_summon` and `summoner_corpse_summon`: Require `selectedCharacterTarget` (not corpse target), show "You must target a character first." if no character selected. Call `onCorpseSummonRequested` with the character ID.
4. In App.vue, wire `onCorpseSummonRequested` callback:
   ```
   onCorpseSummonRequested: (targetCharacterId: bigint) => {
     if (!selectedCharacter.value) return;
     initiateCorpseSummonReducer({ casterCharacterId: selectedCharacter.value.id, targetCharacterId });
   },
   ```
  </action>
  <verify>
    - `npm run build` completes without errors
    - LocationGrid renders characters with clickable tiles that show selection highlight
    - Right-clicking a character shows context menu with "Actions" and conditionally "Corpse Summon"
    - No TypeScript errors in the modified files
  </verify>
  <done>
    - Left-clicking a character in PLAYERS section toggles a blue highlight selection
    - Right-clicking a character opens a context menu with "Actions" (always) and "Corpse Summon" (if caster is necromancer/summoner 6+)
    - "Actions" context menu item opens CharacterActionsPanel as before
    - "Corpse Summon" context menu item calls initiate_corpse_summon with target character ID
    - Hotbar Resurrect still requires corpse target and works as before
    - Hotbar Corpse Summon now requires character target (not corpse) and calls initiate_corpse_summon correctly
  </done>
</task>

</tasks>

<verification>
- `npm run build` passes with no errors
- Characters in PLAYERS section show blue highlight when left-clicked
- Right-click on character shows context menu
- Corpse Summon appears in context menu only for necromancer/summoner 6+
- Hotbar corpse summon targets selected character, not selected corpse
- Hotbar resurrect still targets selected corpse (no regression)
</verification>

<success_criteria>
Character targeting fully functional: left-click selects with visual highlight, right-click opens context menu with Actions and conditional Corpse Summon. Corpse Summon correctly targets characters (not corpses) from both context menu and hotbar.
</success_criteria>

<output>
After completion, create `.planning/quick/97-implement-character-targeting-and-corpse/97-SUMMARY.md`
</output>
