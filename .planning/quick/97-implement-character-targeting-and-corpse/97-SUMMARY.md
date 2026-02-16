---
phase: quick-97
plan: 01
subsystem: ui/targeting, spell-casting
tags: [ui, targeting, character-selection, corpse-summon, context-menu, cast-bar, cooldown, confirmation-flow]
dependency_graph:
  requires: [quick-96]
  provides: [character-targeting-system, corpse-summon-targeting-fix, confirmation-cast-system]
  affects: [LocationGrid, useHotbar, character-spells, combat.ts, corpse.ts]
tech_stack:
  added: [character-selection-state, confirmation-based-casting, deferred-mana-cost]
  patterns: [toggle-selection, context-menu, character-targeted-abilities, option-b-cast-flow]
key_files:
  created: []
  modified:
    - src/ui/styles.ts
    - src/components/LocationGrid.vue
    - src/App.vue
    - src/composables/useHotbar.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/corpse.ts
decisions:
  - "Character selection uses blue/cyan theme (rgba(76, 180, 240)) to distinguish from NPC green and enemy gold"
  - "Corpse Summon context menu option gated by caster class (necromancer/summoner) and level (6+)"
  - "Resurrect uses corpse target, Corpse Summon uses character target - no overlap in targeting requirements"
  - "Left-click toggles selection, right-click opens context menu (same pattern as NPCs/enemies)"
  - "Option B cast flow: initiate → target accepts → cast bar → execute → cooldown"
  - "Mana deducted only when target accepts, not on initiation (prevents mana loss on declined requests)"
  - "Target selections clear only on location change (simpler than per-target validation)"
metrics:
  duration: 90min (4min initial + 86min enhancements)
  tasks_completed: 2 (initial + cast/cooldown system)
  files_modified: 6 (4 client + 2 backend)
  commits: 10
completed: 2026-02-16
---

# Phase quick-97: Character Targeting and Corpse Summon Complete Implementation

**One-liner:** Implemented character targeting with blue highlight selection, right-click context menus, confirmation-based spell casting with cast bars and cooldowns, and deferred mana costs for Resurrect and Corpse Summon.

## What Was Built

### Part 1: Character Selection System (Initial Implementation)

- **Left-click selection:** Characters in PLAYERS section can be left-clicked to toggle blue highlight selection
- **Visual feedback:** `gridTileCharacterSelected` style with blue/cyan theme (rgba(76, 180, 240, 0.2) background, 0.6 border)
- **Selection state:** Added `selectedCharacterTarget` ref in App.vue, passed to LocationGrid as `selectedCharacterTargetId` prop
- **Toggle behavior:** Clicking selected character deselects (emits null), clicking different character switches selection

### Part 2: Character Context Menu

- **Right-click menu:** Right-clicking a character opens context menu with character name and class/level subtitle
- **Actions option:** "Actions" menu item opens CharacterActionsPanel (existing trade/invite/friend functionality)
- **Corpse Summon option:** Conditionally shown for necromancer/summoner level 6+ casters
- **Direct invocation:** Corpse Summon context menu item calls `initiate_corpse_summon` reducer with target character ID

### Part 3: Corpse Summon Targeting Fix

- **Separated logic:** Split resurrection (corpse target) from corpse summon (character target) in useHotbar
- **Resurrect:** Requires `selectedCorpseTarget`, calls `onResurrectRequested` with corpse ID
- **Corpse Summon:** Requires `selectedCharacterTarget`, calls `onCorpseSummonRequested` with character ID
- **Error messages:** "You must target a corpse first" for resurrect, "You must target a character first" for corpse summon
- **New callback:** Added `onCorpseSummonRequested` callback to useHotbar args, wired to App.vue

### Part 4: Cast Bar and Cooldown System (Enhancement)

**Implemented Option B confirmation flow:**
1. Caster clicks button → Confirmation request sent immediately (no mana cost yet)
2. Target accepts → Mana deducted, CharacterCast entry created
3. Cast bar shows for 10 seconds (cleric_resurrect) or 10 seconds (corpse_summon)
4. tick_casts reducer executes ability when cast completes
5. Cooldown applied (3 seconds for both abilities)

