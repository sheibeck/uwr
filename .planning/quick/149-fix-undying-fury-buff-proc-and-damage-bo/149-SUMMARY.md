---
phase: quick-149
plan: 01
subsystem: combat / perks
tags: [perk, proc, buff, damage, undying_fury, damage_boost]
dependency_graph:
  requires: [Phase 20 perk variety expansion, CharacterEffect system]
  provides: [undying_fury damage_boost proc, damage_boost combat multiplier]
  affects: [spacetimedb/src/data/renown_data.ts, spacetimedb/src/helpers/combat.ts, spacetimedb/src/reducers/combat.ts]
tech_stack:
  added: []
  patterns: [CharacterEffect buff-on-proc pattern, sumCharacterEffect multiplier in auto-attack path]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/renown_data.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "roundsRemaining derived from buffDurationSeconds using ceil(duration / 3) — consistent with 3-second combat tick rate"
  - "buffType branch placed before on_kill AoE block so any on_kill proc with buffType also applies the buff"
  - "damage_boost multiplier uses integer arithmetic: (baseDamage * (100n + boost)) / 100n — no floating point"
metrics:
  duration: ~5min
  completed: 2026-02-18T00:52:39Z
  tasks: 2
  files: 3
---

# Phase quick-149 Plan 01: Fix undying_fury Buff Proc and damage_boost Combat Multiplier Summary

**One-liner:** undying_fury on_damage_taken proc now applies a damage_boost CharacterEffect (+50%, 10s), and auto-attack damage reads that effect as a percentage multiplier via sumCharacterEffect.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add buff fields to undying_fury and buffType branch in applyPerkProcs | 6e13a19 | renown_data.ts, helpers/combat.ts |
| 2 | Apply damage_boost CharacterEffect multiplier to auto-attack damage | 9a61a38 | reducers/combat.ts |

## Changes Made

### Task 1 — renown_data.ts
Replaced the undying_fury effect's description-only object with proper buff fields:
```typescript
// Before
effect: { procType: 'on_damage_taken', procChance: 3, description: '+50% damage for 10s on proc' }

// After
effect: { procType: 'on_damage_taken', procChance: 3, buffType: 'damage_boost', buffMagnitude: 50n, buffDurationSeconds: 10 }
```

### Task 1 — helpers/combat.ts (applyPerkProcs)
Added buffType branch after procHealPercent block, before on_kill AoE block:
```typescript
if (effect.buffType) {
  const buffDuration = effect.buffDurationSeconds ?? 10;
  const roundsRemaining = BigInt(Math.max(1, Math.ceil(buffDuration / 3)));
  const buffMagnitude = effect.buffMagnitude ?? 1n;
  addCharacterEffect(ctx, character.id, effect.buffType, buffMagnitude, roundsRemaining, perkName);
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
    `Your ${perkName} triggered! +${buffMagnitude}% damage for ${buffDuration}s.`);
}
```

### Task 2 — reducers/combat.ts (auto-attack path)
Replaced `const damage = baseDamage` with damage_boost multiplier:
```typescript
const damageBoostPercent = sumCharacterEffect(ctx, character.id, 'damage_boost');
const damage = damageBoostPercent > 0n
  ? (baseDamage * (100n + damageBoostPercent)) / 100n
  : baseDamage;
```

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- Module published successfully: `Updated database with name: uwr`
- `grep -n "damage_boost" reducers/combat.ts` returns line 1958 (the new sumCharacterEffect call)
- `buffType: 'damage_boost'` present in undying_fury effect in renown_data.ts
- `addCharacterEffect.*damage_boost` path exists in applyPerkProcs via the new buffType branch
- Bindings regenerated successfully

## Self-Check: PASSED

- spacetimedb/src/data/renown_data.ts — modified (undying_fury buffType fields)
- spacetimedb/src/helpers/combat.ts — modified (buffType branch in applyPerkProcs)
- spacetimedb/src/reducers/combat.ts — modified (damage_boost multiplier in auto-attack)
- Commit 6e13a19 — FOUND
- Commit 9a61a38 — FOUND
