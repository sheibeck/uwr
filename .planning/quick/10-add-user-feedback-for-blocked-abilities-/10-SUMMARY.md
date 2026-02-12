---
phase: quick-10
plan: 01
subsystem: ui-hotbar-feedback
tags: [ux, combat, abilities, local-events]
dependency-graph:
  requires: [quick-6]
  provides: [client-side-event-system]
  affects: [hotbar-interactions, log-display]
tech-stack:
  added: [local-event-injection, client-scope-events]
  patterns: [client-side-messaging, ttl-based-cleanup]
key-files:
  created: []
  modified:
    - src/composables/useEvents.ts
    - src/composables/useHotbar.ts
    - src/ui/styles.ts
    - src/components/LogWindow.vue
    - src/App.vue
decisions:
  - decision: "Local events use BigInt IDs starting at 9000000000n to avoid collision with server IDs"
    rationale: "Server IDs are auto-incrementing from 1; high starting point ensures no overlap"
  - decision: "Local events skip session filter — always visible regardless of session timestamp"
    rationale: "Client-side messages are inherently part of current session context"
  - decision: "Client scope events display no scope prefix in LogWindow"
    rationale: "Messages like 'Cannot act yet' are self-explanatory and don't need [client blocked] prefix"
  - decision: "2-minute TTL for local events via watch-based cleanup"
    rationale: "Prevents unbounded memory growth; 2 minutes matches typical gameplay session attention span"
  - decision: "Terracotta color (#e07a5f) for blocked messages"
    rationale: "Muted warning tone — stands out but not aggressive like bright red"
metrics:
  duration: "2 minutes"
  completed: "2026-02-12T15:11:32Z"
  tasks: 1
  files: 5
  commits: 1
---

# Quick Task 10: Add User Feedback for Blocked Abilities Summary

**One-liner:** Client-side local event system with terracotta-colored feedback messages for combat state blocked abilities

---

## What Was Built

Added a client-side event injection system and wired it to provide immediate visual feedback when abilities are blocked by combat state restrictions (combat-only, out-of-combat-only, waiting for turn).

