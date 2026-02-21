---
phase: 264-remove-groupcount-from-pull-logic-adds-c
plan: "01"
subsystem: combat
tags: [pull-logic, groupCount, adds, resolve_pull]
dependency_graph:
  requires: []
  provides: [resolve_pull-groupCount-free-add-logic]
  affects: [combat]
tech_stack:
  added: []
  patterns: [candidates-only-add-iteration]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "maxAdds = candidates.length only (no groupCount component)"
  - "reserveAdds iterates candidates directly, checks state=available, sets state=engaged+lockedCombatId"
  - "roleTemplateId set to undefined in reserveAdds so addEnemyToCombat falls back to pickRoleTemplate"
  - "takeSpawnMember definition and its call in addEnemyToCombat left untouched"
metrics:
  duration: "5 minutes"
  completed: "2026-02-21"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 264 Plan 01: Remove groupCount from Pull Logic Summary

Retired groupCount from the resolve_pull reducer. Adds now come exclusively from the location's available social spawn candidates — the group-member block (takeSpawnMember on pull spawn or candidates) is fully removed.

## What Was Done

- **Edit 1 (log message):** Removed `(group size ${spawn.groupCount})` from the private pull-start log string
- **Edit 2 (maxAdds):** Replaced 3-line `initialGroupCount`/`groupAddsAvailable`/`maxAdds` block with `const maxAdds = candidates.length`
- **Edit 3 (reserveAdds):** Replaced the full reserveAdds function body — removed group-take loop and takeSpawnMember calls; new body iterates candidates only, checks `state === 'available'`, sets `state: 'engaged'` + `lockedCombatId`, pushes `{ spawn: candidateSpawn, roleTemplateId: undefined }`
- **Edit 4 (remainingGroup):** Removed all three `const remainingGroup = ...groupCount...` dead assignments from the partial, failure, and success branches

## Verification

- `initialGroupCount` — zero results in file
- `groupAddsAvailable` — zero results in file
- `remainingGroup` — zero results in file
- `groupCount` — not present in resolve_pull body (lines 930-1131)
- `takeSpawnMember` — appears only at definition (line 53) and in addEnemyToCombat (line 83)
- Module published to local SpacetimeDB without errors: "Build finished successfully"

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- spacetimedb/src/reducers/combat.ts: all four edits confirmed present
- Module: compiled and published successfully
- Forbidden patterns: none found
