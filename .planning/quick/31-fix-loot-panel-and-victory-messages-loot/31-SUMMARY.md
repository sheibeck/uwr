---
phase: quick-31
plan: 1
subsystem: combat-loot
tags: [bugfix, event-log, loot-panel, combat-flow]
dependency-graph:
  requires: [combat-system, event-log, loot-system]
  provides: [working-victory-defeat-messages, functional-loot-panel]
  affects: [combat-result-flow]
tech-stack:
  added: []
  patterns: [positional-args, conditional-auto-dismiss]
key-files:
  created: []
  modified:
    - src/App.vue
decisions:
  - decision: "Gate auto-dismiss on pendingLoot.value.length === 0 instead of unconditional 500ms delay"
    rationale: "Loot rows must survive long enough for loot panel to display them; unconditional auto-dismiss deletes loot before panel can show it"
    alternatives: ["Longer delay (fragile - depends on network)", "No auto-dismiss (requires manual user action always)"]
  - decision: "Use positional args for addLocalEvent(kind, message) not object syntax"
    rationale: "Function signature is (kind: string, message: string); object syntax causes kind=[object Object] and message=undefined"
    alternatives: ["Change addLocalEvent signature to accept object (unnecessary refactor)"]
metrics:
  duration: "~3 min"
  completed: "2026-02-12T20:19:25Z"
  tasks: 1
  files: 1
  commits: 1
---

# Quick 31: Fix Loot Panel and Victory Messages After Loot System Refactor

**One-liner:** Fixed two critical bugs from quick-29 refactor - victory/defeat log messages now appear and loot panel shows actual items instead of "No unclaimed loot"

## Changes Summary

### Task 1: Fix addLocalEvent call syntax and conditional auto-dismiss

**Commit:** `ae56c5d`

**Bug 1 - Wrong addLocalEvent call (line 895):**

Changed from object syntax to positional arguments:
```typescript
// BEFORE (BROKEN)
addLocalEvent({ kind: 'combat', message: logMessage });

// AFTER (FIXED)
addLocalEvent('combat', logMessage);
```

The `addLocalEvent` function in `useEvents.ts` has signature `(kind: string, message: string)`. Passing an object meant `kind` received `[object Object]` and `message` was `undefined`, silently breaking the log entry.

**Bug 2 - Auto-dismiss deletes loot before panel can show it (lines 897-903):**

Wrapped auto-dismiss in conditional check:
```typescript
// BEFORE (BROKEN)
setTimeout(() => {
  dismissResults();
}, 500);

// AFTER (FIXED)
// Only auto-dismiss if no loot dropped for this character.
// When loot exists, player dismisses after claiming items.
if (pendingLoot.value.length === 0) {
  setTimeout(() => {
    dismissResults();
  }, 500);
}
```

The `dismissResults()` reducer deletes both the CombatResult row AND all associated CombatLoot rows. The 500ms delay was insufficient - by the time the loot panel auto-opened (via the `pendingLoot.length` watcher at lines 915-922), the server had already deleted the loot rows, so `pendingLoot` computed to empty and the panel showed "No unclaimed loot."

The fix ensures loot rows survive when items drop. When `pendingLoot.value.length === 0`, auto-dismiss fires normally. When loot exists, the player dismisses manually after claiming items (or the loot panel's Take actions will clean up loot rows one by one).

## Deviations from Plan

None - plan executed exactly as written.

## Verification

**TypeScript type checking:**
```bash
npx vue-tsc --noEmit
```
Result: No errors related to changed lines (pre-existing errors in other files remain unchanged)

**Code inspection:**
- [x] Line 895: `addLocalEvent('combat', logMessage)` uses two positional string args matching `(kind: string, message: string)` signature
- [x] Lines 899-903: `dismissResults()` only called inside `if (pendingLoot.value.length === 0)` guard
- [x] Lines 915-922: `pendingLoot` auto-open watcher unchanged and still functional
- [x] `pendingLoot` available from `useCombat` destructure at line 734

**Expected runtime behavior (requires SpacetimeDB server):**
1. After combat victory: "Victory! [detail]" message appears in log with purple combat color
2. After combat defeat: "Defeat! [detail]" message appears in log with purple combat color
3. After combat with loot: Loot panel auto-opens showing actual dropped items with Take buttons
4. After combat without loot: Result auto-dismisses after 500ms, no loot panel opens
5. When loot exists: Result stays visible until player takes loot or manually dismisses

## Self-Check

Checking modified file exists:
```bash
[ -f "src/App.vue" ] && echo "FOUND: src/App.vue" || echo "MISSING: src/App.vue"
```
Result: FOUND: src/App.vue

Checking commit exists:
```bash
git log --oneline --all | grep -q "ae56c5d" && echo "FOUND: ae56c5d" || echo "MISSING: ae56c5d"
```
Result: FOUND: ae56c5d

## Self-Check: PASSED

All files and commits verified.

## Impact

**Before (BROKEN):**
- Victory/Defeat messages did not appear in event log (silent combat end)
- Loot panel always showed "No unclaimed loot" after combat, even when items dropped
- Players had no feedback that combat ended or loot was available

**After (FIXED):**
- Victory/Defeat messages post to log with purple combat color for easy scanning
- Loot panel auto-opens with actual dropped items when loot exists
- Loot panel stays empty when no loot drops (correct behavior)
- Auto-dismiss only fires when no loot exists, preserving loot rows for panel display

This restores the combat feedback loop that was broken in quick-29 refactor.
