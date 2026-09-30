---
created: 2026-09-30T01:11:01.826Z
title: Require admin for increment_event_counter reducer
area: backend
priority: high
files:
  - spacetimedb/src/reducers/world_events.ts:118-150
  - spacetimedb/src/data/admin.ts
---

## Problem

`increment_event_counter` (`spacetimedb/src/reducers/world_events.ts:118`) is a public reducer with **no admin check**. Any connected client can call it with any `eventId`, `side` ('success'/'failure') and `amount`. That bumps a `threshold_race` world event's counter, and `resolveWorldEvent` fires once the threshold is reached. A player could therefore force-resolve or sabotage world events for everyone.

The two other admin-style reducers in the same file already call `requireAdmin(ctx)` (lines 13 and 27). This one doesn't. No client code calls it outside the generated bindings. Its comment says combat and objective hooks use it, but server code can't call a reducer, so those hooks would need a shared helper rather than the reducer.

## Solution

- Add `requireAdmin(ctx);` as the first statement of the `increment_event_counter` handler. The user asked for "requiresAdmin()"; the existing helper is `requireAdmin(ctx)` from `../data/admin`, already imported in this file.
- If a server-side hook needs to increment counters, extract the body into a helper such as `incrementEventCounter(ctx, eventId, side, amount)` in `helpers/world_events.ts`. Keep the reducer as an admin-only wrapper around it.
- Add unit tests, following the project rule that every change ships tests. With `createMockCtx`:
  - a non-admin sender gets `SenderError('Admin only')`
  - an admin sender increments the counter as before
- Also check the other reducers in `world_events.ts` and nearby files for any other admin or test reducers that lack `requireAdmin`.
- Publish locally only (`spacetime publish uwr -p spacetimedb`). This is a code-only change, so no `--clear-database`. The user decides when to publish to maincloud.
