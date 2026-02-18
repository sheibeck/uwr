---
phase: quick-161
plan: 01
subsystem: combat-loot
tags: [essence, loot, combat, seeding]
dependency_graph:
  requires: [combat.ts loot loop, ensureMaterialLootEntries, Essence I/II/III templates]
  provides: [runtime essence drops per kill, terrain-agnostic essence access]
  affects: [combat.ts, ensure_enemies.ts]
tech_stack:
  added: []
  patterns: [deterministic seed per character+template, inline iter().find() lookup]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
decisions:
  - Essence templates looked up once per victory (not per participant) — three iter().find() calls before participant loop
  - Seed formula character.id*7n XOR timestamp + template.id*31n avoids collision with affix seeds (31n/37n/41n/43n)
  - Spirit Essence (crafting material) references in ensure_enemies.ts preserved unchanged
metrics:
  duration: ~2min
  completed: 2026-02-18
---

# Quick Task 161: Rework Essence Drops — Remove Terrain Gating

**One-liner:** Runtime essence drops in combat.ts loot loop (25% per kill, tier by enemy level 1-5/6-10/11+) replacing terrain-gated seeded loot table entries.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add runtime essence drop logic to combat.ts loot loop | a3aac9e | spacetimedb/src/reducers/combat.ts |
| 2 | Remove all Essence I/II/III entries from ensureMaterialLootEntries | d973957 | spacetimedb/src/seeding/ensure_enemies.ts |

## What Was Done

### Task 1 — combat.ts

Before the `for (const p of participants)` loot loop, added three template lookups:

```typescript
const essenceITemplate = [...ctx.db.itemTemplate.iter()].find(t => t.name === 'Essence I');
const essenceIITemplate = [...ctx.db.itemTemplate.iter()].find(t => t.name === 'Essence II');
const essenceIIITemplate = [...ctx.db.itemTemplate.iter()].find(t => t.name === 'Essence III');
```

Inside `for (const template of enemyTemplates)`, after the existing `combatLoot.insert` loop:

```typescript
// --- Essence drop: 25% chance, tier based on enemy level ---
const essenceSeed = (character.id * 7n ^ ctx.timestamp.microsSinceUnixEpoch + template.id * 31n) % 100n;
if (essenceSeed < 25n) {
  const enemyLevel = template.level ?? 1n;
  const essenceToDrop =
    enemyLevel >= 11n ? essenceIIITemplate :
    enemyLevel >= 6n  ? essenceIITemplate  :
                        essenceITemplate;
  if (essenceToDrop) {
    ctx.db.combatLoot.insert({ ... });
  }
}
```

### Task 2 — ensure_enemies.ts

- Removed `essenceI`, `essenceII`, `essenceIII` variable declarations
- Removed 6 `// Essence drops (tier-gated)` blocks (one per creature type: animal, beast, undead, spirit, construct, humanoid)
- Updated comment block to note essences now handled at runtime in combat.ts
- Net: -75 lines, +3 comment lines

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- Module published successfully with `spacetime publish uwr --project-path spacetimedb/`
- `grep -n "essenceI\|essenceII\|essenceIII" spacetimedb/src/seeding/ensure_enemies.ts` returns zero results (only spiritEssence crafting material references remain)
- Old terrain-gated LootTableEntry rows for essences remain in DB from prior runs; republish with `--clear-database` if stale rows cause confusion

## Self-Check: PASSED

- spacetimedb/src/reducers/combat.ts: modified (commit a3aac9e)
- spacetimedb/src/seeding/ensure_enemies.ts: modified (commit d973957)
- Both commits exist in git log
- Module published without errors