**Backend changes:**
- **combat.ts:** Added `necromancer_corpse_summon` and `summoner_corpse_summon` cases to `executeAbility` switch statement
- **combat.ts:** Special target validation for corpse summon abilities (skip "target must be yourself" check)
- **combat.ts:** Import `executeCorpseSummon` from corpse helpers
- **corpse.ts:** Modified `accept_resurrect` to create CharacterCast entry instead of directly executing
- **corpse.ts:** Modified `accept_corpse_summon` to create CharacterCast entry and use abilityCastMicros
- **corpse.ts:** Removed manual cooldown setting (let tick_casts handle it automatically)

**Client changes:**
- **App.vue:** Simplified target clearing to only clear on location change (avoid reactive timing bugs)
- **App.vue:** Added optional chaining for null safety in target refs

### Part 5: Deferred Mana Cost (Enhancement)

**Resurrect (50 mana):**
- Previously: Mana deducted in `initiate_resurrect`
- Now: Mana deducted in `accept_resurrect` when target accepts

**Corpse Summon (60 mana):**
- Previously: Mana checked but not deducted in `initiate_corpse_summon`
- Now: Mana deducted in `accept_corpse_summon` when target accepts

**Benefits:**
- No mana loss if target declines
- Fairer resource management
- Consistent behavior between both spells

## Deviations from Plan

**Enhancement phase added:** Initial plan covered character targeting and basic spell initiation. User requested Option B cast flow with:
- Cast bar showing after acceptance
- Cooldown application after cast completes
- Deferred mana cost until acceptance

All enhancements implemented successfully without breaking initial functionality.

## Testing Notes

### Manual Testing Checklist

1. **Character selection:**
   - ✅ Left-click a character in PLAYERS section → blue highlight appears
   - ✅ Left-click same character again → highlight disappears
   - ✅ Left-click different character → highlight moves to new character
   - ✅ Move to different location → selection clears

2. **Character context menu:**
   - ✅ Right-click a character → context menu shows with "Actions"
   - ✅ As necromancer/summoner 6+ → context menu shows "Actions" and "Corpse Summon"
   - ✅ As other class or <6 → context menu shows only "Actions"
   - ✅ Click "Corpse Summon" → initiates request, no mana cost yet

3. **Hotbar corpse summon:**
   - ✅ Select a character via left-click
   - ✅ Click Corpse Summon on hotbar → request sent
   - ✅ Target accepts → mana deducted (60), 10-second cast bar appears
   - ✅ Cast completes → corpses summon and merge at caster location
   - ✅ 3-second cooldown applies
   - ✅ Target declines → no mana lost
   - ✅ No character selected → error: "You must target a character first"

4. **Hotbar resurrect:**
   - ✅ Select a corpse via left-click
   - ✅ Click Resurrect on hotbar → request sent
   - ✅ Target accepts → mana deducted (50), 10-second cast bar appears
   - ✅ Cast completes → target resurrected at corpse location
   - ✅ 3-second cooldown applies
   - ✅ Target declines → no mana lost
   - ✅ No corpse selected → error: "You must target a corpse first"

### Build Status
- All TypeScript compilation successful
- No new errors introduced
- Pre-existing strict mode errors remain (unrelated to changes)

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

App.vue location change watcher
  └─> currentLocation changes
       └─> Clear selectedNpcTarget
       └─> Clear selectedCharacterTarget
       └─> Clear selectedCorpseTarget
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

### Confirmation Cast Flow (Option B)
```
Hotbar click
  └─> cleric_resurrect / corpse_summon
       └─> Check target selected
            └─> Call initiate reducer (NO mana cost)
                 └─> PendingSpellCast created
                      └─> Target receives dialog
                           ├─> Accept
                           │    └─> accept reducer called
                           │         ├─> Deduct mana
                           │         ├─> Create CharacterCast entry
                           │         └─> Delete PendingSpellCast
                           │              └─> tick_casts monitors CharacterCast
                           │                   └─> endsAtMicros <= nowMicros
                           │                        ├─> executeAbilityAction
                           │                        │    └─> executeAbility
                           │                        │         └─> Switch case for ability
                           │                        │              └─> Execute spell effect
                           │                        ├─> Apply cooldown
                           │                        └─> Delete CharacterCast
                           │
                           └─> Decline
                                └─> decline reducer called
                                     └─> Delete PendingSpellCast
                                          └─> No mana lost
```

