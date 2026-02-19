---
phase: quick-192
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/data/crafting_materials.ts
  - client/src/module_bindings
autonomous: true
requirements: [GEAR-PROG-01, GEAR-PROG-02, GEAR-PROG-03, GEAR-PROG-04]

must_haves:
  truths:
    - "Dropped gear has both a rarity (common/uncommon/rare/epic) AND a quality (standard/reinforced/exquisite) rolled independently based on enemy level band"
    - "All probability thresholds are named constants in items.ts config block — no inline magic numbers in rollQualityTier"
    - "T5 (L41-50) exists as a distinct tier with its own rarity and quality weight tables"
    - "Equipping gear does not check character.level against template.requiredLevel — any character can equip any item they obtain"
    - "Crafting quality is probability-weighted by material tier — higher-tier materials improve chances but do not hard-gate the outcome"
    - "craftQuality rolled at drop time is preserved through take_loot onto the ItemInstance"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "CombatLoot table gains craftQuality: t.string().optional() column"
      contains: "craftQuality"
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "TIER_RARITY_WEIGHTS, TIER_QUALITY_WEIGHTS config constants; rollQualityTier rewritten to use them; rollQualityForDrop new function; getWorldTier updated to include T5"
      exports: ["rollQualityTier", "rollQualityForDrop", "getWorldTier", "TIER_RARITY_WEIGHTS", "TIER_QUALITY_WEIGHTS"]
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "generateLootTemplates calls rollQualityForDrop and sets craftQuality on dropped CombatLoot rows"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "equip_item reducer has requiredLevel check removed; take_loot copies craftQuality from CombatLoot row to ItemInstance"
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "materialTierToCraftQuality updated to probability-weighted roll; CRAFT_QUALITY_PROBS config constant added"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "spacetimedb/src/helpers/items.ts"
      via: "import rollQualityForDrop"
      pattern: "rollQualityForDrop"
    - from: "generateLootTemplates in combat.ts"
      to: "CombatLoot insert"
      via: "craftQuality field set from rollQualityForDrop result"
      pattern: "craftQuality.*rollQualityForDrop"
    - from: "take_loot in items.ts"
      to: "CombatLoot.craftQuality"
      via: "loot.craftQuality read and passed to ItemInstance id.update"
      pattern: "craftQuality.*loot\\.craftQuality"
    - from: "spacetimedb/src/reducers/items.ts craft_recipe"
      to: "spacetimedb/src/data/crafting_materials.ts"
      via: "materialTierToCraftQuality call"
      pattern: "materialTierToCraftQuality"
---

<objective>
Align gear and crafting progression to the world-tier spec: rarity and quality rolled independently per enemy level band, all probability curves in tunable config constants, T5 tier added, equip level gate removed, and crafting quality made probability-weighted.

Purpose: The current system only rolls rarity (qualityTier) on drops — quality (craftQuality: standard/reinforced/exquisite) is never set on world drops. Probability thresholds are magic numbers scattered in function bodies. T5 (L41-50) is missing. The equip reducer hard-gates T2+ gear behind character level. Crafting quality is fully deterministic. CombatLoot has no craftQuality column, so the rolled quality cannot persist from loot-roll to item-take.

Output: tables.ts gains craftQuality on CombatLoot; items.ts gains TIER_RARITY_WEIGHTS/TIER_QUALITY_WEIGHTS config block and rollQualityForDrop(); combat.ts passes craftQuality on drops; take_loot copies craftQuality to ItemInstance; equip level gate removed in items reducer; crafting quality becomes probabilistic.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/reducers/items.ts
@spacetimedb/src/data/crafting_materials.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add world-tier config constants and rollQualityForDrop to items.ts</name>
  <files>spacetimedb/src/helpers/items.ts</files>
  <action>
In `spacetimedb/src/helpers/items.ts`, make the following changes:

**1. Update getMaxTierForLevel (rename to getWorldTier) to include T5:**

```typescript
export function getWorldTier(level: bigint): number {
  if (level <= 10n) return 1;
  if (level <= 20n) return 2;
  if (level <= 30n) return 3;
  if (level <= 40n) return 4;
  return 5; // T5: L41-50
}
```

