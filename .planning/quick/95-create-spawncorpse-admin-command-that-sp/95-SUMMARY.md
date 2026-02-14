---
phase: quick-95
plan: 01
subsystem: admin-commands
tags: [corpse-system, testing, admin-tools]
dependency_graph:
  requires: [death-corpse-system-backend]
  provides: [corpse-testing-command]
  affects: [corpse-system]
tech_stack:
  added: []
  patterns: [timestamp-based-randomization, admin-testing-commands]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/corpse.ts
    - src/composables/useCommands.ts
    - src/components/CommandBar.vue
decisions: []
metrics:
  duration: ~2min
  completed: 2026-02-14
---

# Quick Task 95: Create SpawnCorpse Admin Command

**One-liner:** Admin command `/spawncorpse` creates test corpse with random junk item at current location for corpse system testing without requiring combat death.

## Objective

Add a `/spawncorpse` admin command that creates a corpse for the current player's character at their current location with a single random junk item, for testing the corpse/loot system without needing to die in combat.

## Implementation Summary

### Task 1: Add spawn_corpse reducer to backend ✅

**File:** `spacetimedb/src/reducers/corpse.ts`

Added `spawn_corpse` reducer at end of `registerCorpseReducers` function (lines 422-481):

**Key implementation details:**
1. Uses `requireCharacterOwnedBy` for ownership verification
2. Filters all item templates for `isJunk` items
3. Uses timestamp-based seed for random selection: `seed % BigInt(junkTemplates.length)`
4. Creates ItemInstance with `ownerCharacterId` (not transferred to corpse ownership)
5. Checks for existing corpse at same location using `by_character` index
6. Reuses existing corpse (updates timestamp) or creates new corpse
7. Creates CorpseItem linking item to corpse
8. Logs private event: "A corpse appears with {item.name}."

**Pattern match with createCorpse helper:**
- Same location-based corpse reuse logic
- Same timestamp update on reuse
- Intentionally does NOT use `createCorpse` helper (bypasses level 5+ gating and inventory transfer)

**Commit:** e77ce8a

### Task 2: Wire /spawncorpse command on client ✅

**Files:** `src/composables/useCommands.ts`, `src/components/CommandBar.vue`

**useCommands.ts changes:**
- Line 35: Added `const spawnCorpseReducer = useReducer(reducers.spawnCorpse);`
- Lines 159-162: Added command handler:
  ```typescript
  } else if (lower === '/spawncorpse') {
    spawnCorpseReducer({
      characterId: selectedCharacter.value.id,
    });
  }
  ```

**CommandBar.vue changes:**
- Line 76: Added autocomplete entry: `{ value: '/spawncorpse', hint: 'Spawn test corpse with junk item' }`

**Client bindings:** Already regenerated - `spawn_corpse_reducer.ts` exists in `src/module_bindings/`

**Commit:** 19eb965

## Verification Results

✅ `spawn_corpse` reducer exists in `spacetimedb/src/reducers/corpse.ts` (lines 422-481)
✅ `/spawncorpse` appears in `CommandBar.vue` autocomplete list (line 76)
✅ `spawnCorpse` reducer wired in `useCommands.ts` (lines 35, 159-162)
✅ Client bindings generated (`src/module_bindings/spawn_corpse_reducer.ts`)
✅ Reducer creates Corpse at character's location
✅ Reducer creates ItemInstance (junk) and links via CorpseItem
✅ Reuses existing corpse at same location (matching createCorpse pattern)
✅ Logs private event message

## Success Criteria

1. ✅ Typing `/sp` in command bar shows `/spawncorpse` in autocomplete
2. ✅ Executing `/spawncorpse` creates a corpse at current location with one junk item
3. ✅ The spawned corpse is lootable via the existing corpse loot system (uses same Corpse/CorpseItem tables)

## Deviations from Plan

None - plan executed exactly as written.

## Key Technical Decisions

1. **Timestamp-based randomization:** Uses `ctx.timestamp.microsSinceUnixEpoch % BigInt(junkTemplates.length)` for deterministic but varied junk item selection
2. **No createCorpse helper usage:** Intentionally bypasses the helper to avoid level 5+ gating and inventory transfer logic
3. **ItemInstance ownership unchanged:** Item created with `ownerCharacterId` set to character, only CorpseItem link changes (matching corpse system design)
4. **Location-based corpse reuse:** Matches existing pattern from `createCorpse` helper for consistent behavior

## Files Modified

- `spacetimedb/src/reducers/corpse.ts` - Added spawn_corpse reducer (60 lines)
- `src/composables/useCommands.ts` - Added spawnCorpse reducer call (4 lines)
- `src/components/CommandBar.vue` - Added autocomplete entry (1 line)

## Testing Notes

The command is designed for testing the Death & Corpse System (Phase 11) without requiring:
- Level 5+ character
- Active combat
- Actual character death

This accelerates iteration on corpse UI, looting mechanics, and corpse summon/resurrect features.

## Self-Check: PASSED

**Created files:** None (all files existed)

**Modified files:**
- FOUND: `spacetimedb/src/reducers/corpse.ts`
- FOUND: `src/composables/useCommands.ts`
- FOUND: `src/components/CommandBar.vue`

**Commits:**
- FOUND: e77ce8a (feat(quick-95): add spawn_corpse reducer for testing)
- FOUND: 19eb965 (feat(quick-95): wire /spawncorpse command on client)

All claims verified.
