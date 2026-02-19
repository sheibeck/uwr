---
phase: quick-195
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/helpers/location.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Crafting a recipe with T1 materials always yields standard quality (no variance)"
    - "Crafting a recipe with T2 materials always yields reinforced quality (no variance)"
    - "Crafting a recipe with T3 materials always yields exquisite quality (no variance)"
    - "Gathering in a T1 zone (dangerMultiplier 100) cannot produce T2 or T3 crafting materials"
    - "Gathering in a T2 zone (dangerMultiplier ~160) cannot produce T3 crafting materials"
    - "Enemy drop tables remain unchanged (already tier-gated by terrain proxy)"
  artifacts:
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "Deterministic materialTierToCraftQuality, no CRAFT_QUALITY_PROBS"
      contains: "function materialTierToCraftQuality"
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "Tier-gated gather pool via optional zoneTier parameter"
      contains: "getGatherableResourceTemplates"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "materialTierToCraftQuality"
      via: "called without seed argument"
      pattern: "materialTierToCraftQuality\\(materialTier\\)"
    - from: "spacetimedb/src/helpers/location.ts:spawnResourceNode"
      to: "getGatherableResourceTemplates"
      via: "passes computed zoneTier from region dangerMultiplier"
      pattern: "getGatherableResourceTemplates.*zoneTier"
---

<objective>
Revert crafting quality to fully deterministic (T1 mat → standard, T2 → reinforced, T3 → exquisite, no probability) and gate crafting material availability in the gather pool by zone tier so players can only find T1 materials in T1 zones (L1-10), T2 in T2 zones (L11-20), and T3 in T3 zones (L21-30+).

Purpose: The design spec requires crafting to be entirely deterministic — the quality of crafted gear is solely determined by the tier of materials used. Materials are the progression gate, so they must be tier-locked to world zones.

Output: Modified crafting_materials.ts (deterministic only), items.ts (no craftSeed), location.ts (tier-filtered gather pool).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key facts from audit:
- crafting_materials.ts lines 167-196: CRAFT_QUALITY_PROBS constant + probabilistic branch in materialTierToCraftQuality when seed provided
- items.ts line 1140-1141: craftSeed computed and passed to materialTierToCraftQuality — this is the only call site with a seed
- location.ts line 52-149: getGatherableResourceTemplates injects ALL material tiers into the gather pool with no zone filtering
- location.ts line 150-184: spawnResourceNode calls getGatherableResourceTemplates with terrainType only — has ctx.db access to get region dangerMultiplier
- combat.ts line 1402-1404: second call site in passive gather ability — also has ctx.db access
- ensure_enemies.ts line 76: third call site in ensureLootTables seeding — should not filter (pass zoneTier=3 or omit)
- Enemy drop tables in ensureMaterialLootEntries already tier-gate by terrain proxy (dungeon=T3, mountains/town/city=T2, others=T1) — no changes needed there
- Zone tier mapping: dangerMultiplier 100=T1, ~160=T2, ~200=T3; use Math.min(3, Math.max(1, Math.floor(Number(dm) / 100))) to map 100→1, 160→1 (wrong), need: <130=T1, 130-180=T2, >180=T3

Zone tier derivation: dangerMultiplier thresholds in ensure_world.ts are 100n (T1 starter region), 160n (T2 border), 200n (T3 dungeon). Use:
  zoneTier = dm < 130n ? 1 : dm < 190n ? 2 : 3
</context>

<tasks>

<task type="auto">
  <name>Task 1: Revert materialTierToCraftQuality to deterministic and remove craftSeed from craft_recipe</name>
  <files>
    spacetimedb/src/data/crafting_materials.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
In `spacetimedb/src/data/crafting_materials.ts`:

1. Delete the `CRAFT_QUALITY_PROBS` constant (lines 167-171 — the entire export const block).

2. Rewrite `materialTierToCraftQuality` to be purely deterministic with no `seed` parameter:

```typescript
/**
 * Maps material tier to craft quality level. Fully deterministic.
 * T1 → standard, T2 → reinforced, T3 → exquisite.
 * Dented and Mastercraft are not achievable via basic crafting.
 */
export function materialTierToCraftQuality(tier: bigint): string {
  if (tier === 1n) return 'standard';
  if (tier === 2n) return 'reinforced';
  if (tier === 3n) return 'exquisite';
  return 'standard';
}
```

In `spacetimedb/src/reducers/items.ts`:

1. Find the `craft_recipe` reducer block (around line 1130-1145). The current code is:
```typescript
const craftSeed = ctx.timestamp.microsSinceUnixEpoch + character.id;
const craftQuality = materialTierToCraftQuality(materialTier, craftSeed);
```

2. Remove the `craftSeed` line entirely and update the call to:
```typescript
const craftQuality = materialTierToCraftQuality(materialTier);
```

No other changes needed in items.ts.
  </action>
  <verify>
TypeScript should compile cleanly after these changes. Run:
```
cd spacetimedb && npx tsc --noEmit 2>&1 | head -30
```
Confirm no errors referencing `CRAFT_QUALITY_PROBS` or the `seed` parameter of `materialTierToCraftQuality`.
  </verify>
  <done>