### Ability Execution Flow
```
executeAbility (combat.ts)
  └─> Switch on abilityKey
       ├─> 'cleric_resurrect'
       │    ├─> Find corpse at caster location
       │    └─> executeResurrect(ctx, caster, targetCharacter, corpse)
       │
       ├─> 'necromancer_corpse_summon'
       │    └─> executeCorpseSummon(ctx, caster, targetCharacter)
       │
       └─> 'summoner_corpse_summon'
            └─> executeCorpseSummon(ctx, caster, targetCharacter)
```

## Key Implementation Details

### Style Distinction
- **NPCs:** Green theme (rgba(130, 200, 130))
- **Enemies:** Gold theme (rgba(255, 210, 90))
- **Characters:** Blue/cyan theme (rgba(76, 180, 240))
- **Corpses:** Brown theme (rgba(180, 140, 100))

Each targeting system has distinct colors for visual clarity.

### Special Target Validation
Abilities that target other characters (not just self or group) need to skip normal validation:
```typescript
const specialTargetingAbilities = [
  'cleric_resurrect',
  'necromancer_corpse_summon',
  'summoner_corpse_summon'
];
```

### Power = 0n for Confirmation Spells
Both resurrect and corpse summon have `power: 0n` in ability templates, so `executeAbility` calculates mana cost as 0. Actual mana costs:
- Deducted manually in `accept_resurrect` (50 mana)
- Deducted manually in `accept_corpse_summon` (60 mana)

### Ability Template Configuration
```typescript
// cleric_resurrect (cleric_abilities.ts)
{
  castSeconds: 10n,
  cooldownSeconds: 3n,
  power: 0n,  // No automatic mana deduction
  combatState: 'out_of_combat'
}

// necromancer_corpse_summon (necromancer_abilities.ts)
{
  castSeconds: 10n,
  cooldownSeconds: 3n,
  power: 0n,  // No automatic mana deduction
  combatState: 'out_of_combat'
}
```

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
- Optional chaining for null safety (`char.id?.toString()`)

## Commits

1. `fbf9fbd` - feat(quick-97): add character targeting and fix corpse summon
2. `dc0a4d5` - fix(quick-97): add toLowerCase to className comparisons
3. `b311ba1` - feat(quick-97): add cast bar and cooldown for resurrect/corpse summon
4. `482caf1` - fix(quick-97): skip target validation for corpse summon abilities
5. `7f32bc4` - fix(quick-97): add null safety to target clearing watchers
6. `5093ff3` - fix(quick-97): simplify target clearing to location change only
7. `2e4d05b` - fix(quick-97): import executeCorpseSummon in combat.ts
8. `a177222` - feat(quick-97): defer mana cost until target accepts corpse summon
9. `dbf23cf` - feat(quick-97): defer resurrect mana cost until target accepts

## Summary

Successfully implemented complete character targeting and confirmation-based spell casting system:

**Phase 1 (Character Targeting):** Visual selection with blue highlight, right-click context menus, separated targeting logic for resurrect (corpse) vs corpse summon (character).

**Phase 2 (Cast System):** Implemented Option B confirmation flow where caster initiates request without mana cost, target accepts triggering mana deduction and 10-second cast bar, spell executes via tick_casts when cast completes, and 3-second cooldown applies.

**Phase 3 (Refinements):** Deferred mana costs for both spells to only charge when target accepts (prevents mana loss on declined requests), simplified target clearing to location change only (eliminated reactive timing bugs), added proper target validation for special abilities.

The implementation follows existing patterns for targeting and spell casting, integrates cleanly with the tick_casts system for cast monitoring, and provides a consistent user experience across both confirmation-based spells (Resurrect and Corpse Summon).
