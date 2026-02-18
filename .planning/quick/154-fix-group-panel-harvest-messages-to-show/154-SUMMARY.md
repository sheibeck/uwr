---
phase: quick-154
plan: 01
subsystem: gathering
tags: [group-log, gather, ux, quick-fix]
dependency_graph:
  requires: []
  provides: [correct-group-gather-start-message]
  affects: [group-panel-log, start_gather_resource]
tech_stack:
  added: []
  patterns: [logPrivateAndGroup-5th-arg]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/items.ts
decisions:
  - "Added groupMessage 5th arg to logPrivateAndGroup in start_gather_resource, matching pattern already used by finish_gather and take_loot"
metrics:
  duration: ~2min
  completed: 2026-02-18
---

# Quick Task 154: Fix Group Panel Harvest Messages to Show Character Name

## One-liner

Added group message to `start_gather_resource` `logPrivateAndGroup` call so group members see "{character.name} begins gathering {node}." instead of "You begin gathering {node}."

## What Was Done

### Task 1: Add group message to start_gather_resource logPrivateAndGroup call

**File:** `spacetimedb/src/reducers/items.ts` (lines 804-810)

The `logPrivateAndGroup` call in `start_gather_resource` was missing the optional 5th `groupMessage` argument. When `groupMessage` is omitted, the function falls back to `groupMessage ?? privateMessage`, which caused group members to see "You begin gathering X." — the first-person private message — instead of a third-person message with the character's name.

**Fix:** Added the 5th argument:

```typescript
logPrivateAndGroup(
  ctx,
  character,
  'system',
  `You begin gathering ${node.name}.`,
  `${character.name} begins gathering ${node.name}.`
);
```

This follows the identical pattern already used by:
- `finish_gather` (line 857-862): `${character.name} gathers ${node.name} x${quantity}.`
- `take_loot` (line 322-327): same 5-arg pattern

**Commit:** e160b43

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `grep -n "begins gathering" spacetimedb/src/reducers/items.ts` shows both the private ("You begin...") and group ("${character.name} begins...") messages on lines 808-809.
- Pre-existing TypeScript errors in the module are unrelated to this change (implicit `any` types throughout, pre-existing).
- Module can be published: `spacetime publish uwr --project-path spacetimedb`

## Self-Check: PASSED

- File modified: `spacetimedb/src/reducers/items.ts` — FOUND
- Commit e160b43 — FOUND