`materialTierToCraftQuality` has no `seed` parameter, `CRAFT_QUALITY_PROBS` is deleted, `craft_recipe` calls `materialTierToCraftQuality(materialTier)` with one argument. TypeScript compiles with no errors on these files.
  </done>
</task>

<task type="auto">
  <name>Task 2: Tier-gate gather pool in getGatherableResourceTemplates by zone tier</name>
  <files>
    spacetimedb/src/helpers/location.ts
  </files>
  <action>
In `spacetimedb/src/helpers/location.ts`:

1. Update the `getGatherableResourceTemplates` function signature to accept an optional `zoneTier` parameter (default 3, meaning no filtering — preserves backward compat for the seeding call in ensure_enemies.ts):

```typescript
export function getGatherableResourceTemplates(ctx: any, terrainType: string, timePref?: string, zoneTier: number = 3) {
```

2. In the material injection loop (currently lines 103-111), add a tier filter so materials above the zone tier are excluded:

```typescript
  // Inject gatherable crafting materials from MATERIAL_DEFS, filtered by zoneTier
  const materialEntries: { name: string; weight: bigint; timeOfDay: string }[] = [];
  for (const mat of MATERIAL_DEFS) {
    if (!mat.gatherEntries) continue;
    if (Number(mat.tier) > zoneTier) continue;  // <-- ADD THIS LINE
    for (const entry of mat.gatherEntries) {
      if (entry.terrain === key) {
        materialEntries.push({ name: mat.name, weight: entry.weight, timeOfDay: entry.timeOfDay });
      }
    }
  }
```

3. Update `spawnResourceNode` (same file, lines 150-184) to derive `zoneTier` from the location's region `dangerMultiplier` and pass it to `getGatherableResourceTemplates`:

After `const location = ctx.db.location.id.find(locationId);` and before the `getGatherableResourceTemplates` call, insert:

```typescript
  const region = ctx.db.region.id.find(location?.regionId);
  const dm = region?.dangerMultiplier ?? 100n;
  const zoneTier = dm < 130n ? 1 : dm < 190n ? 2 : 3;
  const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains', timePref, zoneTier);
```

Replace the existing `const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains', timePref);` line with the above.

Zone tier thresholds: dangerMultiplier 100n = T1 starter, 160n = T2 border, 200n = T3 dungeon. The cutoffs dm < 130n → T1, dm < 190n → T2, dm >= 190n → T3 correctly map these values.

Note: The call in `combat.ts` (passive gather ability, line ~1404) also needs the same treatment. Update it similarly:

In `combat.ts` around line 1402-1404:
```typescript
      const location = ctx.db.location.id.find(freshChar.locationId);
      if (!location) throw new SenderError('Location not found');
      const region = ctx.db.region.id.find(location.regionId);
      const dm = region?.dangerMultiplier ?? 100n;
      const gatherZoneTier = dm < 130n ? 1 : dm < 190n ? 2 : 3;
      const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains', undefined, gatherZoneTier);
```

The call in `ensure_enemies.ts:76` (ensureLootTables) intentionally omits zoneTier (defaults to 3) so ALL materials remain eligible in the generic seeded loot pool — this is correct, the loot table seeding is a catch-all; runtime tier-gating happens via the terrain proxy already.
  </action>
  <verify>
Run TypeScript compile check:
```
cd spacetimedb && npx tsc --noEmit 2>&1 | head -30
```
Confirm no type errors. Also verify the signature change is backward-compatible by checking that the ensure_enemies.ts call `getGatherableResourceTemplates(ctx, terrainType)` still compiles (it passes only 2 args, `timePref` and `zoneTier` both have defaults).
  </verify>
  <done>
`getGatherableResourceTemplates` accepts optional `zoneTier: number = 3`. `spawnResourceNode` computes `zoneTier` from `region.dangerMultiplier` (100→1, 160→2, 200→3) and passes it. The passive gather ability in `combat.ts` does the same. The seeding call in `ensure_enemies.ts` passes no `zoneTier` (defaults to 3, all tiers). TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. TypeScript compile passes with no errors: `cd spacetimedb && npx tsc --noEmit`
2. Publish the module: `spacetime publish uwr --project-path spacetimedb` (no --clear-database needed — no schema changes)
3. Confirm logic via code inspection:
   - `materialTierToCraftQuality` has exactly one code path per tier, no random branch
   - `CRAFT_QUALITY_PROBS` does not exist in crafting_materials.ts
   - `craft_recipe` in items.ts calls `materialTierToCraftQuality(materialTier)` with one argument
   - `getGatherableResourceTemplates` skips materials where `Number(mat.tier) > zoneTier`
   - `spawnResourceNode` and the combat passive gather both derive `zoneTier` from `dangerMultiplier`
</verification>

<success_criteria>
- Crafting quality is 100% deterministic: T1 mat → standard, T2 mat → reinforced, T3 mat → exquisite with zero variance
- T1 zone gather pools (dangerMultiplier=100) contain only Copper Ore (T1) — Iron Ore (T2) and Darksteel Ore (T3) are absent
- T2 zone gather pools (dangerMultiplier=160) contain Copper Ore + Iron Ore — Darksteel Ore (T3) is absent
- T3 zone gather pools (dangerMultiplier=200) contain all tiers
- Module publishes without errors
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/195-revert-crafting-quality-to-deterministic/195-SUMMARY.md`
</output>
