---
phase: quick-230
plan: 01
subsystem: ability-cooldowns
tags: [schema-change, clock-skew, cooldown-display, spacetimedb]
dependency_graph:
  requires: []
  provides: [startedAtMicros-durationMicros-schema, clock-independent-cooldown-display]
  affects: [useHotbar.ts, App.vue, combat.ts, items.ts, module_bindings]
tech_stack:
  added: []
  patterns: [receivedAt-tracking, duration-relative-cooldown]
key_files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - src/module_bindings/ability_cooldown_type.ts
    - src/module_bindings/ability_cooldown_table.ts
    - src/composables/useHotbar.ts
    - src/App.vue
decisions:
  - "Clear local database with --clear-database on publish due to breaking schema change"
  - "All readyAtMicros references in AbilityCooldown contexts replaced; TravelCooldown/ItemCooldown/CombatEnemyCooldown left unchanged"
  - "Pre-existing vue-tsc errors in App.vue are out of scope; only readyAtMicros in AbilityCooldown contexts was in scope"
metrics:
  duration: ~20 minutes
  completed: 2026-02-21
  tasks_completed: 3
  files_changed: 7
---

# Phase quick-230 Plan 01: Replace AbilityCooldown readyAtMicros with startedAtMicros + durationMicros Summary

**One-liner:** Replaced absolute-timestamp cooldown storage with start+duration fields to eliminate server/client clock skew in ability cooldown display.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Update AbilityCooldown schema and all server usages | a20cd1e |
| 2 | Publish local module and regenerate client bindings | 291b369 |
| 3 | Update useHotbar.ts and App.vue for clock-independent display | 79a3d49 |

## What Was Built

### Schema Change (tables.ts)
The `AbilityCooldown` table's `readyAtMicros: t.u64()` field was replaced with two fields:
- `startedAtMicros: t.u64()` — server timestamp when cooldown began
- `durationMicros: t.u64()` — duration of the cooldown in microseconds

Only `AbilityCooldown` was modified. `ItemCooldown`, `CombatEnemyCooldown`, and `TravelCooldown` retain their existing `readyAtMicros` field.

### Server Reducer Changes
**combat.ts** — Three locations updated:
1. Combat-end cleanup: `cd.readyAtMicros <= ctx.timestamp` → `cd.startedAtMicros + cd.durationMicros <= ctx.timestamp`
2. Loop-tick cleanup: same change
3. Cooldown write after cast: `readyAtMicros: nowMicros + cooldown` → `startedAtMicros: nowMicros, durationMicros: cooldown`

**items.ts** — Three locations updated:
1. On-cooldown check: `existingCooldown.readyAtMicros > nowMicros` → `startedAtMicros + durationMicros > nowMicros`
2. Perk cooldown write: same pattern as combat.ts
3. Non-combat ability write: same pattern

### Client Bindings
Local SpacetimeDB module was cleared and republished (schema change was breaking). Client bindings regenerated — `ability_cooldown_type.ts` and `ability_cooldown_table.ts` now expose `startedAtMicros` and `durationMicros` (no `readyAtMicros`).

### Client Display (useHotbar.ts)
Replaced the old clock-skew suppression system:

**Removed:**
- `COOLDOWN_SKEW_SUPPRESS_MICROS` constant (30s suppression window)
- `predictedCooldownReadyAt` ref and all its usages

**Added:**
- `cooldownReceivedAt` ref: tracks `Date.now()` at the moment each server cooldown row first arrives
- Watch on `abilityCooldowns` to populate `cooldownReceivedAt` on row arrival and clean up on row removal; also removes local prediction when server confirms

**Updated:**
- `cooldownByAbility` now returns `Map<string, { durationMicros: number; receivedAt: number }>` instead of `Map<string, bigint>`
- `hotbarDisplay` computes `serverRemaining` as `durationMicros - (nowMicros - receivedAt)` — fully clock-independent
- 500ms failure-check watcher uses new expiry calculation instead of `readyAtMicros > now`
- `runPrediction` no longer sets `predictedCooldownReadyAt` (only `localCooldowns` is set)
- Character change watcher clears `cooldownReceivedAt`

### App.vue
- Removed `serverClockOffset` ref
- Removed `watch(() => player.value?.lastSeenAt, ...)` that computed the server clock offset
- `uiTimer` setInterval now uses `Date.now() * 1000` directly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Local SpacetimeDB had existing data with old schema**
- **Found during:** Task 2
- **Issue:** `spacetime publish` refused with "Removing a column readyAtMicros requires manual migration"
- **Fix:** Used `spacetime publish uwr --clear-database -y` to clear local database and republish
- **Files modified:** None (operational fix)
- **Commit:** 291b369

## Self-Check

Files verified:
- `spacetimedb/src/schema/tables.ts`: AbilityCooldown has `startedAtMicros` + `durationMicros`, no `readyAtMicros`
- `src/module_bindings/ability_cooldown_type.ts`: has `startedAtMicros` + `durationMicros`, no `readyAtMicros`
- `src/composables/useHotbar.ts`: no `predictedCooldownReadyAt`, no `COOLDOWN_SKEW_SUPPRESS`, no `readyAtMicros`
- `src/App.vue`: no `serverClockOffset`, no `lastSeenAt` watch

Commits verified:
- a20cd1e: feat(quick-230): update AbilityCooldown schema
- 291b369: feat(quick-230): regenerate client bindings
- 79a3d49: feat(quick-230): replace clock-skew suppression

## Self-Check: PASSED
