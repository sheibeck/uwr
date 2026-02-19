---
phase: quick-191
plan: 01
subsystem: client-ui
tags: [admin, world-events, ui, panel]
dependency_graph:
  requires: [WorldEventPanel.vue, App.vue, module_bindings/fire_world_event_reducer, module_bindings/resolve_world_event_reducer]
  provides: [src/data/worldEventDefs.ts, WorldEventPanel Admin tab]
  affects: [WorldEventPanel.vue, App.vue]
tech_stack:
  added: [src/data/worldEventDefs.ts]
  patterns: [isAdmin computed from window.__my_identity, admin-gated v-if tab]
key_files:
  created: [src/data/worldEventDefs.ts]
  modified: [src/components/WorldEventPanel.vue, src/App.vue]
decisions:
  - Admin identity check uses window.__my_identity.toHexString() === ADMIN_IDENTITY_HEX (client-side only, gate is cosmetic)
  - isEventActive matches active events by name (not by key) since WorldEvent rows store name from eventDef at fire time
  - endEvent always passes outcome='failure' per spec — no success-outcome admin path needed
metrics:
  duration: 3 minutes
  completed: 2026-02-19
  tasks_completed: 2
  files_changed: 3
---

# Phase quick-191 Plan 01: Admin World Events Tab Summary

Admin-only third tab in WorldEventPanel for firing and resolving world events from the UI using client-side identity gate.

## What Was Built

- `src/data/worldEventDefs.ts`: Client-side event definition metadata (keys, names, regionKey, isRecurring) for all 3 defined world events, plus `ADMIN_IDENTITY_HEX` constant matching `spacetimedb/src/data/admin.ts`
- `WorldEventPanel.vue`: Added `isAdmin: boolean` prop, third "Admin" tab button (`v-if="isAdmin"`), and Admin tab content showing event definitions with Start Event buttons and active events with End Event (Failure) buttons
- `App.vue`: Added `ADMIN_IDENTITY_HEX` import, `isAdmin` computed using `window.__my_identity`, and `:is-admin="isAdmin"` prop on `WorldEventPanel`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 34c2f53 | feat(quick-191): create worldEventDefs.ts with client-side event metadata |
| 2 | 76059c2 | feat(quick-191): add Admin tab to WorldEventPanel and wire isAdmin prop in App.vue |

## Verification

- Vite build: 530 modules transformed, built in 5.58s — no errors
- Admin tab only renders when `window.__my_identity?.toHexString() === ADMIN_IDENTITY_HEX`
- Start Event calls `db.reducers.fireWorldEvent({ eventKey })` with correct object syntax
- End Event calls `db.reducers.resolveWorldEvent({ worldEventId, outcome: 'failure' })` with correct object syntax
- Already-active events show disabled "Already Active" button via `isEventActive()` name match

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- src/data/worldEventDefs.ts exists: confirmed (created by Task 1)
- 34c2f53 commit exists: confirmed
- 76059c2 commit exists: confirmed
- isAdmin prop wired in App.vue: confirmed at line 214
- Admin tab gated by v-if="isAdmin": confirmed at line 7 of template
