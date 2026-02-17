---
phase: quick-126
plan: 01
subsystem: client-hotbar
tags: [targeting, beneficial-spells, heals, buffs, group-play]
dependency_graph:
  requires: []
  provides: [group-member-targeting-for-all-abilities]
  affects: [src/composables/useHotbar.ts]
tech_stack:
  added: []
  patterns: [defensiveTargetId-passthrough-all-abilities]
key_files:
  modified:
    - src/composables/useHotbar.ts
decisions:
  - "Pass defensiveTargetId.value for all non-special abilities, removing the slot.kind === 'utility' gate"
  - "null from defensiveTargetId converts to undefined via ??, which server treats as self-cast via resolvedTargetId ?? character.id"
metrics:
  duration: 3min
  completed: 2026-02-17
  tasks: 1
  files: 1
---

# Phase quick-126: Fix Beneficial Spells Ignoring Player Target Summary

**One-liner:** Removed utility-only target gate in onHotbarClick so heals/buffs/cleanses resolve to the group-member targeted via GroupPanel.

## What Was Done

Fixed `onHotbarClick` in `src/composables/useHotbar.ts` to pass `defensiveTargetId` for ALL ability kinds instead of only `'utility'` kind abilities.

**Before (broken):**
```typescript
const targetId =
  slot.kind === 'utility' ? defensiveTargetId.value ?? selectedCharacter.value.id : undefined;
useAbility(slot.abilityKey, targetId);
```

**After (fixed):**
```typescript
const targetId = defensiveTargetId.value ?? undefined;
useAbility(slot.abilityKey, targetId);
```

## Why This Works

- `defensiveTargetId` is set by clicking group members in GroupPanel (defaults to self when character is selected, App.vue line 1973)
- Server-side `executeAbility` already does `resolvedTargetId = targetCharacterId ?? character.id` — undefined target defaults to self
- Server validates target is in the same group, so passing a target for damage abilities is safe (they use aggro tables for enemy targeting)
- Beneficial spells (Mend, Heal, Sanctify, Spirit Mender, Ancestral Ward, buffs, cleanses) use `targetCharacter` directly in the ability switch cases

## Regression Safety

- **Self-cast preserved:** When no group member is targeted, `defensiveTargetId.value` is the caster's own id (set in App.vue watch on selectedCharacter.id), so `targetId` becomes the caster's id → server defaults to self anyway
- **Special abilities untouched:** ranger_track, cleric_resurrect, necromancer/summoner_corpse_summon all have early-return handling above the changed code
- **Damage abilities safe:** Server validates target group membership; damage ability switch cases use aggro table targeting, not targetCharacter

## Tasks

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Pass defensiveTargetId for all ability kinds in onHotbarClick | Done | 909f6e9 |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/composables/useHotbar.ts` modified with correct targetId logic
- [x] Commit 909f6e9 exists
- [x] Special ability early-returns confirmed untouched (lines 287-340)
- [x] Build errors in useHotbar.ts are pre-existing (unrelated to this change)
