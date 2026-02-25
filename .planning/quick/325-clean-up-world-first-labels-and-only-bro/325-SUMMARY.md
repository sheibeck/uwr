---
phase: quick-325
plan: 01
subsystem: renown
tags: [world-first, broadcast, display-labels]
dependency_graph:
  requires: []
  provides: [first-only-broadcast, clean-display-labels]
  affects: [renown, combat, world-events]
tech_stack:
  added: []
  patterns: [optional-displayLabel-parameter]
key_files:
  modified:
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Only position 1 broadcasts world events (was positions 1-3)"
  - "displayLabel is optional param with fallback to category:key format"
metrics:
  duration: 63s
  completed: 2026-02-25
---

# Quick 325: Clean Up World First Labels and Only Broadcast Firsts

World-first broadcasts now only fire for actual firsts (position 1) and use clean display names instead of internal keys.

## Changes Made

### Task 1: Gate broadcasts to first-only and add displayLabel parameter (7ca0fdf)

**spacetimedb/src/helpers/renown.ts:**
- Added optional `displayLabel?: string` parameter to `awardServerFirst`
- Changed broadcast condition from `position <= 3n` to `position === 1n`
- Changed message format from `"was {ordinal} to {category}: {key}"` to `"achieved World First: {label}!"`
- Uses `displayLabel` if provided, falls back to `category: achievementKey` for callers that don't pass one
- Updated `grantAchievement` to pass `achievementDef.name` as displayLabel

**spacetimedb/src/reducers/combat.ts:**
- Boss kill `awardServerFirst` call now passes `${template.name} slain` as displayLabel

### Broadcast Examples

| Before | After |
|--------|-------|
| `Jouctas was first to boss_kill: boss_mirewalker_thane!` | `Jouctas achieved World First: Mirewalker Thane slain!` |
| `Jouctas was second to boss_kill: boss_mirewalker_thane!` | (no broadcast - silent) |
| `Jouctas was first to achievement: first_steps!` | `Jouctas achieved World First: First Steps!` |

### What Remains Unchanged
- `renown_server_first` table still records positions 1, 2, 3+
- Diminishing renown still awarded for 2nd/3rd (baseRenown / 2^(position-1))
- All other renown mechanics untouched

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 7ca0fdf | Gate world broadcasts to first-only and add displayLabel parameter |

## Self-Check: PASSED
