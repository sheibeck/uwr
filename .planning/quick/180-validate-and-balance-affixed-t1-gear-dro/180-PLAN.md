---
phase: quick-180
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/items.ts
autonomous: true
requirements: [BALANCE-01]
must_haves:
  truths:
    - "Level 1-3 enemies in Hollowmere Vale (danger 100) drop affixed gear ~2-5% of the time"
    - "Level 3-5 enemies in Embermarch Fringe (danger 160) drop affixed gear ~10-20% of the time"
    - "Crafting an affixed T1 item requires comparable effort to finding one around levels 3-5"
    - "The level cap no longer completely blocks affixed drops for T1 creatures"
  artifacts:
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "Updated rollQualityTier with level-scaled affixed chance for T1"
      contains: "rollQualityTier"
  key_links:
    - from: "spacetimedb/src/helpers/items.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "rollQualityTier import used in generateLootTemplates"
      pattern: "rollQualityTier"
---

<objective>
Fix T1 affixed gear drop rates so low-level enemies (1-3) have a 2-5% chance and higher T1 enemies (4-6) ramp up to 10-20%, balancing against crafting acquisition rates.

Purpose: Currently `getMaxTierForLevel` caps ALL enemies level 1-10 at maxTier=1, which forces `rollQualityTier` to ALWAYS return 'common' regardless of dangerMultiplier. This means 0% affixed drops from any T1 creature -- the danger-based system is completely overridden by the level cap. We need to introduce a level-scaled chance for T1 creatures to occasionally produce uncommon quality drops.

Output: Modified `rollQualityTier` in items.ts that produces the target affixed drop rates.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/items.ts (rollQualityTier function, lines 66-119)
@spacetimedb/src/reducers/combat.ts (generateLootTemplates calling rollQualityTier at line 624, essence drop at 12% line 2319, modifier reagent drop at 15% line 2344)
@spacetimedb/src/seeding/ensure_world.ts (region dangerMultipliers: starter=100, border=160, dungeon=200)
@spacetimedb/src/seeding/ensure_enemies.ts (enemy levels: starter L1-3, border L3-5, dungeon L4-6)
@spacetimedb/src/data/crafting_materials.ts (ESSENCE_TIER_THRESHOLDS, MODIFIER_REAGENT_THRESHOLDS)
@spacetimedb/src/data/affix_catalog.ts (AFFIX_COUNT_BY_QUALITY: common=0, uncommon=1)
</context>

<analysis>
## Current System Audit

### Drop Path (Combat Loot)

The drop pipeline for affixed gear:
1. Kill enemy -> `generateLootTemplates` called with dangerMultiplier
2. Roll gear chance: `lootTable.gearChance + gearBoost` where `gearBoost = min(25, level*2)`
   - Animal: gearChance=10, Beast: 15, Humanoid: 25, Undead/Spirit/Construct: 20
   - At L1: gearBoost=2, at L3: gearBoost=6, at L5: gearBoost=10
   - Effective gear drop %: Animal L1=12%, L3=16%, L5=20%; Humanoid L1=27%, L3=31%, L5=35%
3. If gear drops, call `rollQualityTier(level, seed, dangerMultiplier)`
4. **PROBLEM**: `getMaxTierForLevel(level<=10n)` returns 1, so `baseTierNum` is ALWAYS capped at 1 = 'common'
5. Common = 0 affixes (AFFIX_COUNT_BY_QUALITY). Result: **0% affixed gear from any T1 enemy**

### Crafting Path

To craft an affixed T1 item, player needs:
1. Recipe materials (e.g., 4x Copper Ore + 1x Rough Hide for a Longsword)
   - Copper Ore: gatherable from mountains/plains
   - Rough Hide: drops from animal/beast (weight 20n in loot table)
2. Lesser Essence (12% drop per kill from L1-10 enemies)
3. Modifier reagent (15% drop per kill from L1+ enemies, also gatherable at weight 1n)

Effort estimate for one crafted affixed T1 item:
- ~4-5 kills for Rough Hide (from animal/beast loot tables)
- ~3-5 gathering actions for Copper Ore
- ~8-9 kills for 1 Lesser Essence (12% chance)
- ~7 kills for 1 modifier reagent (15% chance)
- Total: roughly 15-20 kills + some gathering = moderate investment

### Target Rates

