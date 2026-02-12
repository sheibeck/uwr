---
phase: quick
plan: 5
subsystem: combat-abilities
tags: [bug-fix, cooldown-prediction, client-guard, ux]
dependency-graph:
  requires: []
  provides:
    - Client-side out-of-combat guard for Nature's Mark
  affects:
    - src/composables/useHotbar.ts
tech-stack:
  added: []
  patterns:
    - Client-side ability validation mirrors server-side combat checks
key-files:
  created: []
  modified:
    - src/composables/useHotbar.ts
decisions: []
metrics:
  duration: ~2 minutes
  completed: 2026-02-12T14:28:48Z
---

# Quick Task 5: Fix Nature's Mark Cooldown (Prevent False Cooldown in Combat)

**One-liner:** Client-side guard prevents Nature's Mark from showing false 120-second cooldown when clicked during combat.

---

## Tasks Completed

| # | Task | Commit | Files Modified |
|---|------|--------|----------------|
| 1 | Add out-of-combat-only ability guard to onHotbarClick | 8a11c55 | src/composables/useHotbar.ts |

---

## Problem

Nature's Mark (druid gathering ability) is out-of-combat only. Server correctly rejects usage with `SenderError('Cannot use while in combat')` at index.ts:2608-2610. However, client-side `runPrediction()` runs before the reducer call, setting a local 120-second cooldown that never gets cleared because the ability never actually executes. This creates confusing UX where the ability appears on cooldown despite doing nothing.

---

## Solution

Added `OUT_OF_COMBAT_ONLY_KEYS` constant (line 52-54) and guard logic (line 292) to block both prediction and reducer call when in combat, following the proven pattern from Quick Task 2's `PET_SUMMON_KEYS` guard.

**Key changes:**
1. New constant: `OUT_OF_COMBAT_ONLY_KEYS = new Set(['druid_natures_mark'])`
2. Guard in `onHotbarClick`: `if (activeCombat.value && OUT_OF_COMBAT_ONLY_KEYS.has(slot.abilityKey)) return;`
3. Placed after pet summon check, before `runPrediction()` to prevent false local cooldown

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification Results

1. ✅ OUT_OF_COMBAT_ONLY_KEYS exists with 'druid_natures_mark' (line 52-54)
2. ✅ Guard placed correctly in onHotbarClick before runPrediction (line 292)
3. ✅ PET_SUMMON_KEYS guard unchanged (line 290)
4. ✅ No new type errors introduced (verified via tsc --noEmit)

---

## Success Criteria Met

- [x] Nature's Mark no longer shows false 120s cooldown when clicked in combat
- [x] Nature's Mark still functions correctly outside combat (gathers resources, applies real cooldown)
- [x] No regression to other utility abilities (they should still work in combat)
- [x] No type errors introduced

---

## Self-Check: PASSED

**Files created:**
- None (this is a modification-only fix)

**Files modified:**
```bash
[ -f "C:/projects/uwr/src/composables/useHotbar.ts" ] && echo "FOUND: src/composables/useHotbar.ts"
```
FOUND: src/composables/useHotbar.ts

**Commits:**
```bash
git log --oneline --all | grep -q "8a11c55" && echo "FOUND: 8a11c55"
```
FOUND: 8a11c55

All verification checks passed.

---

## Technical Notes

**Pattern consistency:** This follows the exact same pattern as Quick Task 2's pet summon guard:
- OUT_OF_COMBAT_ONLY_KEYS mirrors PET_SUMMON_KEYS structure
- Guard placement is parallel (after ranger_track, after pet summon check, before runPrediction)
- Silent blocking (no client-side toast) - server error still appears if bypassed via dev tools

**Extensibility:** Additional out-of-combat abilities can be added to the Set without changing guard logic.

**Combat state source:** Uses `activeCombat.value` from parent component, same as existing combat-gated ability checks on line 288.

---

## Impact

**Before:** Clicking Nature's Mark in combat → 120s cooldown appears → no resource gathered → confusing UX
**After:** Clicking Nature's Mark in combat → silent no-op → no false cooldown → clear feedback that ability unavailable

**Scope:** Druid Nature's Mark only. Other utility abilities unaffected (they remain usable in combat as designed).
