---
phase: quick-205
plan: 01
subsystem: world-events
tags: [world-events, scheduled-reducers, auto-expiry, spacetimedb]
dependency_graph:
  requires: [EventDespawnTick table (18-01), despawn_event_content reducer (18-01), resolveWorldEvent helper (18-01)]
  provides: [automatic time-based world event expiry via scheduled tick]
  affects: [spacetimedb/src/helpers/world_events.ts, spacetimedb/src/reducers/world_events.ts]
tech_stack:
  added: []
  patterns: [SpacetimeDB scheduled reducer, ScheduleAt.time(), guard-on-status pattern for idempotent auto-resolve]
key_files:
  modified:
    - spacetimedb/src/helpers/world_events.ts
    - spacetimedb/src/reducers/world_events.ts
decisions:
  - resolveWorldEvent used (not despawnEventContent) so status, consequences, and rewards are all applied on auto-expiry
  - despawnEventContent import removed from reducers file — no longer called directly from this file
  - EventDespawnTick import not added to helpers file — ctx.db.eventDespawnTick.insert() uses runtime lookup, no TypeScript symbol needed
  - resolveWorldEvent status !== 'active' guard provides safe idempotency for manual-before-deadline resolution
metrics:
  duration: ~4min
  completed: 2026-02-19
  tasks: 1
  files: 2
---

# Phase quick-205 Plan 01: Auto-resolve time-based world events on deadline

**One-liner:** Wire existing EventDespawnTick scheduled table into fireWorldEvent so time-based events automatically resolve to 'failed' at their deadline via resolveWorldEvent.

## What Was Built

Two targeted code edits connecting the existing (but disconnected) EventDespawnTick scheduled table to the world event firing path:

**Edit 1 — `spacetimedb/src/helpers/world_events.ts`**

After inserting the WorldEvent row, `fireWorldEvent` now schedules an `eventDespawnTick` row when `deadlineAtMicros > 0n`:

```typescript
if (deadlineAtMicros > 0n) {
  ctx.db.eventDespawnTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(deadlineAtMicros),
    eventId: eventRow.id,
  });
}
```

`ScheduleAt` was already imported on line 1. No new import needed in the helper file (the DB access uses the runtime `ctx.db.eventDespawnTick` path, not the TypeScript symbol).

**Edit 2 — `spacetimedb/src/reducers/world_events.ts`**

The `despawn_event_content` scheduled reducer body was changed from calling `despawnEventContent(ctx, arg.eventId)` (which only deleted content rows) to calling `resolveWorldEvent(ctx, event, 'failure')` (which updates status, applies consequences, awards tiered rewards, logs resolution, then despawns content):

```typescript
spacetimedb.reducer(
  'despawn_event_content',
  { arg: EventDespawnTick.rowType },
  (ctx: any, { arg }: any) => {
    const event = ctx.db.worldEvent.id.find(arg.eventId);
    if (!event || event.status !== 'active') return;
    resolveWorldEvent(ctx, event, 'failure');
  }
);
```

The `despawnEventContent` import was removed from the import line as it is no longer referenced in this file.

## Verification

- `spacetime publish uwr --project-path C:\projects\uwr\spacetimedb` completed with "Build finished successfully." — no TypeScript errors.
- Module published successfully to local server.

## Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Time-based event deadline passes | Event stays `status: 'active'` forever | Event automatically transitions to `status: 'failed'` |
| `resolvedAt` field | Never set on auto-expiry | Set at deadline by resolveWorldEvent |
| Consequences applied | Never on auto-expiry | Failure consequences applied at deadline |
| Rewards awarded | Never on auto-expiry | Tiered failure rewards awarded at deadline |
| Non-time-based event (deadlineAtMicros === 0n) | Unaffected | Still unaffected |
| Event manually resolved before deadline | N/A | Tick fires, finds status !== 'active', exits quietly |

## Deviations from Plan

None — plan executed exactly as written. The only minor deviation is that the `EventDespawnTick` import was NOT added to `helpers/world_events.ts` (the plan said to add it) because the TypeScript symbol is unused in that file — the DB access goes via `ctx.db.eventDespawnTick.insert()`. Adding an unused import would have caused a TypeScript unused-import warning or error.

## Self-Check: PASSED

- `spacetimedb/src/helpers/world_events.ts` — modified with scheduling block
- `spacetimedb/src/reducers/world_events.ts` — modified with resolveWorldEvent body
- Commit `5445f3e` exists: `feat(quick-205): wire EventDespawnTick to auto-resolve time-based world events`
- Build succeeded (no TypeScript errors)