Keep `getMaxTierForLevel` as an alias pointing to getWorldTier (backward compat for any callers).

**2. Add TIER_RARITY_WEIGHTS config constant after imports, before rollQualityTier:**

```typescript
/**
 * Per-tier rarity probability weights for world drops.
 * Array order: [common%, uncommon%, rare%, epic%]
 * These are percentage thresholds (cumulative roll out of 100).
 * Tune these values to adjust the drop economy.
 */
export const TIER_RARITY_WEIGHTS: Record<number, [number, number, number, number]> = {
  1: [95, 5,  0,  0 ],  // T1 (L1-10):  95% common, 5% uncommon, 0% rare, 0% epic
  2: [60, 30, 9,  1 ],  // T2 (L11-20): 60% common, 30% uncommon, 9% rare, 1% epic
  3: [35, 35, 25, 5 ],  // T3 (L21-30): 35% common, 35% uncommon, 25% rare, 5% epic
  4: [20, 35, 35, 10],  // T4 (L31-40): 20% common, 35% uncommon, 35% rare, 10% epic
  5: [10, 20, 40, 30],  // T5 (L41-50): 10% common, 20% uncommon, 40% rare, 30% epic
};

/**
 * Per-tier quality probability weights for world drops (independent from rarity).
 * Array order: [standard%, reinforced%, exquisite%]
 * These are percentage thresholds (cumulative roll out of 100).
 * Tune these values to adjust quality distribution.
 */
export const TIER_QUALITY_WEIGHTS: Record<number, [number, number, number]> = {
  1: [100, 0,  0 ],  // T1: Standard only
  2: [80,  20, 0 ],  // T2: Standard dominant, Reinforced rare
  3: [55,  35, 10],  // T3: Standard common, Reinforced moderate, Exquisite rare
  4: [30,  50, 20],  // T4: Reinforced dominant, Exquisite attainable
  5: [15,  45, 40],  // T5: Exquisite primary aspirational, Reinforced baseline
};
```

Note: weights must sum to 100 for each tier. Rarity and quality are separate rolls.

**3. Rewrite rollQualityTier to use TIER_RARITY_WEIGHTS:**

Replace the current rollQualityTier body with:

```typescript
export function rollQualityTier(creatureLevel: bigint, seedBase: bigint, dangerMultiplier?: bigint): string {
  const tier = getWorldTier(creatureLevel);
  const weights = TIER_RARITY_WEIGHTS[tier] ?? TIER_RARITY_WEIGHTS[1]!;
  const [wCommon, wUncommon, wRare] = weights;

  // Apply danger bonus: shifts thresholds toward higher rarity (max +10% shift)
  const dangerBonus = dangerMultiplier !== undefined
    ? Math.min(10, Math.max(0, Math.floor((Number(dangerMultiplier) - 120) / 15)))
    : 0;

  const roll = Number((seedBase + 53n) % 100n);
  const uncommonThreshold = wCommon - dangerBonus;
  const rareThreshold = uncommonThreshold + wUncommon;
  const epicThreshold = rareThreshold + wRare;

  if (roll < uncommonThreshold) return 'common';
  if (roll < rareThreshold) return 'uncommon';
  if (roll < epicThreshold) return 'rare';
  return 'epic';
}
```

**4. Add new rollQualityForDrop function (quality axis, independent from rarity):**

```typescript
/**
 * Rolls the quality (craftsmanship) axis for a world drop.
 * Quality is independent from rarity — a common item can be Reinforced.
 * Uses TIER_QUALITY_WEIGHTS keyed by enemy level band.
 */
export function rollQualityForDrop(creatureLevel: bigint, seedBase: bigint): string {
  const tier = getWorldTier(creatureLevel);
  const weights = TIER_QUALITY_WEIGHTS[tier] ?? TIER_QUALITY_WEIGHTS[1]!;
  const [wStandard, wReinforced] = weights;

  const roll = Number((seedBase + 67n) % 100n); // offset 67n avoids collision with rarity roll (53n)
  const reinforcedThreshold = wStandard;
  const exquisiteThreshold = wStandard + wReinforced;

  if (roll < reinforcedThreshold) return 'standard';
  if (roll < exquisiteThreshold) return 'reinforced';
  return 'exquisite';
}
```

