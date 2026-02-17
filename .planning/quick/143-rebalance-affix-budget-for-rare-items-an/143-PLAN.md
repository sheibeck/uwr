---
phase: quick-143
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/reducers/combat.ts
  - src/composables/useInventory.ts
  - src/composables/useCombat.ts
autonomous: true
must_haves:
  truths:
    - "Rare items never exceed +2 total affix magnitude budget (e.g., two +1 affixes or one +2 affix, not two +2 affixes)"
    - "Item tooltips display 'Tier N' where N maps from qualityTier (common=1, uncommon=2, rare=3, epic=4, legendary=5)"
    - "Quality tier rolls are driven by zone danger, not fixed level-based probabilities"
    - "There is a small chance (~12%) of rolling 1 tier higher than the zone's base tier"
  artifacts:
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "Affix budget constraint in generateAffixData, danger-based rollQualityTier"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Passes zone dangerMultiplier to rollQualityTier"
    - path: "src/composables/useInventory.ts"
      provides: "Tier label in tooltip descriptions"
    - path: "src/composables/useCombat.ts"
      provides: "Tier label in tooltip descriptions"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/helpers/items.ts"
      via: "rollQualityTier call with danger parameter"
      pattern: "rollQualityTier\\(.*danger"
---

<objective>
Rebalance the loot system with three changes: (1) cap rare item affix budget at +2 total magnitude, (2) re-add "Tier N" label to item tooltips mapped from qualityTier, (3) make quality tier rolls depend on zone danger level with a tier-up chance.

Purpose: Prevents overpowered rare items, gives players a clear tier indicator, and ties loot quality to zone difficulty for better progression feel.
Output: Updated backend loot generation + client tooltip display.
</objective>

<context>
@.planning/STATE.md
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/data/affix_catalog.ts
@src/composables/useInventory.ts
@src/composables/useCombat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — affix budget cap + danger-based quality tier rolls</name>
  <files>spacetimedb/src/helpers/items.ts, spacetimedb/src/reducers/combat.ts</files>
  <action>
**1. Affix budget cap for rare items in `generateAffixData` (helpers/items.ts):**

After generating all affixes (the existing logic at lines 99-161), add a post-processing step for `qualityTier === 'rare'` that enforces a total magnitude budget of 2:
- Sum all affix magnitudes in the `result` array.
- If total > 2n, redistribute: iterate through affixes and reduce magnitudes until total equals 2n. Simple approach: cap each affix magnitude to `Math.min(magnitude, remainingBudget)` where remainingBudget starts at 2n and decreases. If an affix gets capped to 0n, remove it from the result array.
- This means rare items (2 affixes) will get either two +1 affixes or one +2/one +0 (removed). The total never exceeds +2.
- Do NOT change uncommon or epic affix generation — only rare.

**2. Danger-based quality tier rolls in `rollQualityTier` (helpers/items.ts):**

Change the signature from `rollQualityTier(creatureLevel: bigint, seedBase: bigint)` to `rollQualityTier(creatureLevel: bigint, seedBase: bigint, dangerMultiplier?: bigint)`.

When `dangerMultiplier` is provided, use danger-based tier selection instead of the current level-based logic:
- Compute `danger = Number(dangerMultiplier)` (values in the world: 100=starter, 160=border, 200=dungeon).
- Determine base quality tier from danger:
  - danger <= 120: base = 'common' (tier 1 zone)
  - danger 121-170: base = 'uncommon' (tier 2 zone)
  - danger 171-250: base = 'rare' (tier 3 zone)
  - danger 251-400: base = 'epic' (tier 4 zone)
  - danger > 400: base = 'legendary' (tier 5 zone — future proofing)
- Roll for tier-up: use `(seedBase + 47n) % 100n`. If roll < 12 (12% chance), bump base tier up by 1 (common->uncommon, uncommon->rare, etc.). Cap at epic (no random legendaries — legendaries only from named drops).
- Still respect `getMaxTierForLevel(creatureLevel)` as an upper cap — low-level creatures in dangerous zones shouldn't drop epic gear.
- When `dangerMultiplier` is NOT provided (undefined), fall back to the existing level-based logic (backward compatible for create_test_item).

**3. Pass danger to rollQualityTier in combat.ts (reducers/combat.ts):**