**Key Features:**
- Local event generation with unique high-range IDs (9000000000n+)
- Automatic TTL-based cleanup (2-minute retention)
- Distinct terracotta color (#e07a5f) for blocked messages
- Scope-aware rendering (client events show no prefix)
- Three feedback scenarios: combat-only blocked, out-of-combat-only blocked, turn-wait blocked

---

## Implementation Details

### 1. Local Event Infrastructure (`useEvents.ts`)

**Added:**
- `localEvents` ref to store client-generated events
- `addLocalEvent(kind, message)` function for injection
- ID counter starting at 9000000000n (avoids server ID collision)
- Watch-based cleanup: trims events older than 2 minutes (120_000_000 microseconds)
- Local events merged into `combinedEvents` computed, skip session filter

**Pattern:**
```typescript
const addLocalEvent = (kind: string, message: string) => {
  const id = localEventIdCounter++;
  const createdAt = { microsSinceUnixEpoch: BigInt(Date.now() * 1000) };
  localEvents.value.push({ id, createdAt, kind, message, scope: 'client' });
};
```

### 2. Blocked Ability Feedback (`useHotbar.ts`)

**Added:**
- `addLocalEvent` optional callback parameter to `UseHotbarArgs`
- Three feedback points in `onHotbarClick`:
  1. **Turn wait:** "Cannot act yet — waiting for combat turn."
  2. **Combat-only:** "[Ability] can only be used in combat."
  3. **Out-of-combat-only:** "[Ability] cannot be used during combat."

**Before:**
```typescript
if (combatState === 'combat_only' && !activeCombat.value) return; // Silent
```

**After:**
```typescript
if (combatState === 'combat_only' && !activeCombat.value) {
  addLocalEvent?.('blocked', `${ability?.name ?? slot.name} can only be used in combat.`);
  return;
}
```

### 3. Visual Styling (`styles.ts`, `LogWindow.vue`)

**Added:**
- `logBlocked` style: `color: '#e07a5f'` (muted terracotta/warning)
- Conditional scope prefix logic in LogWindow:
  - `event.scope === 'group'` → `[Group]`
  - `event.scope === 'client'` → `` (empty, no prefix)
  - Otherwise → `[${event.scope} ${event.kind}]`
- `event.kind === 'blocked'` applies `logBlocked` style

**Color Rationale:** #e07a5f is softer than error red (#ff6b6b) but still distinct from normal log text — appropriate for "blocked action" vs "system error".

### 4. Wiring (`App.vue`)

**Changes:**
- Extract `addLocalEvent` from `useEvents` destructuring
- Pass `addLocalEvent` to `useHotbar` call

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Testing Evidence

**Build Verification:**
```
✓ npx vite build succeeded
✓ 419 modules transformed
✓ dist/assets/index-DBSv7irA.js 380.07 kB (98.15 kB gzip)
```

**Expected Behavior:**
1. Click a pet summon ability (combat-only) while out of combat → terracotta message: "[Pet Name] can only be used in combat."
2. Click Nature's Mark (out-of-combat-only) while in combat → terracotta message: "Nature's Mark cannot be used during combat."
3. Click any ability while waiting for combat turn → terracotta message: "Cannot act yet — waiting for combat turn."
4. No false cooldown animations appear when abilities are blocked (existing behavior preserved from quick-6).

---

## Reusability

**Local Event System:**
The `addLocalEvent` infrastructure is now available for any future client-side messages:
- Validation failures (e.g., "Not enough gold")
- Client-side confirmations (e.g., "Item favorited")
- Tutorial hints
- Client-detected errors (e.g., "Connection lost")

**Pattern:**
```typescript
addLocalEvent('info', 'Custom client message here');
addLocalEvent('warning', 'Client warning here');
addLocalEvent('blocked', 'Action blocked here');
```

All will render in the log with appropriate timestamp and interleave with server events.

---

## Self-Check: PASSED

**Files created:** None
**Files modified:**
- ✓ `src/composables/useEvents.ts` exists
- ✓ `src/composables/useHotbar.ts` exists
- ✓ `src/ui/styles.ts` exists
- ✓ `src/components/LogWindow.vue` exists
- ✓ `src/App.vue` exists

**Commit verification:**
- ✓ Commit `0ac90bb` exists: `feat(quick-10): add user feedback for blocked abilities`

**Code verification:**
- ✓ `useEvents.ts` exports `addLocalEvent`
- ✓ `useEvents.ts` contains `localEvents` ref and cleanup watch
- ✓ `useHotbar.ts` contains three `addLocalEvent?.()` calls
- ✓ `styles.ts` contains `logBlocked: { color: '#e07a5f' }`
- ✓ `LogWindow.vue` contains client scope handling and blocked kind style
- ✓ `App.vue` passes `addLocalEvent` to `useHotbar`

---

## Impact

**User Experience:**
- **Before:** Clicking blocked abilities = silence. No indication why nothing happened. Confusing UX.
- **After:** Immediate, clear, visually distinct feedback explaining exactly why the ability didn't fire.

**Developer Experience:**
- Client-side event system now available for future features without server round-trip.
- Pattern established for local feedback messages.

**No Regressions:**
- Existing cooldown prevention from quick-6 preserved (no false cooldowns on blocked abilities).
- No changes to server-side event handling.
- Local events auto-clean after 2 minutes (no memory leaks).

---

## Related Work

- **Quick Task 6:** Established combat state restrictions (combatState field on AbilityTemplate). This task adds user feedback for those restrictions.
- **Future:** Could extend local event system for client-side validation feedback, tutorial systems, or client-detected network issues.

---

## Commits

| Hash    | Message                                           |
|---------|---------------------------------------------------|
| 0ac90bb | feat(quick-10): add user feedback for blocked abilities |
