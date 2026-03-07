# Quick Task 333: Fix stuck Entering The Realm screen

**Date:** 2026-03-07
**Status:** Complete

## Problem

User was stuck on the "Entering the realm..." loading screen. This screen shows when `isPendingLogin` is true — meaning a stored auth token exists but the `player.userId` hasn't been set yet.

## Root Cause

The server module was out of sync with the client bindings after Phase 28 changes. Phase 28 added new columns to `ability_template` (scaling, value_1, value_2, effect_type, effect_magnitude, effect_duration, level_required, is_generated) and regenerated client bindings, but the module was never republished. The stale server module couldn't serve the updated client properly.

## Fix

Republished the module with `--clear-database`:
```bash
spacetime publish uwr -p spacetimedb --clear-database -y
```

No code changes required — this was an operational issue.

## Key Files Investigated

- `src/App.vue:14` — "Entering the realm..." loading screen
- `src/composables/useAuth.ts:24` — `isPendingLogin` logic
- `src/composables/usePlayer.ts` — player computed from subscription
- `src/composables/data/useCoreData.ts` — subscription setup
- `spacetimedb/src/reducers/auth.ts` — `login_email` reducer
- `spacetimedb/src/index.ts:987` — `clientConnected` handler
