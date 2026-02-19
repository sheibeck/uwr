---
phase: quick-205
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/world_events.ts
  - spacetimedb/src/reducers/world_events.ts
autonomous: true
requirements:
  - AUTO-RESOLVE-TIME-EVENT
must_haves:
  truths:
    - "A time-based world event whose deadline has passed is automatically resolved to 'failed'"
    - "A non-time-based event (deadlineAtMicros === 0n) is not affected"
    - "If a time-based event is resolved manually before the deadline fires, the scheduled tick exits quietly"
  artifacts:
    - path: "spacetimedb/src/helpers/world_events.ts"
      provides: "fireWorldEvent schedules EventDespawnTick when deadlineAtMicros > 0n"
      contains: "ctx.db.eventDespawnTick.insert"
    - path: "spacetimedb/src/reducers/world_events.ts"
      provides: "despawn_event_content calls resolveWorldEvent, not despawnEventContent"
      contains: "resolveWorldEvent(ctx, event, 'failure')"
  key_links:
    - from: "spacetimedb/src/helpers/world_events.ts fireWorldEvent"
      to: "event_despawn_tick table"
      via: "ctx.db.eventDespawnTick.insert with ScheduleAt.time(deadlineAtMicros)"
      pattern: "eventDespawnTick\\.insert"
    - from: "event_despawn_tick scheduled table"
      to: "spacetimedb/src/reducers/world_events.ts despawn_event_content"
      via: "SpacetimeDB scheduled reducer invocation"
      pattern: "despawn_event_content"
    - from: "spacetimedb/src/reducers/world_events.ts despawn_event_content"
      to: "spacetimedb/src/helpers/world_events.ts resolveWorldEvent"
      via: "direct call with 'failure' outcome"
      pattern: "resolveWorldEvent\\(ctx, event, 'failure'\\)"
---

<objective>
Wire up automatic expiry of time-based world events via the existing EventDespawnTick scheduled table.

Purpose: When a time-based event's deadline passes the event currently stays active indefinitely. The EventDespawnTick table and despawn_event_content reducer exist but are not connected to the event firing path.

Output: Two file edits — fireWorldEvent schedules a tick at the deadline, and despawn_event_content calls resolveWorldEvent so status, consequences, and rewards are all applied correctly on auto-expiry.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schedule EventDespawnTick in fireWorldEvent and fix despawn_event_content reducer</name>
  <files>
    spacetimedb/src/helpers/world_events.ts
    spacetimedb/src/reducers/world_events.ts
  </files>
  <action>
**Edit 1 — spacetimedb/src/helpers/world_events.ts**

Add an import for `EventDespawnTick` from `'../schema/tables'` at the top of the file (alongside the existing imports). `ScheduleAt` is already imported from `'spacetimedb'` on line 1 — do NOT add a duplicate import.

After the `eventRow` insert (currently line 83, ending with the closing `)`), and before the `spawnEventContent` call, add:

```typescript
  // Schedule automatic expiry for time-based events
  if (deadlineAtMicros > 0n) {
    ctx.db.eventDespawnTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(deadlineAtMicros),
      eventId: eventRow.id,
    });
  }
```

This fires the `despawn_event_content` reducer at exactly `deadlineAtMicros`. Non-time-based events have `deadlineAtMicros === 0n` and are not affected.

---

**Edit 2 — spacetimedb/src/reducers/world_events.ts**

The current `despawn_event_content` reducer body (lines 162-168) calls `despawnEventContent(ctx, arg.eventId)` directly, which only removes content rows but does NOT update status, apply consequences, or award rewards.

Replace its body so it calls `resolveWorldEvent` instead:

```typescript
  // despawn_event_content — Scheduled reducer: auto-resolve time-based events on deadline.
  // resolveWorldEvent guards against double-resolve (exits if status !== 'active'),
  // so manual admin resolution before the deadline fires safely.
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

`resolveWorldEvent` is already imported (line 2). `despawnEventContent` import on line 2 can be removed if it is no longer used elsewhere in this file — check before removing.
  </action>
  <verify>
1. Run `spacetime publish uwr --project-path spacetimedb/` (or whatever the project's module name is). The publish must succeed with no TypeScript errors.
2. Fire a time-based event via admin reducer: `conn.reducers.fireWorldEvent({ eventKey: 'some_time_based_key' })`.
3. Observe the WorldEvent row has `status: 'active'` and `deadlineAtMicros` set to a future timestamp.
4. Confirm an `event_despawn_tick` row appears in the table with the matching `eventId` and `scheduledAt` equal to `deadlineAtMicros`.
5. After the deadline passes, confirm the WorldEvent row transitions to `status: 'failed'` automatically (without admin intervention), `resolvedAt` is set, and the `event_despawn_tick` row is gone.
6. Optionally: manually resolve the event via `resolveWorldEvent` before the deadline, then confirm when the tick fires (if observable) it exits without error and does not corrupt the already-resolved event.
  </verify>
  <done>
- `spacetime publish` succeeds (no TypeScript compile errors).
- Time-based events automatically transition to `status: 'failed'` when their deadline expires.
- `resolvedAt` is populated on auto-expiry.
- Non-time-based events (deadlineAtMicros === 0n) are unaffected.
- Events manually resolved before the tick fires remain in their resolved state without errors.
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation clean: `spacetime publish` exits 0
- EventDespawnTick row inserted when a time-based event fires (confirm via SpacetimeDB dashboard or logs)
- WorldEvent row transitions to 'failed' at deadline without manual intervention
- Logs show "World Event FAILED: ..." message at expiry time
</verification>

<success_criteria>
Time-based world events are automatically resolved to 'failed' when their deadline expires. The fix requires no schema changes (EventDespawnTick table already exists), only two targeted code edits. No --clear-database needed.
</success_criteria>

<output>
After completion, create `.planning/quick/205-when-an-event-timer-ends-automatically-e/205-SUMMARY.md`
</output>
