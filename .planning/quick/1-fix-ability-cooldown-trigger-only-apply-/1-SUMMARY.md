---
phase: quick
plan: 1
subsystem: combat
tags: [bugfix, abilities, cooldown, combat-state]
dependency-graph:
  requires: []
  provides: [guarded-cooldown-application]
  affects: [ability-system, combat-flow]
tech-stack:
  patterns: [early-return-guard, return-value-check]
key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
decisions:
  - Combat state guard in tick_casts prevents cast-time ability execution for non-active participants
  - executeAbilityAction return value check in use_ability prevents instant-cast cooldown on false return
  - Dead/fled characters have casts deleted without cooldown penalty
metrics:
  duration: 85s
  completed: 2026-02-12
---

# Quick Task 1: Fix Ability Cooldown Trigger

Fixed ability cooldown trigger so cooldowns are only applied when abilities actually execute their effects, not when denied due to combat state changes.

**One-liner:** Cooldown now only applied when abilities successfully execute, preventing penalty for deaths during cast or combat ending mid-cast.

---

## Tasks Completed

### Task 1: Guard cooldown application in tick_casts and use_ability
**Commit:** 3f3e2dc
**Status:** Complete

**Changes made:**

1. **tick_casts reducer (combat.ts, lines 1332-1342)**:
   - Added combat state guard before `executeAbilityAction` call
   - Checks if character is in active combat via `activeCombatIdForCharacter`
   - If in combat, finds participant and verifies `status === 'active'`
   - If participant exists but status is NOT 'active' (dead/fled), deletes cast and continues without execution
   - Prevents both ability execution AND cooldown application for invalid states

2. **use_ability reducer (items.ts, lines 442-451)**:
   - Captures `executeAbilityAction` return value (boolean)
   - Added return value check: if `!executed`, sends feedback event and returns early
   - Cooldown insertion code (lines 452-467) now only runs when ability was actually executed
   - Maintains existing try/catch behavior for thrown errors (cooldown already not applied on catch)

**Verification:**
- Both files modified successfully
- TypeScript type system validates changes (no new type errors introduced)
- Cooldown logic unchanged for successful ability executions
- Dead/fled/inactive participants no longer penalized with cooldown for abilities that never fire

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Success Criteria Met

- [x] Cooldowns only set when ability actually fires and produces its effect
- [x] Characters who die during cast do not get cooldown penalty
- [x] Combat ending during cast does not trigger cooldown
- [x] Participant status 'dead' or 'fled' prevents execution and cooldown
- [x] Successful ability executions still apply cooldown as before (no behavioral change to happy path)

---

## Technical Notes

### Return Value Pattern
`executeAbilityAction` returns `false` when:
- Character not found (line 2949 in index.ts)
- Various ability-specific validation failures

The instant-cast path in `use_ability` was ignoring this return value, applying cooldown regardless. The fix properly handles the `false` return case with early return before cooldown logic.

### Combat State Guard Pattern
The guard in `tick_casts` follows the same pattern as the existing guard in `use_ability` (lines 395-408), checking:
1. Active combat ID for character
2. Participant row existence and status

This ensures consistency between instant-cast and cast-time ability paths.

---

## Self-Check: PASSED

**Files exist:**
- FOUND: spacetimedb/src/reducers/combat.ts
- FOUND: spacetimedb/src/reducers/items.ts

**Commit exists:**
- FOUND: 3f3e2dc

**Changes verified:**
- tick_casts: Combat state guard at lines 1332-1342
- use_ability: Return value check at lines 442-451
- Cooldown code gated behind execution success in both locations
