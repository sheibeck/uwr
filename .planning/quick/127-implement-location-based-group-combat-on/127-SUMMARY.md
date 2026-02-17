---
phase: quick-127
plan: 01
subsystem: combat
tags: [group-combat, location, combat-participants, movement, targeting]
dependency_graph:
  requires: []
  provides: [location-based-group-combat, auto-join-combat-on-arrival]
  affects: [group.ts, combat.ts, movement.ts]
tech_stack:
  added: []
  patterns: [location-filter, auto-join-on-arrive]
key_files:
  modified:
    - spacetimedb/src/helpers/group.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/movement.ts
decisions:
  - "Location filter in getGroupOrSoloParticipants covers all three call sites (start_combat, start_tracked_combat, resolve_pull) with a single change"
  - "appendGroupEvent truthy-checked in movement.ts despite being in deps - defensive pattern"
  - "AUTO_ATTACK_INTERVAL defined inline (5_000_000n) in movement.ts to avoid circular imports with combat.ts"
  - "alreadyIn check uses 'break' not 'continue' since we only ever join one combat per move"
metrics:
  duration: ~8min
  completed: 2026-02-17
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 127: Location-Based Group Combat Summary

## One-liner

Location-filtered group combat participation using `locationId` check in `getGroupOrSoloParticipants`, cross-location ability targeting blocked in `executeAbility`, and auto-join on arrival via `moveOne` inserting combatParticipant + aggroEntry rows.

## What Was Built

### Task 1: Filter combat participants by location and block cross-location targeting

**`spacetimedb/src/helpers/group.ts`** - Added single location filter to `getGroupOrSoloParticipants`:

```typescript
if (row.locationId !== character.locationId) continue;
```

This single line covers all three call sites in `combat.ts` (`start_combat`, `start_tracked_combat`, `resolve_pull`) because they all use `getGroupOrSoloParticipants`. Only group members physically at the same location as the combat initiator are returned as participants.

**`spacetimedb/src/helpers/combat.ts`** - Added location check in `executeAbility` target validation block (after the group membership check):

```typescript
if (targetCharacter.locationId !== character.locationId) {
  throw new SenderError('Target is not at your location');
}
```

This prevents heals, buffs, and cleanses from targeting group members in different locations.

**Reward exclusion is automatic**: Since `combatParticipant` rows are only created for same-location members, the reward loop in `combat_loop` naturally excludes absent members from XP, loot, gold, quest credit, faction standing, and renown.

### Task 2: Auto-join combat when arriving at group's combat location

**`spacetimedb/src/reducers/movement.ts`** - Added `appendGroupEvent` to destructured deps and added auto-join logic at the end of `moveOne` after all standard movement processing:

- Re-reads fresh character row after movement
- Checks if character is in a group (`effectiveGroupId`) and not already in combat
- Scans `combatEncounter.by_group` (existing btree index) for active combats at destination
- Inserts `combatParticipant` row (status='active', 5s auto-attack offset)
- Inserts `aggroEntry` rows for all living enemies (value=0n, no initial aggro)
- Auto-targets first living enemy if character has no current target
- Sends private event "You join your group in combat!" and group event "{name} joins the fight!"

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

### Files exist
- `spacetimedb/src/helpers/group.ts` - modified, locationId filter present
- `spacetimedb/src/helpers/combat.ts` - modified, location SenderError present
- `spacetimedb/src/reducers/movement.ts` - modified, auto-join logic present

### Commits
- `2924afa` - feat(quick-127): filter combat participants by location, block cross-location targeting
- `b515596` - feat(quick-127): auto-join group combat when arriving at combat location

## Self-Check: PASSED
