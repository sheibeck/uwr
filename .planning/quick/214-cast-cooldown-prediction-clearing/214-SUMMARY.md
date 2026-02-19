---
phase: quick-214
status: complete
files_modified:
  - src/composables/useHotbar.ts
---

## Summary

Fixed cooldown display staying "stuck at max value" for abilities with both a cast time and a cooldown.

## Root Cause

The `abilityCooldowns` watcher in `useHotbar.ts` used `lastClearCheck = 0` as its initial value. This caused it to run on the very first `nowMicros` tick (100ms after clicking an ability) and check whether the server had confirmed the cooldown. For **cast-time abilities**, the server only sets `AbilityCooldown` after the cast completes — not when `use_ability` is received. At T+100ms the cast is still in progress, so `serverCooldownKeys` was empty. The watcher incorrectly cleared `localCooldowns` and `predictedCooldownReadyAt`, setting `hasPrediction = false`.

After the cast, with `hasPrediction = false`, the client used raw server data for the cooldown display. Any server clock skew (server clock ahead of client) caused `serverRemaining` to be much larger than expected (e.g., 11 seconds instead of 6 for a 5-second skew). The display clamped to `configuredCooldownSeconds` (6) and showed "6" for many seconds before decrementing to "5".

For **instant abilities**, the server immediately sets `AbilityCooldown` in the `use_ability` reducer (synchronously). By T+100ms the server subscription has already confirmed the cooldown, so `serverCooldownKeys.has(key) = true` and the prediction was preserved. `hasPrediction = true` suppressed potentially skewed server data throughout.

## Fix

Added two `continue` conditions in the `abilityCooldowns` watcher loop to skip clearing while the ability is actively being cast:

```typescript
if (localCast.value?.abilityKey === key) continue;
if (castingState.value?.abilityKey === key) continue;
```

- `localCast` check: prevents clearing during the client's local cast window (0 to castSeconds)
- `castingState` check: prevents clearing while the server-confirmed `CharacterCast` row exists (protects high-latency / delayed cast-tick scenarios)

After the cast completes, `characterCast` is deleted and `AbilityCooldown` is inserted in the same server transaction, so `serverCooldownKeys.has(key) = true` at the next watcher check. The prediction is preserved throughout and the cooldown counts down from the local clock, immune to server clock skew.

## Behavior After Fix

- **Cast-time ability (1s cast, 6s cooldown)**: cast bar animates for 1s, then cooldown counts 6→5→4→3→2→1→0 over 6s. Total cycle: 7s. No "stuck at 6" delay.
- **Instant ability**: unchanged — still starts counting immediately from click.
- **Failed ability**: still correctly cleared at the next watcher check after localCast expires (T+1.1s), making the button available.
