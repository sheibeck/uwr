---
phase: quick-188
plan: 01
subsystem: crafting
tags: [crafting, modifiers, balance, hp, mana]
dependency_graph:
  requires: [crafting_materials.ts, items.ts]
  provides: [getModifierMagnitude, MODIFIER_MAGNITUDE_BY_ESSENCE]
  affects: [craft_recipe reducer modifier affix magnitudes]
tech_stack:
  added: []
  patterns: [stat-specific magnitude lookup, essence-tier-gated magnitudes]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/crafting_materials.ts
    - spacetimedb/src/reducers/items.ts
decisions:
  - "HP/mana modifier magnitudes use 5n/8n/15n matching MATERIAL_AFFIX_MAP bone_shard scale and Vital prefix magnitudeByTier"
  - "ESSENCE_MAGNITUDE (1n/2n/3n) kept unchanged — only per-stat lookup changes for hp/mana"
  - "getModifierMagnitude helper uses optional chaining fallback to ESSENCE_MAGNITUDE"
metrics:
  duration: ~5min
  completed: 2026-02-18
---

# Phase quick-188 Plan 01: Scale HP and Mana Crafting Modifier Bonuses Summary

Scaled Life Stone (hpBonus) and Mana Pearl (manaBonus) crafting modifier magnitudes from trivial 1n/2n/3n to meaningful 5n/8n/15n per Essence tier, matching the existing hp scale already used in MATERIAL_AFFIX_MAP and the Vital prefix.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add stat-specific magnitude lookup and apply in craft_recipe | 071ef2b | crafting_materials.ts, items.ts |
| 2 | Publish module and verify | (no files changed) | — |

## What Was Built

### MODIFIER_MAGNITUDE_BY_ESSENCE (`crafting_materials.ts`)

New exported constant mapping essence key + stat key to a magnitude override:

```typescript
export const MODIFIER_MAGNITUDE_BY_ESSENCE: Record<string, Record<string, bigint>> = {
  'lesser_essence': { hpBonus: 5n, manaBonus: 5n },
  'essence':        { hpBonus: 8n, manaBonus: 8n },
  'greater_essence':{ hpBonus: 15n, manaBonus: 15n },
};
```

### getModifierMagnitude helper (`crafting_materials.ts`)

```typescript
export function getModifierMagnitude(essenceKey: string, statKey: string): bigint {
  return MODIFIER_MAGNITUDE_BY_ESSENCE[essenceKey]?.[statKey] ?? ESSENCE_MAGNITUDE[essenceKey] ?? 1n;
}
```

### craft_recipe modifier loop (`items.ts`)

Changed from single global `magnitude` to per-modifier lookup inside the `for (const modId of modifierIds)` loop:

```typescript
const modMagnitude = getModifierMagnitude(catalystKey, modDef.statKey);
appliedAffixes.push({ ..., magnitude: modMagnitude });
```

## Verification

- `getModifierMagnitude('lesser_essence', 'hpBonus')` returns 5n
- `getModifierMagnitude('essence', 'manaBonus')` returns 8n
- `getModifierMagnitude('greater_essence', 'hpBonus')` returns 15n
- `getModifierMagnitude('lesser_essence', 'strBonus')` falls back to 1n (ESSENCE_MAGNITUDE)
- `getModifierMagnitude('essence', 'armorClassBonus')` falls back to 2n (ESSENCE_MAGNITUDE)
- Module published successfully, server logs show no errors
- Client bindings regenerated (no schema changes, bindings identical)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/data/crafting_materials.ts` — modified with MODIFIER_MAGNITUDE_BY_ESSENCE and getModifierMagnitude
- `spacetimedb/src/reducers/items.ts` — modified with getModifierMagnitude import and per-stat modMagnitude usage
- Commit 071ef2b confirmed present