To balance drops vs crafting at ~equivalent effort around levels 3-5:
- The "per-kill affixed drop rate" needs to factor in BOTH gear drop chance AND quality tier chance
- At L3 fighting humanoids: ~31% gear drop * X% uncommon = target 5% affixed
  => X = ~16% uncommon chance at L3
- At L5 fighting humanoids: ~35% gear drop * Y% uncommon = target 15% affixed
  => Y = ~43% uncommon chance at L5 (too high -- but this is border region with danger 160)

### Proposed Formula

Instead of the hard maxTier cap blocking everything, introduce a level-scaled uncommon chance for T1 creatures:

When `maxTier === 1` and `dangerMultiplier` is provided:
- Calculate a base uncommon chance from enemy level: `levelPct = min(30, level * 5)`
  - L1: 5%, L2: 10%, L3: 15%, L4: 20%, L5: 25%, L6: 30%
- Add a danger bonus when dangerMultiplier > 120: `dangerBonus = floor((danger - 120) / 10)`
  - danger 100: +0, danger 130: +1, danger 160: +4, danger 200: +8
- Final uncommon chance = `levelPct + dangerBonus`, capped at 35%
- Roll against this for uncommon; otherwise common

Expected effective affixed rates (gear drop % * uncommon %):
- L1 animal (danger 100): 12% gear * 5% uncommon = 0.6% affixed
- L1 humanoid (danger 100): 27% gear * 5% uncommon = 1.4% affixed
- L2 beast (danger 100): 14% gear * 10% uncommon = 1.4% affixed
- L3 humanoid (danger 100): 31% gear * 15% uncommon = 4.7% affixed
- L3 beast (danger 160): 16% gear * 19% uncommon = 3.0% affixed
- L4 construct (danger 160): 22% gear * 24% uncommon = 5.3% affixed
- L5 humanoid (danger 160): 35% gear * 29% uncommon = 10.2% affixed
- L6 undead (danger 200): 24% gear * 35%(capped) uncommon = 8.4% affixed

These rates roughly match the user's targets: very low at L1-2, ramping up toward L5-6. The crafting path (15-20 kills) remains competitive with finding one naturally around L3-5.
</analysis>

<tasks>

<task type="auto">
  <name>Task 1: Add level-scaled uncommon chance for T1 creatures in rollQualityTier</name>
  <files>spacetimedb/src/helpers/items.ts</files>
  <action>
In `rollQualityTier()` (line 73), modify the danger-based tier selection block to handle the case where `baseTierNum` would be capped by `maxTier === 1` differently.

Currently lines 91-94 do:
```typescript
if (baseTierNum > maxTier) baseTierNum = maxTier;
const tierNames = ['common', 'uncommon', 'rare', 'epic'];
return tierNames[baseTierNum - 1] ?? 'common';
```

Replace the entire danger-based block (lines 76-95) with logic that:

1. Keeps the existing danger-based tier calculation (lines 78-88) as-is for maxTier >= 2.
2. When `maxTier === 1`, instead of hard-capping to common, calculate a level-scaled uncommon chance:
   - `const level = Number(creatureLevel);`
   - `const levelPct = Math.min(30, level * 5);` // L1=5%, L2=10%, ..., L6=30%
   - `const danger = Number(dangerMultiplier);`
   - `const dangerBonus = danger > 120 ? Math.floor((danger - 120) / 10) : 0;` // 0 at 100, +4 at 160, +8 at 200
   - `const uncommonChance = Math.min(35, levelPct + dangerBonus);`
   - Roll using existing seed pattern: `const uncommonRoll = Number((seedBase + 53n) % 100n);`
   - If `uncommonRoll < uncommonChance` return 'uncommon', else return 'common'
3. For maxTier >= 2, keep the existing logic unchanged (apply tier-up, cap at maxTier, return tier name).

The full replacement for the `if (dangerMultiplier !== undefined)` block should be:

```typescript
if (dangerMultiplier !== undefined) {
  const danger = Number(dangerMultiplier);

  // T1 creatures (maxTier 1): level-scaled uncommon chance instead of hard common cap
  if (maxTier === 1) {
    const level = Number(creatureLevel);
    const levelPct = Math.min(30, level * 5); // L1=5%, L2=10% ... L6=30%
    const dangerBonus = danger > 120 ? Math.floor((danger - 120) / 10) : 0;
    const uncommonChance = Math.min(35, levelPct + dangerBonus);
    const uncommonRoll = Number((seedBase + 53n) % 100n);
    return uncommonRoll < uncommonChance ? 'uncommon' : 'common';
  }

  // Higher-tier creatures: danger-based tier selection (unchanged)
  let baseTierNum: number;
  if (danger <= 120) baseTierNum = 1;        // common
  else if (danger <= 170) baseTierNum = 2;   // uncommon
  else if (danger <= 250) baseTierNum = 3;   // rare
  else if (danger <= 400) baseTierNum = 4;   // epic
  else baseTierNum = 4;                       // cap at epic

  // 12% tier-up chance, capped at epic
  const tierUpRoll = Number((seedBase + 47n) % 100n);
  if (tierUpRoll < 12 && baseTierNum < 4) baseTierNum += 1;

  // Respect creature level cap
  if (baseTierNum > maxTier) baseTierNum = maxTier;

  const tierNames = ['common', 'uncommon', 'rare', 'epic'];
  return tierNames[baseTierNum - 1] ?? 'common';
}
```

Do NOT modify the fallback level-based logic (lines 97-118) or any other functions.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify TypeScript compiles.

Manual verification of the math:
- L1, danger 100: levelPct=5, dangerBonus=0, uncommonChance=5 -> ~5% uncommon
- L3, danger 100: levelPct=15, dangerBonus=0, uncommonChance=15 -> ~15% uncommon
- L3, danger 160: levelPct=15, dangerBonus=4, uncommonChance=19 -> ~19% uncommon
- L5, danger 160: levelPct=25, dangerBonus=4, uncommonChance=29 -> ~29% uncommon
- L6, danger 200: levelPct=30, dangerBonus=8, uncommonChance=35(capped) -> ~35% uncommon
  </verify>
  <done>
rollQualityTier returns 'uncommon' at level-scaled rates for T1 creatures instead of always returning 'common'. The effective per-kill affixed drop rate (gear chance * uncommon chance) is:
- L1 enemies: ~0.6-1.4% (very rare, as intended)
- L3 enemies: ~3-5% (low but possible)
- L5 enemies: ~7-10% (noticeable, approaching crafting equivalence)
- L6 enemies: ~8-12% (competitive with crafting path)
TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add inline rate documentation comment to rollQualityTier</name>
  <files>spacetimedb/src/helpers/items.ts</files>
  <action>
Add a documentation comment block above the `rollQualityTier` function (before line 73) that documents the effective affixed drop rates for future reference and balance tuning. This replaces any existing JSDoc on the function.

```typescript
/**
 * Determines the quality tier of a dropped item.
 *
 * T1 creatures (level 1-10, maxTier=1): Level-scaled uncommon chance.
 *   uncommonChance = min(35, level*5 + dangerBonus)
 *   dangerBonus = max(0, floor((danger - 120) / 10))
 *
 *   Effective per-kill affixed rate (gear% * uncommon%):
 *     L1 danger 100: ~1%    | L3 danger 100: ~5%
 *     L3 danger 160: ~3-5%  | L5 danger 160: ~7-10%
 *     L6 danger 200: ~8-12%
 *
 *   Crafting equivalence: ~15-20 kills for materials + essence + reagent
 *   (matches finding affixed drop naturally around L3-5)
 *
 * T2+ creatures: Danger-based tier with 12% tier-up chance.
 *   danger <=120=common, 121-170=uncommon, 171-250=rare, 251-400=epic
 */
```

This is a documentation-only change to the same file modified in Task 1.
  </action>
  <verify>
Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify no compilation issues from the comment.
  </verify>
  <done>
The rollQualityTier function has inline documentation capturing the balance rationale and expected rates for future tuning reference.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation: `npx tsc --noEmit --project spacetimedb/tsconfig.json` passes
2. No other files modified -- the change is isolated to `rollQualityTier` in items.ts
3. The existing T2+ danger-based logic is completely unchanged
4. The fallback (non-danger) code path is completely unchanged
5. Spot-check seed arithmetic: `(seedBase + 53n) % 100n` uses a unique offset (53) not used elsewhere in the function (31, 37, 41, 43, 47 are taken)
</verification>

<success_criteria>
- rollQualityTier returns 'uncommon' for T1 creatures at level-scaled rates (5% at L1, scaling to 35% at L6+)
- T2+ creature quality tier logic is unchanged
- TypeScript compiles cleanly
- Balance documentation captures the rationale for future tuning
</success_criteria>

<output>
After completion, create `.planning/quick/180-validate-and-balance-affixed-t1-gear-dro/180-SUMMARY.md`
</output>
