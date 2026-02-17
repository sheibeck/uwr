---
phase: quick-148
plan: 01
subsystem: gathering-system
tags: [perk, gathering, gatherSpeedBonus, cast-duration, items]
dependency_graph:
  requires: [spacetimedb/src/reducers/items.ts, spacetimedb/src/helpers/renown.ts]
  provides: [functional gatherSpeedBonus perk effect on gather cast duration]
  affects: [start_gather_resource, ResourceGatherTick scheduling]
tech_stack:
  added: []
  patterns: [getPerkBonusByField lookup before scheduled timer calculation, BigInt math for duration scaling]
key_files:
  modified:
    - spacetimedb/src/reducers/items.ts
    - .planning/phases/20-perk-variety-expansion/20-VERIFICATION.md
decisions:
  - gatherSpeedBonus reduces RESOURCE_GATHER_CAST_MICROS (8s base) proportionally — e.g. 15% bonus gives 6.8s cast, 20% gives 6.4s
  - Minimum gather duration clamped to 500ms to prevent zero/negative scheduled timer values
  - getPerkBonusByField called in start_gather_resource (not finish_gather) so the scheduled timer is set correctly from the start
metrics:
  duration: ~2min
  completed: 2026-02-17
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 148: Fix gatherSpeedBonus to Apply to Gather Cast Duration

**One-liner:** gatherSpeedBonus perk field wired in start_gather_resource to reduce the 8-second gather cast duration proportionally with a 500ms minimum floor.

## What Was Done

### Task 1: Apply gatherSpeedBonus to gather cast duration

Modified `start_gather_resource` in `spacetimedb/src/reducers/items.ts` to read `gatherSpeedBonus` via `getPerkBonusByField` before computing `endsAt` for the gather scheduled timer.

Before:
```typescript
const endsAt = ctx.timestamp.microsSinceUnixEpoch + RESOURCE_GATHER_CAST_MICROS;
```

After:
```typescript
const gatherSpeedBonus = getPerkBonusByField(ctx, character.id, 'gatherSpeedBonus', character.level);
const rawGatherDuration = BigInt(Math.round(Number(RESOURCE_GATHER_CAST_MICROS) * (1 - gatherSpeedBonus / 100)));
const gatherDurationMicros = rawGatherDuration < 500_000n ? 500_000n : rawGatherDuration;
const endsAt = ctx.timestamp.microsSinceUnixEpoch + gatherDurationMicros;
```

Perks now functional:
- Efficient Hands (rank 3): +15% speed → 6.8s cast (was 8s)
- Master Harvester (rank 5): +10% speed → 7.2s cast (was 8s)
- Resourceful (rank 8): +20% speed → 6.4s cast (was 8s)
- Characters with all three: +45% speed → 4.4s cast (was 8s)

The module build compiles successfully. The publish encountered a pre-existing migration constraint (`recipe_template` requires default values for new columns) unrelated to this change.

**Commit:** 1a3ffca

### Task 2: Fix VERIFICATION.md — remove false "gathering is instant" claim

Updated `.planning/phases/20-perk-variety-expansion/20-VERIFICATION.md`:
- Removed: "apply to a gather cooldown or document as deferred (gathering is instant, no cooldown to reduce)"
- Updated frontmatter gap reason: gatherSpeedBonus now noted as resolved via quick-148
- Split Gap 1 into Gap 1a (gatherSpeedBonus — RESOLVED) and Gap 1b (craftQualityBonus — remaining)
- Updated truth 7, artifacts table, and anti-patterns entry accordingly

**Commit:** 4e80639

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: spacetimedb/src/reducers/items.ts
- FOUND: .planning/phases/20-perk-variety-expansion/20-VERIFICATION.md
- FOUND commit: 1a3ffca (Task 1 - gatherSpeedBonus applied)
- FOUND commit: 4e80639 (Task 2 - VERIFICATION.md updated)
