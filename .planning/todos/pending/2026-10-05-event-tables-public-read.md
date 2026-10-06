---
created: 2026-10-05T00:00:00.000Z
title: Event tables are public: any client can read other players' private lines
area: backend
priority: high
files:
  - spacetimedb/src/schema/tables.ts:1362-1415 (event_location, event_private, event_group definitions)
---

## Problem

`event_private`, `event_location` and `event_group` are declared `public: true` (`spacetimedb/src/schema/tables.ts`, near lines 1362 to 1415, all `event: true` tables). `event_world` is public too, but its lines are meant for every player (ripples), so it is not part of this problem. Because the other three are public, any connected client can subscribe to them without a filter and read every row: whispers, private Keeper narration, location lines that exclude a character, and party chat of other groups.

The Phase 47 client subscribes with filters (`event_private` by owner and character, `event_location` by the current location, `event_group` by the character's group) and applies a second client-side filter in `src/console/feedStore.ts` (`acceptRow`). That reduces noise, it is not enforcement: a hostile or modified client simply skips the filters. Recorded as research Open Question 6 and threat T-47-04b (transferred from Phase 47, which is client-only and changes nothing under `spacetimedb/`).

## Solution

Sketch only; check every API against the SpacetimeDB 2.10 TypeScript docs before using it, and do not invent any.

- Make the three tables private (drop `public: true`) and expose per-sender projections: public views that read the private table by index lookup only (`by_owner_user`, `by_character`, `by_location`, `by_group`), using `ctx.sender` to resolve the caller's character and group. Views cannot scan tables (CLAUDE.md), so each projection must go through an existing index.
- Alternatively use row-level security if it is available for event tables in 2.10; confirm first.
- Two-publish migration: first add the views and move the client subscriptions to them, then flip the tables private once no client uses the old subscriptions. Regenerate bindings (`pnpm spacetime:generate`) and update the client subscription list and `feedStore` source names together.
- Tests: a caller never receives another character's `event_private` row, a location row that excludes the caller is hidden, and group rows reach only members of that group.
- Publish locally only (`pnpm spacetime:publish`); never maincloud automatically, and never `--clear-database` (the change alters visibility and adds views, not columns).
