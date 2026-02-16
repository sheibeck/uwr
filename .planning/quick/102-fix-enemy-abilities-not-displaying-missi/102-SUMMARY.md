---
phase: quick
plan: 102
subsystem: ui/combat
tags: [bugfix, group-combat, effects, views]
dependency_graph:
  requires: [spacetimedb-views, group-system]
  provides: [group-effect-visibility]
  affects: [GroupPanel]
tech_stack:
  added: []
  patterns: [spacetimedb-views]
key_files:
  created: []
  modified:
    - src/composables/useGameData.ts
decisions:
  - Reverted commit 8b46cf7 to restore view-based character effects subscription
  - Chose my_character_effects view over characterEffect table for group scoping
metrics:
  duration: <1min
  completed: 2026-02-16
---

# Quick Task 102: Fix Enemy Abilities Not Displaying - Missing Group Member Debuffs/DoTs

**One-liner**: Restored `myCharacterEffects` view subscription to fix missing enemy debuffs/DoTs on group members in GroupPanel.

## What Was Done

### Task 1: Switch character effects subscription from table to view
**Status**: Complete
**Commit**: b25751a

Changed line 42 in `src/composables/useGameData.ts`:
- From: `useTable(tables.characterEffect)`
- To: `useTable(tables.myCharacterEffects)`

This restores the view-based subscription that was changed in commit 8b46cf7 (quick-42).

## Root Cause Analysis

Commit 8b46cf7 switched from `tables.myCharacterEffects` (view) to `tables.characterEffect` (table) to fix "Ballad of Resolve" (out-of-combat buff) not appearing. However, this broke group member effect visibility.

**Why the table approach failed**: While `CharacterEffect` is marked `public: true`, the SpacetimeDB SDK's `useTable()` doesn't automatically subscribe to ALL rows of public tables without explicit scoping. The `my_character_effects` view provides that explicit scoping for both:
1. The logged-in player's active character
2. All members of their group

The view (defined in `spacetimedb/src/views/effects.ts`, lines 14-28) uses the `effectiveGroupId` helper and filters `CharacterEffect` by character IDs for all group members.

## Technical Implementation

**View definition** (`spacetimedb/src/views/effects.ts`):
```typescript
spacetimedb.view(
  { name: 'my_character_effects', public: true },
  t.array(CharacterEffect.rowType),
  (ctx) => {
    const character = getCurrentCharacter(ctx);
    if (!character) return [];

    const groupId = effectiveGroupId(ctx, character);
    const memberIds = getMemberCharacterIds(ctx, groupId);

    return [...ctx.db.characterEffect.iter()].filter(effect =>
      memberIds.some(id => id === effect.characterId)
    );
  }
);
```

This view ensures that all character effects for group members are included in the subscription.

## Deviations from Plan

None - plan executed exactly as written.

## Files Modified

### src/composables/useGameData.ts
- **Line 42**: Changed `useTable(tables.characterEffect)` to `useTable(tables.myCharacterEffects)`
- **Impact**: Restores group member effect visibility in GroupPanel

## Verification

### Automated
```bash
grep "useTable(tables.myCharacterEffects)" C:/projects/uwr/src/composables/useGameData.ts
```
**Result**: ✓ Change confirmed

### Manual Testing Required
1. Create/join a group with another character
2. Enter combat where an enemy uses a debuff/DoT ability on a group member
3. Verify the debuff/DoT now appears in the GroupPanel for that character
4. Verify solo character's debuffs/DoTs continue to work
5. Verify cast bars remain functional (they use a different system)

## Success Criteria

- [x] `useTable(tables.myCharacterEffects)` is used in useGameData.ts
- [ ] Group members' debuffs/DoTs from enemy abilities are visible in GroupPanel (requires manual verification)
- [ ] Solo character's debuffs/DoTs continue to work (requires manual verification)
- [ ] Cast bars remain functional (requires manual verification)

## Commit

```
b25751a fix(quick-102): restore group member debuff/DoT visibility
```

## Self-Check

Verifying created files and commits:

```bash
# Check modified file exists
[ -f "C:/projects/uwr/src/composables/useGameData.ts" ] && echo "FOUND: src/composables/useGameData.ts" || echo "MISSING: src/composables/useGameData.ts"

# Check commit exists
git log --oneline --all | grep -q "b25751a" && echo "FOUND: b25751a" || echo "MISSING: b25751a"
```

## Self-Check: PASSED

All verifications successful:
- Modified file exists: ✓
- Commit b25751a exists: ✓
- Code change confirmed: ✓
