# Quick Task 228 — Pack Rush hits at 65% power per strike

**Date:** 2026-02-21
**Commit:** 8d2262e

## What changed

`spacetimedb/src/helpers/combat.ts`:

1. Added `hitMultiplier?: bigint` to the `applyDamage` options type.
2. In the hit loop, when `hitMultiplier` is set: `raw = (raw * hitMultiplier) / 100n`.
3. Pack Rush ability now passes `hitMultiplier: 65n` alongside `hits: 2n`.

## Result

Each Pack Rush strike deals 65% of normal weapon damage — matching `AOE_DAMAGE_MULTIPLIER`.
Total output is 130% (vs 200% at full power), consistent with multi-hit AoE balance.