**5. Remove the fallback danger-based logic** from the old rollQualityTier (it's now handled by TIER_RARITY_WEIGHTS + dangerBonus). The new version is a clean single codepath.

After changes, `getMaxTierForLevel` is replaced by `getWorldTier`. Verify the file exports `rollQualityForDrop` and the two config constants.
  </action>
  <verify>Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -40` — TypeScript should compile without errors in items.ts. Check that `TIER_RARITY_WEIGHTS`, `TIER_QUALITY_WEIGHTS`, `rollQualityForDrop`, and `getWorldTier` are all exported.</verify>
  <done>items.ts TypeScript-clean; all 5 tier entries in both weight tables; rollQualityForDrop exported and uses seed offset 67n to avoid collision with rollQualityTier seed offset 53n.</done>
</task>

<task type="auto">
  <name>Task 2: Add craftQuality to CombatLoot schema, wire rollQualityForDrop into combat pipeline, propagate through take_loot, remove equip gate, probabilistic crafting</name>
  <files>spacetimedb/src/schema/tables.ts, spacetimedb/src/reducers/combat.ts, spacetimedb/src/reducers/items.ts, spacetimedb/src/data/crafting_materials.ts</files>
  <action>
**A. tables.ts — add craftQuality column to CombatLoot:**

In `spacetimedb/src/schema/tables.ts`, find the CombatLoot column block (around lines 532-542). It currently ends with `isNamed: t.bool().optional()`. Add `craftQuality` after `isNamed`:

```typescript
  {
    id: t.u64().primaryKey().autoInc(),
    combatId: t.u64(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    itemTemplateId: t.u64(),
    createdAt: t.timestamp(),
    qualityTier: t.string().optional(),    // rolled rarity, e.g., 'uncommon'
    affixDataJson: t.string().optional(),  // JSON array of affix keys to apply at take time
    isNamed: t.bool().optional(),          // true for Legendary uniques
    craftQuality: t.string().optional(),   // rolled craftsmanship quality, e.g., 'reinforced'
  }
```

This is an additive optional column — existing rows will have it as undefined. The field enables the loot-roll → item-take quality flow.

**B. combat.ts — wire rollQualityForDrop into generateLootTemplates:**

1. Update the import from `../helpers/items` to include `rollQualityForDrop`:
   ```typescript
   import { rollQualityTier, rollQualityForDrop, generateAffixData, buildDisplayName } from '../helpers/items';
   ```

2. In `generateLootTemplates`, after rolling `quality` (the rarity), also roll craft quality:
   ```typescript
   const quality = rollQualityTier(enemyTemplate.level ?? 1n, seedBase, dangerMultiplier);
   const craftQual = rollQualityForDrop(enemyTemplate.level ?? 1n, seedBase);
   ```

3. Pass `craftQuality: craftQual` on all lootItems pushes that include gear:
   ```typescript
   // For non-common gear (has affixes):
   lootItems.push({ template, qualityTier: effectiveQuality, affixDataJson, isNamed: false, craftQuality: craftQual });
   // For common gear (no affixes):
   lootItems.push({ template, qualityTier: effectiveQuality, isNamed: false, craftQuality: craftQual });
   ```

4. Update the lootItems type annotation to include craftQuality:
   ```typescript
   const lootItems: { template: any; qualityTier?: string; affixDataJson?: string; isNamed?: boolean; craftQuality?: string }[] = [];
   ```

5. In the `CombatLoot` insert block, pass `craftQuality: lootItem.craftQuality ?? undefined`:
   Find the combatLoot insert — add `craftQuality: lootItem.craftQuality ?? undefined` to the insert args.

**C. items.ts — propagate craftQuality from CombatLoot to ItemInstance in take_loot:**

In the `take_loot` reducer (around line 313-318), the `id.update` call currently sets `qualityTier`, `displayName`, and `isNamed` but does NOT copy `craftQuality`. Update it to also set `craftQuality`:

```typescript
ctx.db.itemInstance.id.update({
  ...newInstance,
  qualityTier: loot.qualityTier,
  displayName,
  isNamed: loot.isNamed ?? undefined,
  craftQuality: loot.craftQuality ?? undefined,  // propagate rolled quality from loot row
});
```

Also handle the case where the item IS common (the `if (loot.qualityTier && loot.qualityTier !== 'common')` branch is skipped). After that block closes (around line 320), before `ctx.db.combatLoot.id.delete`, add craftQuality for common items too:

```typescript
// For common items (no affix branch above), still propagate craftQuality if present
if (loot.craftQuality && (!loot.qualityTier || loot.qualityTier === 'common')) {
  const instances = [...ctx.db.itemInstance.by_owner.filter(character.id)];
  const newInstance = instances.find(
    (i) => i.templateId === loot.itemTemplateId && !i.equippedSlot && !i.qualityTier
  );
  if (newInstance) {
    ctx.db.itemInstance.id.update({ ...newInstance, craftQuality: loot.craftQuality });
  }
}
```

**D. items.ts — remove equip level gate:**

In the `equip_item` reducer (around line 445), remove or comment out:
```typescript
// REMOVED per world-tier spec: gear availability is world-driven, not character-level-gated
// if (character.level < template.requiredLevel) return failItem(ctx, character, 'Level too low');
```

Leave a comment explaining WHY it was removed (world-tier design: any item found can be equipped).

**E. crafting_materials.ts — make materialTierToCraftQuality probability-weighted:**

Add a new config constant above the function:

```typescript
/**
 * Per-material-tier craft quality probability weights.
 * Array order: [standard%, reinforced%, exquisite%]
 * Higher-tier materials shift probability toward better quality without hard-gating.
 * Tune these values to adjust the crafting economy.
 */
export const CRAFT_QUALITY_PROBS: Record<number, [number, number, number]> = {
  1: [85, 15, 0 ],  // Tier 1 materials: mostly Standard, small Reinforced chance
  2: [20, 65, 15],  // Tier 2 materials: Reinforced dominant, Exquisite possible
  3: [5,  35, 60],  // Tier 3 materials: Exquisite dominant, Reinforced as fallback
};
```

Update `materialTierToCraftQuality` to accept a seed parameter and use CRAFT_QUALITY_PROBS:

```typescript
export function materialTierToCraftQuality(tier: bigint, seed?: bigint): string {
  const tierNum = Number(tier);
  const weights = CRAFT_QUALITY_PROBS[tierNum] ?? CRAFT_QUALITY_PROBS[1]!;
  const [wStandard, wReinforced] = weights;

  if (seed === undefined) {
    // Deterministic fallback (same as old behavior) for callers without seed
    if (tier === 1n) return 'standard';
    if (tier === 2n) return 'reinforced';
    if (tier === 3n) return 'exquisite';
    return 'standard';
  }

  const roll = Number((seed + 71n) % 100n); // offset 71n for craft quality roll
  if (roll < wStandard) return 'standard';
  if (roll < wStandard + wReinforced) return 'reinforced';
  return 'exquisite';
}
```

In `items.ts` `craft_recipe` reducer, find the call to `materialTierToCraftQuality(materialTier)` (around line 1114) and pass a seed derived from `ctx.timestamp.microsSinceUnixEpoch + character.id`:

```typescript
const craftSeed = ctx.timestamp.microsSinceUnixEpoch + character.id;
const craftQuality = materialTierToCraftQuality(materialTier, craftSeed);
```

This makes T2 materials have a 65% chance of Reinforced (not 100%), matching the spec's "higher-tier materials enable higher quality without hard gates."
  </action>
  <verify>Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -40` — no TypeScript errors. Confirm `craftQuality` column exists in CombatLoot definition in tables.ts. Confirm `craftQuality` is wired into the CombatLoot insert in combat.ts. Confirm take_loot copies craftQuality to ItemInstance for both common and non-common items. Confirm equip_item no longer has the level check.</verify>
  <done>TypeScript compiles clean; CombatLoot schema has craftQuality column; combat.ts inserts craftQuality from rollQualityForDrop; take_loot propagates craftQuality to ItemInstance for all item rarities; equip_item level gate removed with comment; craft_recipe uses probabilistic quality roll with seed; CRAFT_QUALITY_PROBS constant defined in crafting_materials.ts.</done>
</task>

<task type="auto">
  <name>Task 3: Publish (with --clear-database), regenerate bindings, and validate</name>
  <files></files>
  <action>
1. Publish the module with `--clear-database` — required because a new column (`craftQuality`) was added to the CombatLoot table:
   ```
   spacetime publish uwr --clear-database -y --project-path C:/projects/uwr/spacetimedb
   ```

2. Regenerate client bindings — required because the CombatLoot schema changed:
   ```
   spacetime generate --lang typescript --out-dir C:/projects/uwr/client/src/module_bindings --project-path C:/projects/uwr/spacetimedb
   ```

3. Check logs to confirm no panics during loot generation:
   ```
   spacetime logs uwr 2>&1 | tail -30
   ```

4. Run a quick smoke test with the admin command:
   - `/createitem common` — should produce a common-rarity item with a craftQuality of 'standard' (T1 drop)
   - Check the item instance in the client inventory tooltip to confirm quality label shows (e.g., "Standard" prefix on the tier label)
  </action>
  <verify>`spacetime logs uwr` shows no PANIC lines. Client inventory tooltip shows quality label for a world-dropped item. Equipping a T2 item on a level 1 character succeeds (no "Level too low" error). Client compiles after bindings regeneration.</verify>
  <done>Module published and running; bindings regenerated with craftQuality on CombatLoot; no panics in logs; quality axis visible on dropped gear; level gate removed confirmed in-game.</done>
</task>

</tasks>

<verification>
1. `TIER_RARITY_WEIGHTS` and `TIER_QUALITY_WEIGHTS` exist in items.ts as exported constants with 5 tier entries each
2. `rollQualityForDrop` exported from items.ts, uses seed offset 67n (distinct from rarity roll offset 53n)
3. `getWorldTier` handles L41-50 as T5 (returns 5)
4. `CombatLoot` table in tables.ts has `craftQuality: t.string().optional()` column
5. `generateLootTemplates` passes `craftQuality` to CombatLoot insert rows
6. `take_loot` reducer copies `craftQuality` from the CombatLoot row onto the new ItemInstance (both common and non-common items)
7. `equip_item` reducer does NOT check `character.level < template.requiredLevel`
8. `CRAFT_QUALITY_PROBS` constant defined in crafting_materials.ts
9. `materialTierToCraftQuality` is probability-weighted when seed is provided
10. `craft_recipe` reducer passes seed to `materialTierToCraftQuality`
11. Module published with `--clear-database -y`
12. Client bindings regenerated unconditionally after publish
13. No TypeScript errors in affected files
</verification>

<success_criteria>
- CombatLoot schema has craftQuality column, enabling quality to flow from loot-roll to item-take
- Both probability axes (rarity + quality) are independently rolled per world drop using named config constants
- All magic numbers (danger thresholds, tier-up chances, uncommon caps) replaced by entries in TIER_RARITY_WEIGHTS / TIER_QUALITY_WEIGHTS
- T5 (L41-50) is a distinct tier in all config tables
- craftQuality propagates from CombatLoot row to ItemInstance via take_loot (both common and non-common items)
- Equipping any obtained item succeeds regardless of character level
- Crafted gear quality varies probabilistically by material tier (T2 mats have ~65% reinforced, not 100%)
- Module published clean with --clear-database, no panics in logs
- Bindings regenerated and client compiles
</success_criteria>

<output>
After completion, create `.planning/quick/192-align-gear-and-crafting-progression-to-w/192-SUMMARY.md` using the summary template.
</output>
