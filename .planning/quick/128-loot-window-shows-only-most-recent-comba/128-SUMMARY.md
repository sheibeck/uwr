---
phase: 128
plan: 01
subsystem: combat-loot
tags: [loot, combat, cleanup, bug-fix]
dependency_graph:
  requires: []
  provides: [stale-loot-cleanup]
  affects: [combat_loot, combat_result]
tech_stack:
  added: []
  patterns: [by_character index lookup, Set deduplication for stale combatIds]
key_files:
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - Delete stale loot before inserting new loot (not after) so the loot window is always clean when new items arrive
  - Use by_character index (not .iter()) for the stale loot query — consistent with CLAUDE.md view/index rules
  - Scoped per-character — each participant only has their own old loot deleted, not other players'
  - Orphaned CombatResult cleanup uses by_owner_user filter + manual characterId/combatId checks to avoid broken multi-column index
metrics:
  duration: ~1min
  completed: 2026-02-17
  tasks: 1
  files: 1
---

# Quick Task 128: Loot Window Shows Only Most Recent Combat Summary

**One-liner:** Delete stale per-character CombatLoot and orphaned CombatResult rows before inserting new loot so the loot window accumulates no stale items across combats.

## What Was Done

Added a stale-loot cleanup block inside the victory loot distribution loop in `spacetimedb/src/reducers/combat.ts`. The cleanup executes for each participant immediately after the character null check and before the new loot insertion loop.

### Logic Added (lines 2182-2196)

```typescript
// Clear stale CombatLoot rows from previous combats so the loot window
// only ever shows items from the most recent combat.
const staleLoot = [...ctx.db.combatLoot.by_character.filter(character.id)];
const staleCombatIds = new Set(staleLoot.map(row => row.combatId));
for (const row of staleLoot) {
  ctx.db.combatLoot.id.delete(row.id);
}
// Clean up orphaned CombatResult rows for those old combats (this character only).
for (const oldCombatId of staleCombatIds) {
  for (const result of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
    if (result.combatId === oldCombatId && result.characterId === character.id) {
      ctx.db.combatResult.id.delete(result.id);
    }
  }
}
```

### Placement

- AFTER `if (!character) continue;` — character is guaranteed non-null
- BEFORE `for (const template of enemyTemplates)` — new loot insertion
- The existing auto-clean at ~line 2262 (delete CombatResult when no loot for CURRENT combat) remains untouched

## Verification

1. Module published successfully with `--clear-database -y`
2. Stale loot query uses `by_character` index (not `.iter()`)
3. Cleanup is scoped per-character (each participant only has own old loot deleted)
4. Cleanup happens before new loot insertion

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 3637b19 | fix(128-01): delete stale CombatLoot and orphaned CombatResult rows before inserting new loot |

## Self-Check: PASSED

- `spacetimedb/src/reducers/combat.ts` modified and committed
- Commit 3637b19 verified in git log
- Module published without errors
