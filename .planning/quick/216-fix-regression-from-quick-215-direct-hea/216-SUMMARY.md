---
phase: quick-216
plan: "01"
subsystem: combat
tags: [healing, bug-fix, regression, resource-deduction]
dependency_graph:
  requires: [quick-215]
  provides: [working-heal-hp-update, single-hot-spirit-mender]
  affects: [combat]
tech_stack:
  added: []
  patterns: [re-fetch-before-update]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
decisions:
  - "Re-fetch character from DB after runAbility() before resource deduction to preserve any HP changes made by abilities"
  - "Use original character.mana/stamina for cost calculation since runAbility() does not modify caster resources"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-19"
  tasks_completed: 3
  files_modified: 1
---

# Phase quick-216 Plan 01: Fix Regression from quick-215 Direct Heal Summary

Fixed two bugs in `spacetimedb/src/helpers/combat.ts` that caused healing spells to silently not update HP: stale character snapshot overwrote healed HP during resource deduction, and Spirit Mender applied a double HoT after quick-215 added internal HoT handling to `applyHeal`.

## What Was Built

### Bug 1 Fixed: Stale character snapshot overwriting healed HP

The `executeAbilityAction` function captures a `character` snapshot at the top of the function. After `runAbility()` heals the target (for self-heals, modifying the DB row), the resource deduction block was spreading `...character` — the original pre-heal snapshot — overwriting the healed HP back to its original value.

Fix: re-fetch the latest character row from DB immediately before each resource deduction update:

```typescript
// Before (broken)
ctx.db.character.id.update({ ...character, mana: character.mana - resourceCost });

// After (fixed)
const latest = ctx.db.character.id.find(character.id);
if (latest) ctx.db.character.id.update({ ...latest, mana: character.mana - resourceCost });
```

The original `character.mana` is still used for the cost calculation since `runAbility()` never modifies the caster's mana, but the HP (and all other fields) now come from the freshly-fetched `latest` row.

### Bug 2 Fixed: Double HoT on Spirit Mender

After quick-215 added `hotPowerSplit` support to `applyHeal()`, the `shaman_spirit_mender` switch case still had an explicit `addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, 'Spirit Mender')` call after `applyHeal()`. This created two regen effects instead of one.

Fix: removed the explicit `addCharacterEffect` call from the switch case. `applyHeal()` now handles the HoT internally.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b9e52dc | fix(quick-216): re-fetch character from DB before mana/stamina deduction |
| 2 | 08c80ea | fix(quick-216): remove duplicate HoT addCharacterEffect from shaman_spirit_mender |
| 3 | (publish) | Module published to local SpacetimeDB — no panics |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `grep -n "latest.*ctx.db.character.id.find"` returns 2 matches (mana and stamina branches)
- `grep -n "update.*\.\.\.character.*(mana|stamina)"` returns no matches
- `grep -n "addCharacterEffect.*regen.*5n.*2n.*Spirit Mender"` returns no matches
- Module published successfully with no PANIC lines in logs

## Self-Check: PASSED

- `spacetimedb/src/helpers/combat.ts` modified and committed
- Commit b9e52dc exists in git log
- Commit 08c80ea exists in git log
- Module published (logs show "Database updated" at 19:57:31)
