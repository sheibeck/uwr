---
phase: quick-97
plan: 01
subsystem: ui/targeting
tags: [ui, targeting, character-selection, corpse-summon, context-menu]
dependency_graph:
  requires: [quick-96]
  provides: [character-targeting-system, corpse-summon-targeting-fix]
  affects: [LocationGrid, useHotbar, character-spells]
tech_stack:
  added: [character-selection-state]
  patterns: [toggle-selection, context-menu, character-targeted-abilities]
key_files:
  created: []
  modified:
    - src/ui/styles.ts
    - src/components/LocationGrid.vue
    - src/App.vue
    - src/composables/useHotbar.ts
decisions:
  - "Character selection uses blue/cyan theme (rgba(76, 180, 240)) to distinguish from NPC green and enemy gold"
  - "Corpse Summon context menu option gated by caster class (necromancer/summoner) and level (6+)"
  - "Resurrect uses corpse target, Corpse Summon uses character target - no overlap in targeting requirements"
  - "Left-click toggles selection, right-click opens context menu (same pattern as NPCs/enemies)"
metrics:
  duration: 4min
  tasks_completed: 1
  files_modified: 4
  commits: 1
completed: 2026-02-16
---

# Phase quick-97 Plan 01: Character Targeting and Corpse Summon Fix Summary

**One-liner:** Added left-click character selection with blue highlight, right-click context menus with inline Corpse Summon action, and fixed hotbar Corpse Summon to target characters instead of corpses.

## What Was Built

### Character Selection System
- **Left-click selection:** Characters in PLAYERS section can be left-clicked to toggle blue highlight selection
- **Visual feedback:** `gridTileCharacterSelected` style with blue/cyan theme (rgba(76, 180, 240, 0.2) background, 0.6 border)
- **Selection state:** Added `selectedCharacterTarget` ref in App.vue, passed to LocationGrid as `selectedCharacterTargetId` prop
- **Toggle behavior:** Clicking selected character deselects (emits null), clicking different character switches selection

### Character Context Menu
- **Right-click menu:** Right-clicking a character opens context menu with character name and class/level subtitle
- **Actions option:** "Actions" menu item opens CharacterActionsPanel (existing trade/invite/friend functionality)
- **Corpse Summon option:** Conditionally shown for necromancer/summoner level 6+ casters
- **Direct invocation:** Corpse Summon context menu item calls `initiate_corpse_summon` reducer with target character ID

### Corpse Summon Targeting Fix
- **Separated logic:** Split resurrection (corpse target) from corpse summon (character target) in useHotbar
- **Resurrect:** Requires `selectedCorpseTarget`, calls `onResurrectRequested` with corpse ID
- **Corpse Summon:** Requires `selectedCharacterTarget`, calls `onCorpseSummonRequested` with character ID
- **Error messages:** "You must target a corpse first" for resurrect, "You must target a character first" for corpse summon
- **New callback:** Added `onCorpseSummonRequested` callback to useHotbar args, wired to App.vue

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

### Manual Testing Required
1. **Character selection:**
   - Left-click a character in PLAYERS section → blue highlight appears
   - Left-click same character again → highlight disappears
   - Left-click different character → highlight moves to new character

2. **Character context menu:**
   - Right-click a character → context menu shows with "Actions"
   - As necromancer/summoner 6+ → context menu shows "Actions" and "Corpse Summon"
   - As other class or <6 → context menu shows only "Actions"
   - Click "Corpse Summon" → initiates corpse summon spell cast for that character

3. **Hotbar corpse summon:**
   - Select a character via left-click
   - Click Corpse Summon on hotbar → spell initiates with selected character as target
   - No character selected → error: "You must target a character first"

4. **Hotbar resurrect:**
   - Select a corpse via left-click
   - Click Resurrect on hotbar → spell initiates with selected corpse as target
   - No corpse selected → error: "You must target a corpse first"

### Build Status
- `npm run build` completes with pre-existing TypeScript strict mode errors (not related to changes)
- No errors related to new code: `selectedCharacterTarget`, `select-character`, `toggleSelectCharacter`, `openCharacterContextMenu`, `onCorpseSummonRequested`
- All modified files compile successfully

## Architecture Notes

### State Flow
```
LocationGrid (PLAYERS section)
  └─> Left-click character
       └─> emit('select-character', characterId)
            └─> App.vue: selectCharacterTarget(characterId)
                 └─> selectedCharacterTarget.value = characterId
                      └─> Passed to LocationGrid as selectedCharacterTargetId prop
                           └─> Blue highlight applied to matching character
                      └─> Passed to useHotbar as selectedCharacterTarget
                           └─> Hotbar Corpse Summon uses for target validation
```

### Context Menu Flow
```
LocationGrid (PLAYERS section)
  └─> Right-click character
       └─> openCharacterContextMenu(event, character)
            └─> Build menu items:
                 ├─> "Actions" (always) → emit('character-action', characterId)
                 └─> "Corpse Summon" (if necro/summoner 6+) → emit('initiate-corpse-summon', characterId)
```

### Hotbar Targeting Flow
```
Hotbar click
  ├─> cleric_resurrect
  │    └─> Check selectedCorpseTarget
  │         ├─> Present → onResurrectRequested(corpseId)
  │         └─> Null → addLocalEvent('blocked', 'You must target a corpse first.')
  │
  └─> necromancer_corpse_summon / summoner_corpse_summon
       └─> Check selectedCharacterTarget
            ├─> Present → onCorpseSummonRequested(characterId)
            └─> Null → addLocalEvent('blocked', 'You must target a character first.')
```

## Key Implementation Details

### Style Distinction
- **NPCs:** Green theme (rgba(130, 200, 130))
- **Enemies:** Gold theme (rgba(255, 210, 90))
- **Characters:** Blue/cyan theme (rgba(76, 180, 240))
- **Corpses:** Brown theme (rgba(180, 140, 100))

Each targeting system has distinct colors for visual clarity.

### Props Pattern
- `selectedCharacterTargetId` prop name chosen to avoid confusion with `selectedCharacter` (user's own character)
- Props flow: App.vue state → LocationGrid prop → template style binding
- Same pattern as existing `selectedNpcId` prop for NPC targeting

### Type Safety
All new code maintains existing TypeScript patterns:
- Refs typed with `bigint | null` for selection state
- Event emitters strongly typed in `defineEmits`
- Props interface extended with proper types
- useHotbar args extended with optional refs and callbacks

## Self-Check: PASSED

### Files Created
None - only modified existing files.

### Files Modified
- ✅ `src/ui/styles.ts` exists - added `gridTileCharacterSelected` style
- ✅ `src/components/LocationGrid.vue` exists - added selection highlight and context menu
- ✅ `src/App.vue` exists - added character target state and wiring
- ✅ `src/composables/useHotbar.ts` exists - separated resurrect/corpse summon targeting

### Commits
- ✅ `fbf9fbd` exists - "feat(quick-97): add character targeting and fix corpse summon"

All claimed artifacts verified on disk and in git history.

## Summary

Successfully implemented character targeting system with visual selection (blue highlight), right-click context menus with inline actions, and fixed Corpse Summon ability to correctly target characters instead of corpses. The implementation follows existing patterns for NPC and enemy targeting, uses distinct visual theming, and maintains proper separation of concerns between different spell types (resurrection targets corpses, corpse summon targets characters).
