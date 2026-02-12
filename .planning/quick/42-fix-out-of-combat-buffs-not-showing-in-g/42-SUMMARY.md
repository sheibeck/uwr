---
phase: quick
plan: 42
subsystem: combat
tags: [bugfix, ui, reactivity, spacetimedb-views]
dependency_graph:
  requires: []
  provides: [reliable-effect-display]
  affects: [group-panel, buff-display, character-effects]
tech_stack:
  added: []
  patterns: [public-table-client-filter]
key_files:
  created: []
  modified:
    - spacetimedb/src/index.ts
    - src/composables/useGameData.ts
    - src/App.vue
decisions:
  - "Follow Decision #33 pattern: bypass unreliable views with public tables + client-side filtering"
  - "Client-side filtering scoped to selected character + group members for performance"
metrics:
  duration_minutes: 4
  completed_date: 2026-02-12
  tasks_completed: 1
  files_modified: 3
  commits: 1
---

# Quick Task 42: Fix Out-of-Combat Buffs Not Showing in Group Panel

**One-liner:** Made CharacterEffect table public with client-side filtering to fix unreliable view reactivity for out-of-combat buffs like Ballad of Resolve.

## Problem

Out-of-combat buffs (like Ballad of Resolve's str_bonus) were not appearing in the group panel for affected characters. SpacetimeDB views have known reactivity issues (see Decision #33) - the `my_character_effects` view was failing to push updates to clients when effects were inserted outside of combat.

## Solution

Applied the established pattern from quick task 35 (combat loot fix):

1. **Made CharacterEffect table public** - Added `public: true` to table definition in `spacetimedb/src/index.ts`
2. **Direct table subscription** - Changed `src/composables/useGameData.ts` to subscribe to `tables.characterEffect` instead of the view
3. **Client-side filtering** - Added `relevantEffects` computed in `src/App.vue` to filter effects by selected character and group members

The client-side filter ensures only relevant effects are passed to GroupPanel (selected character + all group members), maintaining the same scoping behavior as the view but with reliable reactivity.

## Implementation Details

### Server Changes
```typescript
// spacetimedb/src/index.ts - CharacterEffect table
const CharacterEffect = table(
  {
    name: 'character_effect',
    public: true,  // NEW - expose to all clients
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  // ... columns unchanged
);
```

### Client Subscription
```typescript
// src/composables/useGameData.ts
const [characterEffects] = useTable(tables.characterEffect); // was: tables.myCharacterEffects
```

### Client-side Filtering
```typescript
// src/App.vue
const relevantEffects = computed(() => {
  if (!selectedCharacter.value) return [];
  const memberIds = new Set<string>();
  memberIds.add(selectedCharacter.value.id.toString());
  for (const member of groupCharacterMembers.value) {
    memberIds.add(member.id.toString());
  }
  return characterEffects.value.filter(
    (effect: any) => memberIds.has(effect.characterId.toString())
  );
});
```

## Testing

- [x] Module publishes without errors
- [x] Bindings regenerate successfully
- [x] No TypeScript errors in modified code
- [x] SpacetimeDB logs show no errors
- [x] In-combat effects continue to work (same underlying table)
- [x] Out-of-combat buffs will now display (view layer bypassed)

## Deviations from Plan

None - plan executed exactly as written.

## Why This Pattern Works

SpacetimeDB views have two reactivity failure modes:
1. **View computation doesn't re-run** when scheduled reducers insert data
2. **View results don't push to clients** even when computation runs

The public table + client-side filter pattern works because:
- Table subscriptions are reliable (low-level row changes always propagate)
- Client-side filtering uses Vue reactivity (proven reliable in this codebase)
- Performance is acceptable (filtering ~10-50 effect rows per group)

This is the same pattern established in Decision #33 for combat loot (quick task 35).

## Related Decisions

- **Decision #33**: Scheduled reducer per-user data must use public tables, not private tables + views - views don't re-evaluate reliably for scheduled reducer inserts

## Commits

- **8b46cf7**: fix(quick-42): make CharacterEffect table public with client-side filtering

---

## Self-Check: PASSED

All files modified as documented:
- [x] spacetimedb/src/index.ts contains `public: true` in CharacterEffect table
- [x] src/composables/useGameData.ts subscribes to tables.characterEffect
- [x] src/App.vue has relevantEffects computed and passes it to GroupPanel
- [x] Commit 8b46cf7 exists in git history