In the `generateLootTemplates` function (line ~589), look up the combat location's region danger:
- At the top of `generateLootTemplates`, add a `dangerMultiplier` parameter: change signature to `(ctx: any, enemyTemplate: any, seedBase: bigint, dangerMultiplier: bigint)`.
- On line ~619 where `rollQualityTier` is called, pass dangerMultiplier: `rollQualityTier(enemyTemplate.level ?? 1n, seedBase, dangerMultiplier)`.
- At the call site (~line 2205), look up danger from combat.locationId:
  ```
  const lootLocation = ctx.db.location.id.find(combat.locationId);
  const lootRegion = lootLocation ? ctx.db.region.id.find(lootLocation.regionId) : null;
  const lootDanger = lootRegion?.dangerMultiplier ?? 100n;
  ```
  Then pass `lootDanger` to `generateLootTemplates(ctx, template, seedBase, lootDanger)`.
- Move the danger lookup OUTSIDE the per-template loop (it's the same for all templates in one combat) for efficiency.
  </action>
  <verify>
Run `cd C:/projects/uwr && spacetime publish uwr --clear-database -y --project-path spacetimedb` — module compiles and publishes without errors.
  </verify>
  <done>
Rare items have max +2 total affix magnitude. Quality tier rolls use zone danger with 12% tier-up chance, capped by creature level. Backward compatible when danger not provided.
  </done>
</task>

<task type="auto">
  <name>Task 2: Client — add Tier label to tooltip descriptions</name>
  <files>src/composables/useInventory.ts, src/composables/useCombat.ts</files>
  <action>
Create a helper function (can be inline or a small local function) that maps qualityTier string to a tier number:
```
const qualityTierToNumber = (qt: string): number => {
  const map: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
  return map[qt] ?? 1;
};
```

**In useInventory.ts**, update the tooltip description construction in TWO places:

1. **Inventory items** (around line 138-146): Change the description array to prepend `Tier N`:
   ```
   const tierLabel = `Tier ${qualityTierToNumber(qualityTier)}`;
   const description = foodDescription || (
     [tierLabel, qualityTier, typeField, template?.slot]
       .filter((value) => value && value.length > 0)
       .join(' \u2022 ') ?? ''
   );
   ```

2. **Equipped slots** (around line 258-265): Same change using `equippedQualityTier`:
   ```
   const tierLabel = `Tier ${qualityTierToNumber(equippedQualityTier)}`;
   const description = (
     [tierLabel, equippedQualityTier, equippedTypeField, template?.slot]
       .filter((value) => value && value.length > 0)
       .join(' \u2022 ') ?? ''
   );
   ```

**In useCombat.ts**, update the tooltip description construction in TWO places:

1. **Active loot** (around line 215-222): Prepend tier label using `activeLootQualityTier`:
   ```
   const tierLabel = `Tier ${qualityTierToNumber(activeLootQualityTier)}`;
   const description = (
     [tierLabel, activeLootQualityTier, activeLootTypeField, template?.slot]
       .filter((value) => value && value.length > 0)
       .join(' \u2022 ') ?? ''
   );
   ```

2. **Pending loot** (around line 290-297): Prepend tier label using `qualityTier`:
   ```
   const tierLabel = `Tier ${qualityTierToNumber(qualityTier)}`;
   const description = (
     [tierLabel, qualityTier, pendingTypeField, template?.slot]
       .filter((value) => value && value.length > 0)
       .join(' \u2022 ') ?? ''
   );
   ```

The result is tooltips showing e.g. "Tier 3 \u2022 rare \u2022 leather \u2022 chest" instead of "rare \u2022 leather \u2022 chest".
  </action>
  <verify>
Run `cd C:/projects/uwr && npx vue-tsc --noEmit` — no TypeScript errors. Visually confirm in browser that item tooltips now show "Tier N" prefix.
  </verify>
  <done>
All item tooltip descriptions (inventory, equipped, active loot, pending loot) display "Tier N" derived from qualityTier, not from template.tier.
  </done>
</task>

</tasks>

<verification>
1. Module publishes successfully with `spacetime publish uwr --clear-database -y --project-path spacetimedb`
2. Client compiles with no TypeScript errors
3. Use `/createitem rare` in-game — verify the item's affixes sum to at most +2 total magnitude
4. Use `/createitem epic` — verify epic items still get 3 affixes with no budget cap
5. Kill an enemy in the starter zone (Hollowmere Vale, danger 100) — loot should be mostly common/uncommon, rare chance of rare
6. Item tooltips show "Tier 1 \u2022 common \u2022 ..." format
</verification>

<success_criteria>
- Rare items capped at +2 total affix magnitude
- Quality tier driven by zone danger (100=mostly common, 160=mostly uncommon, 200=mostly rare)
- 12% tier-up chance on every quality roll
- Tier label visible in all item tooltips mapped from qualityTier
- No regressions: legendary drops, epic affixes, create_test_item all still work
</success_criteria>
